/*
 * Contribution Provider contract.
 *
 * See docs/decisions/contribution-provider-pattern.md for the rationale.
 *
 * This file is type-only. Concrete adapter implementations live under
 * src/lib/providers/<id>/ and must not import from src/lib/local-store/*.
 * Storage is the orchestrator's job; providers receive parameters and return
 * data.
 */
import type { Contribution, ContributionCategory } from '@/lib/types';

export interface ContributionProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  readonly auth: AuthAdapter;
  readonly identity: IdentityAdapter;
  /**
   * Cursor-based remote sync. Mutually exclusive with `import` at the
   * registry level: a provider is either pull (sync) or push (import), never
   * both. See registry.ts for the runtime check.
   */
  readonly sync?: SyncAdapter;
  /**
   * One-shot file import. Used by the file-upload provider (spec 50): the
   * extraction happens server-side via the LLM, so there is no client-side
   * RawEvent stage to model — `run()` returns already-normalized rows.
   */
  readonly import?: ImportAdapter;
}

export interface ProviderCapabilities {
  requiresInstanceUrl: boolean;
  fixedInstanceUrl?: string;
  supportsRevocation: boolean;
  supportsIncrementalSync: boolean;
  /**
   * True for providers whose only ingest path is a file-upload import (spec
   * 50). The dashboard uses this to branch the connect UI between the
   * remote-token flow and the file-picker flow without reaching into the
   * adapter shape.
   */
  supportsFileImport?: boolean;
  defaultScopes: readonly string[];
}

export type AuthAdapter = OAuthPkceAdapter | ApiTokenAdapter | NoCredentialsAdapter;

/**
 * For providers that don't talk to a remote API on the user's behalf — the
 * file-upload provider is the canonical case. Connect flow just stores an
 * identity row keyed by a user-supplied label; nothing to validate, nothing
 * to refresh, nothing to revoke.
 */
export interface NoCredentialsAdapter {
  kind: 'none';
}

export interface OAuthPkceAdapter {
  kind: 'oauth-pkce';
  begin(args: {
    instanceUrl: string;
    redirectUri: string;
    scopes: readonly string[];
  }): Promise<{
    authorizationUrl: string;
    state: string;
    codeVerifier: string;
  }>;
  exchange(args: {
    instanceUrl: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<TokenSet>;
  refresh(args: { instanceUrl: string; tokens: TokenSet }): Promise<TokenSet>;
  revoke(args: { instanceUrl: string; tokens: TokenSet }): Promise<void>;
}

export interface ApiTokenAdapter {
  kind: 'api-token';
  validate(args: { instanceUrl: string; token: string }): Promise<TokenSet>;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes: readonly string[];
  obtainedAt: number;
}

export interface IdentityAdapter {
  resolve(args: {
    instanceUrl: string;
    tokens: TokenSet;
  }): Promise<ExternalIdentity>;
}

export interface ExternalIdentity {
  providerId: string;
  instanceUrl: string;
  externalUserId: string;
  username?: string;
  email?: string;
  displayName?: string;
  raw?: unknown;
}

export type SyncPageProgress = {
  page: number;           // 1-based page number just completed
  callsMade: number;      // cumulative calls this sync run
  eventsReceived: number; // cumulative raw events yielded so far
  rateLimitRemaining: number | null; // from last RateLimit-Remaining header
};

export interface SyncAdapter {
  run(args: {
    instanceUrl: string;
    identity: ExternalIdentity;
    tokens: TokenSet;
    cursor: SyncCursor | null;
    signal: AbortSignal;
    onTokensRefreshed?: (next: TokenSet) => Promise<void>;
    onProgress?: (progress: SyncPageProgress) => void;
  }): AsyncIterable<RawEvent>;
  normalize(args: {
    event: RawEvent;
    identity: ExternalIdentity;
  }): NormalizedContribution[];
  externalIdFor(event: RawEvent): string;
}

export type SyncCursor = Record<string, unknown> & { cursorVersion: number };

export interface ImportAdapter {
  run(args: {
    file: File;
    modelId: string;
    label: string;
    identity: ExternalIdentity;
    signal: AbortSignal;
  }): Promise<{
    contributions: NormalizedContribution[];
    rejectedRows: number;
  }>;
  externalIdFor(c: NormalizedContribution): string;
}

export interface RawEvent {
  type: string;
  occurredAt: number;
  payload: unknown;
}

/**
 * What a provider's normalize() returns. The orchestrator stamps `id`,
 * `userId`, `identityId`, and `createdAt` before persisting; providers
 * should not invent those.
 */
export type NormalizedContribution = Omit<
  Contribution,
  'id' | 'userId' | 'identityId' | 'createdAt'
> & {
  category: ContributionCategory;
};

export class ProviderAuthError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ProviderAuthError';
  }
}

export class ProviderTransientError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ProviderTransientError';
  }
}

export class ProviderRateLimitError extends ProviderTransientError {
  constructor(message: string, readonly retryAfterSeconds: number) {
    super(message, 429);
    this.name = 'ProviderRateLimitError';
  }
}
