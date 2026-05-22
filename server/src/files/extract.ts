/*
 * PRIVACY: File-content extraction for the /import path (spec 50).
 *
 * Routes raw upload bytes to the right text extractor based on filename
 * extension. Only the extracted text leaves this module — the raw bytes,
 * filename, and per-page structure are scoped to this call and never
 * logged. The same "no persistence, no disk, no queue" posture as the
 * caller (server/src/functions/import.ts) applies; this module imports
 * only the parsing libs and the extracted-text size constant.
 *
 * Supported types (extension-detected):
 *   .txt, .md    UTF-8 plaintext (strict — non-UTF-8 bytes → unreadable)
 *   .docx        mammoth.extractRawText → plain text
 */
import mammoth from 'mammoth';

// 256 KB raw byte cap is enforced upstream; this is the post-extraction
// text cap. A small .docx can decompress to noticeably more text, so we
// fail fast rather than silently truncating into the model's prompt.
export const MAX_EXTRACTED_TEXT_BYTES = 256 * 1024;

export type ExtractResult =
  | { kind: 'ok'; text: string }
  | { kind: 'error'; status: number; code: string };

export type SupportedExtension = 'txt' | 'md' | 'docx';

const ALLOWED_EXTENSIONS = new Set<SupportedExtension>(['txt', 'md', 'docx']);

export function detectExtension(filename: string): SupportedExtension | null {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext as SupportedExtension)
    ? (ext as SupportedExtension)
    : null;
}

export async function extractText(
  filename: string,
  bytes: Uint8Array,
): Promise<ExtractResult> {
  const ext = detectExtension(filename);
  if (!ext) {
    return { kind: 'error', status: 415, code: 'unsupported-file-type' };
  }

  let text: string;
  try {
    switch (ext) {
      case 'txt':
      case 'md':
        text = decodeUtf8Strict(bytes);
        break;
      case 'docx':
        text = await extractDocx(bytes);
        break;
    }
  } catch {
    return { kind: 'error', status: 415, code: 'unreadable-file' };
  }

  if (text.trim().length === 0) {
    return { kind: 'error', status: 400, code: 'empty-file' };
  }
  // UTF-8 byte length, not character length — a small char count of
  // wide unicode could still blow the model's input cap.
  if (new TextEncoder().encode(text).byteLength > MAX_EXTRACTED_TEXT_BYTES) {
    return { kind: 'error', status: 413, code: 'extracted-text-too-large' };
  }
  return { kind: 'ok', text };
}

function decodeUtf8Strict(bytes: Uint8Array): string {
  // `fatal: true` throws on invalid UTF-8, which the caller maps to 415.
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  // mammoth wants a Buffer; constructing one over the same memory is fine.
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}
