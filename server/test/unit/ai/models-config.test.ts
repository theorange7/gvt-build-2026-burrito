import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Reproduce the schema here so we can fuzz it without re-importing models.ts
// (which runs the side-effecting validation at import time against the real
// models.config.json). This mirrors what models.ts enforces.
const ParameterValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const ModelOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: z.enum(['anthropic', 'azure-foundry', 'ollama']),
  modelId: z.string().min(1),
  version: z.string().optional(),
  baseUrl: z.string().url().optional(),
  parameters: z.record(ParameterValueSchema).optional(),
});
const ConfigSchema = z.object({ models: z.array(ModelOptionSchema).min(1) });

describe("models.ts schema accepts 'ollama' and an optional baseUrl", () => {
  it("accepts provider: 'ollama' with required fields only", () => {
    const parsed = ModelOptionSchema.safeParse({
      id: 'ollama:llama3.1-8b',
      label: 'Llama 3.1 8B',
      provider: 'ollama',
      modelId: 'llama3.1:8b',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a baseUrl when it parses as a URL', () => {
    const parsed = ModelOptionSchema.safeParse({
      id: 'ollama:llama3.1-8b',
      label: 'l',
      provider: 'ollama',
      modelId: 'llama3.1:8b',
      baseUrl: 'http://localhost:11434',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a baseUrl that is not a valid URL', () => {
    const parsed = ModelOptionSchema.safeParse({
      id: 'ollama:bad',
      label: 'l',
      provider: 'ollama',
      modelId: 'llama3.1:8b',
      baseUrl: 'not a url',
    });
    expect(parsed.success).toBe(false);
  });

  it('treats baseUrl as optional on non-ollama entries too', () => {
    const parsed = ModelOptionSchema.safeParse({
      id: 'azure:something',
      label: 'l',
      provider: 'azure-foundry',
      modelId: 'gpt-x',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown provider', () => {
    const parsed = ModelOptionSchema.safeParse({
      id: 'unknown:x',
      label: 'l',
      provider: 'made-up',
      modelId: 'x',
    });
    expect(parsed.success).toBe(false);
  });

  it('the shipped models.config.json validates and ships zero ollama entries enabled', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const path = join(here, '..', '..', '..', 'src', 'ai', 'models.config.json');
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const parsed = ConfigSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    const ollama = (parsed.success ? parsed.data.models : []).filter(
      (m) => m.provider === 'ollama',
    );
    // Spec 60 No-go: ship no Ollama entry enabled by default. Operators opt in.
    expect(ollama).toHaveLength(0);
  });
});
