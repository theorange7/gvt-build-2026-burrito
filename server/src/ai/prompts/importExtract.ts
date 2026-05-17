/*
 * PRIVACY: This module builds the prompt sent to the LLM for file-import
 * extraction (POST /import). The file contents do flow into `userMessage`,
 * which is the only path that egresses the user's data — the rest of the
 * import pipeline (server/src/functions/import.ts) processes the response
 * in memory and discards it. Do not log `userMessage`, `fileText`, or the
 * label; the privacy invariants forbid it.
 */
import type { ImportedContribution } from '@wrapped/shared';

export const IMPORT_EXTRACT_SYSTEM_PROMPT =
  `You are an extraction engine for "Wrapped for Work". The user has uploaded a
file of work they did over some period (could be commits, tickets, notes,
chat snippets, a spreadsheet export, anything text-based). Your job is to
extract each individual contribution as a structured row.

Respond ONLY with valid JSON. No preamble, no markdown, no explanation. The
response must be a single JSON object with one key, "contributions", whose
value is an array of contribution objects.

Each contribution object MUST have:
- "signal": 1-2 sentence plain-English summary of what the person contributed.
- "source": short lowercase string describing where this came from. Common
  values: "github", "gitlab", "jira", "linear", "slack", "confluence",
  "manual". Choose what best matches the file content; "manual" is the
  fallback.
- "category": one of "delivery" | "collaboration" | "mentorship" | "process"
  | "leadership" | "other".
- "occurredAt": ISO 8601 timestamp. If the file gives only a date, use
  midnight UTC ("YYYY-MM-DDT00:00:00Z"). If no date is present anywhere for
  a row, omit the row entirely — do not invent dates.
- "weight": integer 1-5. 5=major impact (launched feature, led migration),
  4=significant (substantial PR, important doc, cross-team coordination),
  3=solid contribution (normal PR, helpful review), 2=minor (small fix,
  brief review), 1=minimal (tiny fix, one-line change).
- "externalId": stable string. Use a natural id from the source when one is
  obvious (PR number, ticket key, commit sha). Otherwise synthesize a stable
  short hash-like string from the signal + occurredAt so re-uploads dedupe.

Each contribution object MAY have:
- "rawData": small JSON object with any extra fields from the source row.
  Keep it under ~500 bytes. Omit if there is nothing useful.
- "externalUrl": full URL if the file contains one for this row.

Drop rows that are obviously not contributions (file headers, blank lines,
comment-only rows). If the entire file is unintelligible, return
{"contributions": []}. Do not invent contributions; only extract what is
actually present in the file.`;

export function buildImportExtractPrompt(args: {
  label: string;
  fileText: string;
}): string {
  return [
    `Context: ${args.label}`,
    '',
    'File contents follow between the BEGIN/END markers.',
    '--- BEGIN FILE ---',
    args.fileText,
    '--- END FILE ---',
    '',
    'Respond with a single JSON object: { "contributions": [ ... ] }.',
  ].join('\n');
}

/**
 * Parses the model's raw JSON output. Tolerates either a bare array or the
 * documented `{ contributions: [...] }` wrapper. Returns `null` if the body
 * isn't parseable JSON of a recognizable shape — the caller turns that into
 * a 502.
 */
export function parseExtractedContributions(raw: string): unknown[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && 'contributions' in parsed) {
    const list = (parsed as { contributions: unknown }).contributions;
    if (Array.isArray(list)) return list;
  }
  return null;
}

export type { ImportedContribution };
