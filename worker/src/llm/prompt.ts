/**
 * Extraction prompt: when bucket fields are provided, only those keys are extracted.
 * Two-stage extraction: (1) extract entities from text, (2) map entities to bucket fields.
 */
export type BucketField = { name: string; description?: string; ai_description?: string };
const FIELD_HINT_MAX_CHARS = 220;

function fieldHint(f: BucketField): string {
  const raw = (f.ai_description?.trim() || f.description?.trim() || 'value from the text').replace(/\s+/g, ' ');
  return raw.length > FIELD_HINT_MAX_CHARS ? `${raw.slice(0, FIELD_HINT_MAX_CHARS)}...` : raw;
}

function toRefDateIso(referenceDate?: string, referenceTimezone = 'UTC'): string {
  const d = referenceDate ? new Date(referenceDate) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: referenceTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : d.toISOString().slice(0, 10);
}

function relativeDateGuidance(today: string): string {
  return `Relative date/time rules (reference date = ${today}):
- "today" => ${today}
- "tomorrow" => reference date + 1 day
- "this <weekday>" => nearest upcoming weekday in the current calendar week
- "next <weekday>" => the weekday in the following calendar week
- If a clock time appears (e.g. "10AM", "2:30 PM", "14:00"), combine it with the resolved calendar day for that field.
- Output format: use ISO 8601 when time is present (e.g. 2026-04-04T10:00:00.000Z). Use date-only YYYY-MM-DD when no time is stated.`;
}

/** Stage 1: Extract neutral entities/facts from text. No bucket-specific mapping. */
export function buildStage1EntitiesPrompt(
  inputText: string,
  referenceDate?: string,
  referenceTimezone = 'UTC'
): { system: string; prompt: string } {
  const today = toRefDateIso(referenceDate, referenceTimezone);
  const system = `You are a data extraction assistant. List all relevant entities and facts from the user's text.

Reference date is ${today}. Time zone is ${referenceTimezone}.
${relativeDateGuidance(today)}

Return a JSON object with exactly these keys (use arrays of strings; use empty array [] if none found):
- "people": all person names mentioned (e.g. driver, client, contact).
- "date_time": a single string for when (date/time). For relative refs like "tomorrow" or "2PM" compute from today (${today}); include time in ISO 8601 when stated. Empty string if not found.
- "locations": places, addresses, areas mentioned.
- "items": products, things to deliver, work order IDs, or other concrete items mentioned.
- "other": any other important facts (e.g. instructions, notes) as an array of strings.

Use ONLY information explicitly in the text. Do not invent. Return ONLY valid JSON. No markdown, no code blocks, no backticks.`;

  const prompt = `Text:\n${inputText}`;
  return { system, prompt };
}

/** Stage 2: Map extracted entities + original text to bucket fields. */
export function buildStage2MappingPrompt(
  inputText: string,
  stage1Json: string,
  options: { bucketFields: BucketField[]; fewShotExamples?: string; referenceDate?: string; referenceTimezone?: string }
): { system: string; prompt: string } {
  const tz = options.referenceTimezone || 'UTC';
  const today = toRefDateIso(options.referenceDate, tz);
  const fieldList = options.bucketFields
    .map((f) => {
      const hint = fieldHint(f);
      return `- "${f.name}": ${hint}`;
    })
    .join('\n');

  let system = `You are a precise data mapping assistant. Map the extracted entities below to the required bucket fields.

Reference date is ${today}. Time zone is ${tz}.
${relativeDateGuidance(today)}

You must return a JSON object with ONLY these keys (exact key names):
${fieldList}

Rules:
- You are given "Extracted entities" (from a first pass) and the "Original text". Use both to fill each field.
- Map entities to the correct field (e.g. client name → Client, driver name → Driver, product names → Products, place → Location, date/time → Date). Do NOT put the wrong type in a field (e.g. no work order ID in Driver).
- When information is clearly present (in entities or text), extract it. Use "Not found" ONLY when there is no matching information.
- For relative dates use today (${today}). Return ONLY valid JSON. No markdown, no code blocks, no backticks.`;

  if (options.fewShotExamples?.trim()) {
    system += `\n\nExamples of correct mappings:\n${options.fewShotExamples.trim()}`;
  }

  const prompt = `Extracted entities:\n${stage1Json}\n\nOriginal text:\n${inputText}`;
  return { system, prompt };
}

export type ExtractionPromptResult = { system: string; prompt: string } | { system?: undefined; prompt: string };

export function buildExtractionPrompt(
  inputText: string,
  options?: { bucketFields?: BucketField[]; fewShotExamples?: string; referenceDate?: string; referenceTimezone?: string }
): ExtractionPromptResult {
  const tz = options?.referenceTimezone || 'UTC';
  const today = toRefDateIso(options?.referenceDate, tz);

  if (options?.bucketFields && options.bucketFields.length > 0) {
    const fieldList = options.bucketFields
      .map((f) => {
        const hint = fieldHint(f);
        return `- "${f.name}": ${hint}`;
      })
      .join('\n');

    let system = `You are a precise data extraction assistant. Extract structured data from the user's text.

Reference date is ${today}. Time zone is ${tz}.
${relativeDateGuidance(today)}

You must return a JSON object with ONLY these keys (use the exact key names):
${fieldList}

Rules:
- Include every key listed above. Use ONLY information explicitly stated in the text. Do not invent or guess values.
- When the information for a field IS clearly present in the text, extract it. Do NOT output "Not found" for a field if the text clearly contains that information (e.g. if the text says "deliver to Ruth", Client is "Ruth"; if it says "pick up the 55inch Tv", Products is "55inch Tv"; if it says "Kevin" in a delivery context, Driver may be "Kevin").
- Use the value "Not found" ONLY when the text truly does not contain any information for that field. Missing or wrong-field mapping is worse than a careful extract when the info is there.
- Do not put information into the wrong field (e.g. do not put a work order ID into Driver). Use each field's description above to decide what belongs where.
- For relative dates (e.g. "today", "tomorrow") compute from today (${today}).
- When a time of day is stated (e.g. "10AM", "2:30 PM"), output ISO 8601 datetime for that field; otherwise date-only YYYY-MM-DD.
- Return ONLY valid JSON. No markdown, no code blocks, no backticks, no explanation.`;

    if (options?.fewShotExamples?.trim()) {
      system += `\n\nExamples of correct extractions (follow this format):\n${options.fewShotExamples.trim()}`;
    }

    const prompt = `Text to process:\n${inputText}`;
    return { system, prompt };
  }

  const base = `Reference date is ${today}. Time zone is ${tz}.
${relativeDateGuidance(today)}

Extract structured information from the text below. Return a JSON object.
- Use only information explicitly stated. Do NOT invent values (no placeholder IDs, no "Your Location", no guessed dates).
- For relative dates ("tomorrow", "next week") compute from today (${today}).
- Use clear keys: subject, date or dateTime, location, work_order, summary, action_items, etc. Use strings or arrays of strings.
- Return ONLY a single JSON object. No markdown, no code blocks, no backticks.`;

  const examples = options?.fewShotExamples
    ? `\n\nExamples of format (keys vary):\n${options.fewShotExamples}\n\n`
    : '\n\n';

  return { prompt: `${base}${examples}Text to process:\n${inputText}` };
}
