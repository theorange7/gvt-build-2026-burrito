import type { ExternalIdentity, IdentityAdapter } from '../types';

/**
 * Strip everything that isn't alphanumeric, dash, or underscore; collapse
 * dashes; lowercase. The slug becomes the identity's `externalUserId`, so
 * re-uploads under the same label append to the same identity rather than
 * spawning a duplicate. The original label still lives in `displayName`
 * for the UI.
 */
export function slugifyLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.length > 0 ? slug : 'untitled';
}

export const fileUploadIdentity: IdentityAdapter = {
  async resolve({ tokens }): Promise<ExternalIdentity> {
    // The orchestrator threads the label through `tokens.accessToken` for
    // file-upload identities, since there's no remote API to resolve against.
    // `connectFileUploadIdentity` is the only caller; see orchestrator.ts.
    const label = tokens.accessToken && tokens.accessToken.length > 0
      ? tokens.accessToken
      : 'untitled';
    const slug = slugifyLabel(label);
    return {
      providerId: 'file-upload',
      instanceUrl: 'local',
      externalUserId: slug,
      displayName: label,
    };
  },
};
