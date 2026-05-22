import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectExtension,
  extractText,
  MAX_EXTRACTED_TEXT_BYTES,
} from '../../src/files/extract';

const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

describe('detectExtension', () => {
  it('returns the lowercased extension for supported types', () => {
    expect(detectExtension('notes.txt')).toBe('txt');
    expect(detectExtension('NOTES.MD')).toBe('md');
    expect(detectExtension('Q1.Docx')).toBe('docx');
  });

  it('returns null for unsupported types and missing extensions', () => {
    expect(detectExtension('archive.zip')).toBeNull();
    expect(detectExtension('image.png')).toBeNull();
    expect(detectExtension('report.pdf')).toBeNull();
    expect(detectExtension('noext')).toBeNull();
  });
});

describe('extractText — plaintext', () => {
  it('decodes UTF-8 .txt', async () => {
    const bytes = new TextEncoder().encode('Shipped login redesign on 2026-02-01.');
    const result = await extractText('notes.txt', bytes);
    expect(result).toEqual({ kind: 'ok', text: 'Shipped login redesign on 2026-02-01.' });
  });

  it('decodes UTF-8 .md and preserves markdown punctuation', async () => {
    const bytes = new TextEncoder().encode('# Standups\n\n- shipped X\n- reviewed Y');
    const result = await extractText('standups.md', bytes);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.text).toContain('# Standups');
  });

  it('rejects invalid UTF-8 as unreadable', async () => {
    // Lone continuation byte — invalid UTF-8.
    const bytes = new Uint8Array([0xff, 0xfe, 0xfd]);
    const result = await extractText('weird.txt', bytes);
    expect(result).toEqual({ kind: 'error', status: 415, code: 'unreadable-file' });
  });

  it('rejects an empty file', async () => {
    const result = await extractText('empty.txt', new Uint8Array());
    expect(result).toEqual({ kind: 'error', status: 400, code: 'empty-file' });
  });
});

describe('extractText — docx', () => {
  it('pulls plain text out of a valid .docx', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURE_DIR, 'sample.docx')));
    const result = await extractText('sample.docx', bytes);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.text).toContain('Shipped login redesign');
      expect(result.text).toContain('Reviewed payments PR');
      expect(result.text).toContain('Wrote runbook for incident-response');
    }
  });

  it('rejects a non-docx blob saved with a .docx extension', async () => {
    const bytes = new TextEncoder().encode('this is plain text, not a docx');
    const result = await extractText('fake.docx', bytes);
    expect(result).toEqual({ kind: 'error', status: 415, code: 'unreadable-file' });
  });
});

describe('extractText — unsupported types', () => {
  it('rejects .pdf with unsupported-file-type', async () => {
    const result = await extractText('report.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(result).toEqual({ kind: 'error', status: 415, code: 'unsupported-file-type' });
  });

  it('rejects files with no extension', async () => {
    const result = await extractText('readme', new TextEncoder().encode('hi'));
    expect(result).toEqual({ kind: 'error', status: 415, code: 'unsupported-file-type' });
  });
});

describe('extractText — size cap', () => {
  it('rejects text that exceeds the extracted-text cap', async () => {
    const bytes = new TextEncoder().encode('a'.repeat(MAX_EXTRACTED_TEXT_BYTES + 1));
    const result = await extractText('big.txt', bytes);
    expect(result).toEqual({ kind: 'error', status: 413, code: 'extracted-text-too-large' });
  });
});
