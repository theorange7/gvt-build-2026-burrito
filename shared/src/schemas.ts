/**
 * Zod schemas for everything that crosses the network. The client validates
 * outbound requests with the same schema the backend uses for inbound parsing.
 */
import { z } from 'zod';

export const contributionCategorySchema = z.enum([
  'delivery',
  'collaboration',
  'mentorship',
  'process',
  'leadership',
  'other',
]);

export const contributionForAiSchema = z.object({
  source: z.string().min(1),
  category: contributionCategorySchema,
  signal: z.string().min(1),
  rawData: z.record(z.unknown()),
  occurredAt: z.string(),
  weight: z.number().min(1).max(5),
});

export const wrapModeSchema = z.enum(['snapshot', 'year-end']);

// Share display name: opt-in title shown in the published bundle. Capped to
// 80 chars and stripped of control chars (server scrubs before persisting).
// Identifiers and email addresses are deliberately not validated out here —
// the user owns this string; we just guard against terminal/ANSI injection
// and oversized payloads.
const shareNameSchema = z
  .string()
  .max(80)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\x00-\x1f\x7f]*$/, 'control characters not allowed')
  .optional();

export const enqueueWrapRequestSchema = z.object({
  jobId: z.string().uuid(),
  contributions: z.array(contributionForAiSchema),
  mode: wrapModeSchema,
  windowStart: z.string(),
  windowEnd: z.string(),
  modelId: z.string().optional(),
  share: z.boolean().optional(),
  shareName: shareNameSchema,
});

export const sliceContentSchema = z.object({
  sliceKey: z.string(),
  headline: z.string(),
  body: z.string(),
  stat: z.string().nullable().optional(),
  supporting: z.array(z.string()).nullable().optional(),
});

export const jobStatusSchema = z.enum(['queued', 'running', 'complete', 'failed']);

export const enqueueWrapResponseSchema = z.object({
  jobId: z.string(),
  status: jobStatusSchema,
  busy: z.boolean().optional(),
});

export const getWrapResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['queued', 'running']), busy: z.boolean().optional() }),
  z.object({
    status: z.literal('complete'),
    sliceContent: z.array(sliceContentSchema),
    shareUrl: z.string().url().optional(),
    shareSlug: z.string().optional(),
  }),
  z.object({ status: z.literal('failed'), error: z.string() }),
]);

export const classifyRequestSchema = z.object({
  source: z.string().min(1).default('manual'),
  freeText: z.string().min(3),
});

export const classifyResponseSchema = z.object({
  signal: z.string(),
  category: contributionCategorySchema,
  weight: z.number().min(1).max(5),
});

export const registerResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.number(),
});

export const importedContributionSchema = z.object({
  source: z.string().min(1),
  category: contributionCategorySchema,
  signal: z.string().min(1),
  rawData: z.record(z.unknown()).optional().default({}),
  occurredAt: z.string().min(1),
  weight: z.number().min(1).max(5),
  externalId: z.string().optional(),
  externalUrl: z.string().optional(),
});

export const importMetaSchema = z.object({
  modelId: z.string().min(1),
  label: z.string().min(1).max(200),
});

export const importResponseSchema = z.object({
  contributions: z.array(importedContributionSchema),
  rejectedRows: z.number().int().nonnegative(),
});
