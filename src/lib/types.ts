/**
 * Domain types. The shapes shared with the backend (Contribution,
 * SliceContent, WrapMode, etc.) live in `@wrapped/shared` so both deployables
 * import the same source of truth. This file re-exports them and adds
 * client-only types.
 */
export * from '@wrapped/shared';

import type { ContributionCategory } from '@wrapped/shared';

export type ManualContributionInput = {
  freeText: string;
  occurredAt?: Date;
  category?: ContributionCategory;
};
