import { z } from 'zod';

export const ContributionSourceSchema = z.enum([
  'github',
  'jira',
  'slack',
  'confluence',
  'manual',
]);

export const ContributionCategorySchema = z.enum([
  'delivery',
  'collaboration',
  'mentorship',
  'process',
  'leadership',
  'other',
]);

export const WrapModeSchema = z.enum(['snapshot', 'year-end']);

export const SliceContentSchema = z.object({
  sliceKey: z.string().min(1),
  headline: z.string().min(1),
  body: z.string().min(1),
  stat: z.string().nullable().optional(),
  supporting: z.array(z.string()).nullable().optional(),
});

export const SliceContentArraySchema = z.array(SliceContentSchema);
export const RawDataSchema = z.record(z.string(), z.unknown());

export function parseDateInput(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function safeJsonParse<T>(value: string, schema: z.ZodType<T>) {
  try {
    const parsed = JSON.parse(value);
    const result = schema.safeParse(parsed);

    if (!result.success) {
      return {
        success: false as const,
        error: result.error,
      };
    }

    return {
      success: true as const,
      data: result.data,
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error : new Error('Invalid JSON payload.'),
    };
  }
}

export function zodErrorResponse(error: z.ZodError) {
  return {
    error: 'Validation failed.',
    details: error.flatten(),
  };
}
