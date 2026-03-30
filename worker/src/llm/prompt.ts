/**
 * Extraction prompt: when bucket fields are provided, only those keys are extracted.
 * Two-stage extraction: (1) extract entities from text, (2) map entities to bucket fields.
 */
export type BucketField = { name: string; description?: string; ai_description?: string };

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/** Stage 1: Extract neutral entities/facts from text. No bucket-specific mapping. */
export function buildStage1EntitiesPrompt(inputText: string): { system: string; prompt: string } {
  const today = todayIso();
  const system = `You are a data extraction assistant. List all relevant entities and facts from the user's text.

Today's date is ${today}.

Return a JSON object with exactly these keys (use arrays of strings; use empty array [] if none found):
- "people": all person names mentioned (e.g. driver, client, contact).
- "date_time": a single string for when (date/time). For relative refs like "tomorrow" or "2PM" compute from today (${today}). Empty string if not found.
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
  options: { bucketFields: BucketField[]; fewShotExamples?: string }
): { system: string; prompt: string } {
  const today = todayIso();
  const fieldList = options.bucketFields
    .map((f) => {
      const hint = f.ai_description?.trim() || f.description?.trim() || 'value from the text';
      return `- "${f.name}": ${hint}`;
    })
    .join('\n');

  let system = `You are a precise data mapping assistant. Map the extracted entities below to the required bucket fields.

Today's date is ${today}.

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
  options?: { bucketFields?: BucketField[]; fewShotExamples?: string }
): ExtractionPromptResult {
  const today = todayIso();

  if (options?.bucketFields && options.bucketFields.length > 0) {
    const fieldList = options.bucketFields
      .map((f) => {
        const hint = f.ai_description?.trim() || f.description?.trim() || 'value from the text';
        return `- "${f.name}": ${hint}`;
      })
      .join('\n');

    let system = `You are a precise data extraction assistant. Extract structured data from the user's text.

Today's date is ${today}.

You must return a JSON object with ONLY these keys (use the exact key names):
${fieldList}

Rules:
- Include every key listed above. Use ONLY information explicitly stated in the text. Do not invent or guess values.
- When the information for a field IS clearly present in the text, extract it. Do NOT output "Not found" for a field if the text clearly contains that information (e.g. if the text says "deliver to Ruth", Client is "Ruth"; if it says "pick up the 55inch Tv", Products is "55inch Tv"; if it says "Kevin" in a delivery context, Driver may be "Kevin").
- Use the value "Not found" ONLY when the text truly does not contain any information for that field. Missing or wrong-field mapping is worse than a careful extract when the info is there.
- Do not put information into the wrong field (e.g. do not put a work order ID into Driver). Use each field's description above to decide what belongs where.
- For relative dates (e.g. "today", "tomorrow") compute from today (${today}).
- Return ONLY valid JSON. No markdown, no code blocks, no backticks, no explanation.`;

    if (options?.fewShotExamples?.trim()) {
      system += `\n\nExamples of correct extractions (follow this format):\n${options.fewShotExamples.trim()}`;
    }

    const prompt = `Text to process:\n${inputText}`;
    return { system, prompt };
  }

  const base = `Today's date is ${today}.

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
