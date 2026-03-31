import fetch from 'node-fetch';
import { query } from '../db';
import { config } from '../config';
import { buildExtractionPrompt, buildStage1EntitiesPrompt, buildStage2MappingPrompt } from '../llm/prompt';
import { parseStructuredOutput } from '../llm/schema';

/** Values treated as low-confidence / missing → normalize to "Not found" */
function isConsideredEmpty(s: string): boolean {
  const t = s.trim().toLowerCase();
  return (
    t === '' ||
    t === 'not found' ||
    t === 'n/a' ||
    t === 'na' ||
    t === 'none' ||
    t === 'null' ||
    t === '-'
  );
}

export interface BucketFieldItem {
  name: string;
  description?: string;
  ai_description?: string;
}

export interface TextJobPayload {
  type: 'text';
  userId: string;
  bucketId: string;
  noteId: string;
  originalText: string;
  /** Note creation timestamp used for resolving relative dates like "tomorrow"/"next Friday". */
  referenceDate?: string;
  /** IANA time zone for interpreting relative date/time references. */
  referenceTimezone?: string;
  bucketFields?: BucketFieldItem[];
}

interface OllamaGenerateResponse {
  response?: string;
}

const ERROR_STRUCTURED = { _error: 'Mapping failed. Check worker logs and that Ollama is running.' };
const OLLAMA_TIMEOUT_MS = 180_000;

const FEW_SHOT_LIMIT = 3;

/** Parse a clock time from free text (12h with am/pm, 24h, or after "at"). */
function parseTimeFromText(text: string): { hours: number; minutes: number } | undefined {
  const s = text;
  // H:MM am/pm (e.g. 10:30 AM, 2:05pm)
  let m = s.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 1 && h <= 12 && min >= 0 && min <= 59) {
      const ap = m[3].toLowerCase();
      if (ap === 'pm' && h !== 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      return { hours: h, minutes: min };
    }
  }
  // Ham/pm with optional space (e.g. 10AM, 10 am)
  m = s.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    if (h >= 1 && h <= 12) {
      const ap = m[2].toLowerCase();
      if (ap === 'pm' && h !== 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      return { hours: h, minutes: 0 };
    }
  }
  // 24-hour HH:MM (13:00–23:59 or 00:00–12:59 only when clearly time, e.g. after "at")
  m = s.match(/\b(?:at|@)\s*(\d{1,2}):(\d{2})\b/i);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return { hours: h, minutes: min };
    }
  }
  m = s.match(/\b(1[3-9]|2[0-3]):([0-5]\d)\b/);
  if (m) {
    return { hours: parseInt(m[1], 10), minutes: parseInt(m[2], 10) };
  }
  return undefined;
}

function formatYmdInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return date.toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getOffsetMinutes(utcDate: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(utcDate);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0';
  const m = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = parseInt(m[2], 10);
  const minutes = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

function combineYmdWithTimeInTimezone(ymd: string, tm: { hours: number; minutes: number }, timeZone: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const [y, mo, d] = parts;
  const guessUtcMs = Date.UTC(y, mo - 1, d, tm.hours, tm.minutes, 0, 0);
  const guessDate = new Date(guessUtcMs);
  const offset1 = getOffsetMinutes(guessDate, timeZone);
  const utc1 = guessUtcMs - offset1 * 60_000;
  const offset2 = getOffsetMinutes(new Date(utc1), timeZone);
  const utc2 = guessUtcMs - offset2 * 60_000;
  return new Date(utc2).toISOString();
}

/** Load recent user-corrected extractions for this bucket to use as few-shot examples. */
async function getFewShotExamples(bucketId: string): Promise<string> {
  const rows = await query<{ input_text: string; corrected_output: unknown }>(
    `SELECT input_text, corrected_output FROM ai_interactions
     WHERE bucket_id = $1 AND corrected_by_user = TRUE AND corrected_output IS NOT NULL
     ORDER BY created_at DESC
     LIMIT $2`,
    [bucketId, FEW_SHOT_LIMIT]
  );
  if (rows.length === 0) return '';
  return rows
    .map((r) => {
      const out = typeof r.corrected_output === 'string' ? r.corrected_output : JSON.stringify(r.corrected_output ?? {});
      return `Input: ${(r.input_text ?? '').slice(0, 500)}\nOutput: ${out}`;
    })
    .join('\n\n');
}

/** Call Ollama and return raw response text. Throws on network/parse error. */
async function callOllama(system: string | undefined, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const body: Record<string, unknown> = {
    model: config.ollamaModel,
    prompt,
    stream: false
  };
  if (system) body.system = system;

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    const msg = (err as Error)?.name === 'AbortError'
      ? `Ollama timeout after ${OLLAMA_TIMEOUT_MS}ms`
      : (err as Error)?.message ?? String(err);
    throw new Error(msg);
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Ollama ${res.status}: ${errBody || res.statusText}`);
  }
  const data = (await res.json()) as OllamaGenerateResponse;
  return (data?.response ?? '').trim();
}

/** Two-stage extraction: entities first, then map to bucket fields. */
async function runTwoStageExtraction(
  inputText: string,
  bucketFields: BucketFieldItem[],
  fewShotExamples: string,
  referenceDate?: string,
  referenceTimezone = 'UTC'
): Promise<Record<string, string | string[]> | null> {
  const stage1 = buildStage1EntitiesPrompt(inputText, referenceDate, referenceTimezone);
  const raw1 = await callOllama(stage1.system, stage1.prompt);
  const entities = parseStructuredOutput(raw1);
  if (!entities || Object.keys(entities).length === 0) {
    console.warn('[worker:text] Stage 1 returned no entities, falling back to single-stage');
    return null;
  }
  const stage1Json = JSON.stringify(entities);

  const stage2 = buildStage2MappingPrompt(inputText, stage1Json, {
    bucketFields,
    fewShotExamples: fewShotExamples || undefined,
    referenceDate,
    referenceTimezone
  });
  const raw2 = await callOllama(stage2.system, stage2.prompt);
  const mapped = parseStructuredOutput(raw2);
  return mapped as Record<string, string | string[]> | null;
}

export async function handleTextJob(job: TextJobPayload): Promise<void> {
  console.log('[worker:text] Start', job.noteId, 'tz=', job.referenceTimezone || 'UTC');
  let fewShotExamples = '';
  if (job.bucketId && job.bucketFields && job.bucketFields.length > 0) {
    fewShotExamples = await getFewShotExamples(job.bucketId);
  }

  let raw = '';
  const useTwoStage = job.bucketFields && job.bucketFields.length > 0;
  const referenceTimezone =
    job.referenceTimezone && isValidTimeZone(job.referenceTimezone) ? job.referenceTimezone : 'UTC';

  if (useTwoStage) {
    try {
      const twoStageResult = await runTwoStageExtraction(
        job.originalText,
        job.bucketFields!,
        fewShotExamples,
        job.referenceDate,
        referenceTimezone
      );
      if (twoStageResult !== null) {
        raw = JSON.stringify(twoStageResult);
      }
    } catch (err) {
      console.warn('[worker:text] Two-stage extraction failed, falling back to single-stage:', (err as Error)?.message ?? err);
    }
  }

  if (!raw) {
    const built = buildExtractionPrompt(job.originalText, {
      bucketFields: job.bucketFields,
      fewShotExamples: fewShotExamples || undefined,
      referenceDate: job.referenceDate,
      referenceTimezone
    });
    const body: Record<string, unknown> = {
      model: config.ollamaModel,
      prompt: built.prompt,
      stream: false
    };
    if (built.system) body.system = built.system;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(`${config.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeout);
      const msg = (err as Error)?.name === 'AbortError'
        ? `Ollama timeout after ${OLLAMA_TIMEOUT_MS}ms`
        : (err as Error)?.message ?? String(err);
      console.error('[worker:text] Ollama request error:', msg);
      await query(
        'UPDATE notes SET structured_json = $1, updated_at = now() WHERE id = $2',
        [ERROR_STRUCTURED, job.noteId]
      );
      return;
    }
    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[worker:text] Ollama request failed', res.status, res.statusText, errBody || '');
      await query(
        'UPDATE notes SET structured_json = $1, updated_at = now() WHERE id = $2',
        [ERROR_STRUCTURED, job.noteId]
      );
      return;
    }

    let data: OllamaGenerateResponse;
    try {
      data = (await res.json()) as OllamaGenerateResponse;
    } catch {
      console.error('[worker:text] Ollama response was not JSON');
      await query(
        'UPDATE notes SET structured_json = $1, updated_at = now() WHERE id = $2',
        [ERROR_STRUCTURED, job.noteId]
      );
      return;
    }

    raw = (data && data.response) || '';
  }

  let structured = parseStructuredOutput(raw) ?? { _raw: raw };

  if (job.bucketFields && job.bucketFields.length > 0) {
    const normalized = (key: string) =>
      key.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const bucketNormToName = new Map<string, string>(
      job.bucketFields.map((f) => [normalized(f.name), f.name])
    );
    const getCanonical = (modelKey: string): string | undefined => {
      const low = modelKey.toLowerCase();
      const norm = normalized(modelKey);
      if (bucketNormToName.has(low)) return bucketNormToName.get(low);
      if (bucketNormToName.has(norm)) return bucketNormToName.get(norm);
      // "Work order No" -> work_order_no; bucket work_order -> match if norm starts with bucket norm
      for (const [bucketNorm, name] of bucketNormToName) {
        if (norm.startsWith(bucketNorm) || bucketNorm.startsWith(norm)) return name;
      }
      return undefined;
    };
    const NOT_FOUND = 'Not found';
    const toNotFound = (val: string | string[]): string | string[] => {
      if (Array.isArray(val)) {
        const arr = val.map((s) => (typeof s === 'string' && isConsideredEmpty(s) ? NOT_FOUND : s));
        return arr.length === 0 ? NOT_FOUND : arr;
      }
      return typeof val === 'string' && isConsideredEmpty(val) ? NOT_FOUND : val;
    };
    const filtered: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(structured)) {
      if (k === '_raw') continue;
      if (typeof v !== 'string' && !Array.isArray(v)) continue;
      const canonical = getCanonical(k);
      if (canonical) filtered[canonical] = toNotFound(v);
    }
    if (Object.keys(filtered).length > 0) structured = filtered;

    // Deterministic fallback for relative dates ("tomorrow", "this friday", "next friday")
    // when date-like fields exist. This prevents obvious mapping mistakes against reference date.
    const ref = job.referenceDate ? new Date(job.referenceDate) : new Date();
    const textLower = job.originalText.toLowerCase();
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const toIsoDate = (d: Date) => formatYmdInTimeZone(d, referenceTimezone);
    const nextWeekday = (from: Date, targetDow: number, forceNextWeek = false): Date => {
      const result = new Date(from);
      const current = result.getDay();
      let delta = (targetDow - current + 7) % 7;
      if (forceNextWeek || delta === 0) delta += 7;
      result.setDate(result.getDate() + delta);
      return result;
    };
    const sameWeekWeekday = (from: Date, targetDow: number): Date => {
      const result = new Date(from);
      const current = result.getDay();
      const delta = (targetDow - current + 7) % 7;
      result.setDate(result.getDate() + delta);
      return result;
    };
    let resolvedRelativeDate: string | undefined;
    if (textLower.includes('tomorrow')) {
      const d = new Date(ref);
      d.setDate(d.getDate() + 1);
      resolvedRelativeDate = toIsoDate(d);
    } else if (/\btoday\b/.test(textLower)) {
      resolvedRelativeDate = toIsoDate(ref);
    }
    for (let i = 0; i < weekdays.length; i++) {
      const w = weekdays[i];
      if (new RegExp(`\\bnext\\s+week\\s+${w}\\b|\\bnext\\s+${w}\\b`).test(textLower)) {
        resolvedRelativeDate = toIsoDate(nextWeekday(ref, i, true));
        break;
      }
      if (
        new RegExp(`\\bthis\\s+week\\s+on\\s+${w}\\b|\\bthis\\s+week\\s+${w}\\b|\\bthis\\s+${w}\\b`).test(
          textLower
        )
      ) {
        resolvedRelativeDate = toIsoDate(sameWeekWeekday(ref, i));
        break;
      }
    }
    const parsedTime = parseTimeFromText(job.originalText);
    if (resolvedRelativeDate) {
      const valueForFields =
        parsedTime !== undefined
          ? combineYmdWithTimeInTimezone(resolvedRelativeDate, parsedTime, referenceTimezone)
          : resolvedRelativeDate;
      for (const field of job.bucketFields) {
        const n = field.name.toLowerCase();
        if (n.includes('date') || n.includes('day') || n.includes('schedule') || n.includes('time')) {
          structured[field.name] = valueForFields;
        }
      }
    }
  }

  await query(
    'UPDATE notes SET structured_json = $1, updated_at = now() WHERE id = $2',
    [structured, job.noteId]
  );
  console.log('[worker:text] Stored structured for note', job.noteId, Object.keys(structured).length, 'keys');

  await query(
    'INSERT INTO ai_interactions (user_id, bucket_id, input_text, llm_output, corrected_output, corrected_by_user) VALUES ($1, $2, $3, $4, NULL, FALSE)',
    [job.userId, job.bucketId, job.originalText, structured]
  );
}

