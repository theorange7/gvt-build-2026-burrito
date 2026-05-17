import { describe, expect, it } from 'vitest';
import { friendlyImportError } from '@/components/dashboard/importErrorMessages';

describe('friendlyImportError', () => {
  it('maps each known server error code to readable copy', () => {
    expect(friendlyImportError('unsupported-file-type')).toBe('File type not supported');
    expect(friendlyImportError('unreadable-file')).toBe('File could not be read');
    expect(friendlyImportError('empty-file')).toBe('File is empty');
    expect(friendlyImportError('extracted-text-too-large')).toBe('File is too large');
    expect(friendlyImportError('extract-failed')).toBe('Extraction failed');
    expect(friendlyImportError('import-failed')).toBe('Import failed');
    expect(friendlyImportError('upstream-error')).toBe('Service temporarily unavailable');
    expect(friendlyImportError('upstream-timeout')).toBe('Request timed out');
    expect(friendlyImportError('model-not-found')).toBe('Selected model unavailable');
    expect(friendlyImportError('invalid-response')).toBe('Unexpected response from service');
  });

  it('falls back to a generic message for unrecognised codes', () => {
    expect(friendlyImportError('some-future-server-code')).toBe('Import failed');
    expect(friendlyImportError('')).toBe('Import failed');
    expect(friendlyImportError('network-timeout')).toBe('Import failed');
  });

  it('never returns the raw code string', () => {
    const raw = 'extracted-text-too-large';
    expect(friendlyImportError(raw)).not.toBe(raw);
  });
});
