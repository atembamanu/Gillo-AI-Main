import { z } from 'zod';

/**
 * Flexible schema: structured output can have any keys.
 * Values are string or array of strings so the dynamic form can edit them.
 */
export const StructuredOutputSchema = z.record(
  z.union([z.string(), z.array(z.string())])
);

export type StructuredOutput = z.infer<typeof StructuredOutputSchema>;

function extractJsonString(s: string): string {
  let cleaned = s.trim();
  // Strip markdown code fence: ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  // If still no valid JSON, try to take the first { ... } segment
  const start = cleaned.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    let end = -1;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) cleaned = cleaned.slice(start, end + 1);
  }
  return cleaned;
}

/** Try to fix common LLM JSON issues: trailing commas, missing closing brace */
function tryFixJson(s: string): string {
  let fixed = s.trim();
  // Remove trailing comma before } or ]
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  // If no closing brace, append one (truncated output)
  const open = (fixed.match(/\{/g) || []).length;
  const close = (fixed.match(/\}/g) || []).length;
  if (open > close) {
    for (let i = 0; i < open - close; i++) fixed += '}';
  }
  return fixed;
}

export function parseStructuredOutput(raw: string): StructuredOutput | null {
  const cleaned = extractJsonString(raw);
  const attempts = [cleaned, tryFixJson(cleaned)];
  for (const str of attempts) {
    try {
      const parsed = JSON.parse(str);
      return StructuredOutputSchema.parse(parsed) as StructuredOutput;
    } catch {
      continue;
    }
  }
  return null;
}
