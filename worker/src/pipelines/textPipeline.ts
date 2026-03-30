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
  bucketFields?: BucketFieldItem[];
}

interface OllamaGenerateResponse {
  response?: string;
}

const ERROR_STRUCTURED = { _error: 'Mapping failed. Check worker logs and that Ollama is running.' };

const FEW_SHOT_LIMIT = 3;

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
  const body: Record<string, unknown> = {
    model: config.ollamaModel,
    prompt,
    stream: false
  };
  if (system) body.system = system;

  const res = await fetch(`${config.ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
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
  fewShotExamples: string
): Promise<Record<string, string | string[]> | null> {
  const stage1 = buildStage1EntitiesPrompt(inputText);
  const raw1 = await callOllama(stage1.system, stage1.prompt);
  const entities = parseStructuredOutput(raw1);
  if (!entities || Object.keys(entities).length === 0) {
    console.warn('[worker:text] Stage 1 returned no entities, falling back to single-stage');
    return null;
  }
  const stage1Json = JSON.stringify(entities);

  const stage2 = buildStage2MappingPrompt(inputText, stage1Json, {
    bucketFields,
    fewShotExamples: fewShotExamples || undefined
  });
  const raw2 = await callOllama(stage2.system, stage2.prompt);
  const mapped = parseStructuredOutput(raw2);
  return mapped as Record<string, string | string[]> | null;
}

export async function handleTextJob(job: TextJobPayload): Promise<void> {
  let fewShotExamples = '';
  if (job.bucketId && job.bucketFields && job.bucketFields.length > 0) {
    fewShotExamples = await getFewShotExamples(job.bucketId);
  }

  let raw = '';
  const useTwoStage = job.bucketFields && job.bucketFields.length > 0;

  if (useTwoStage) {
    try {
      const twoStageResult = await runTwoStageExtraction(
        job.originalText,
        job.bucketFields!,
        fewShotExamples
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
      fewShotExamples: fewShotExamples || undefined
    });
    const body: Record<string, unknown> = {
      model: config.ollamaModel,
      prompt: built.prompt,
      stream: false
    };
    if (built.system) body.system = built.system;

    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(`${config.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (err) {
      console.error('[worker:text] Ollama request error (e.g. connection refused):', (err as Error)?.message ?? err);
      await query(
        'UPDATE notes SET structured_json = $1, updated_at = now() WHERE id = $2',
        [ERROR_STRUCTURED, job.noteId]
      );
      return;
    }

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

