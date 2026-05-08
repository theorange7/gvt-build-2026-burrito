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

export const enqueueWrapRequestSchema = z.object({
  jobId: z.string().uuid(),
  contributions: z.array(contributionForAiSchema),
  mode: wrapModeSchema,
  windowStart: z.string(),
  windowEnd: z.string(),
  modelId: z.string().optional(),
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
  z.object({ status: z.literal('complete'), sliceContent: z.array(sliceContentSchema) }),
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
