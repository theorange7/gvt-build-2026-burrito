/*
 * PRIVACY: The file-upload provider is the one provider that egresses raw
 * user file content (spec 50). The file leaves the browser as a multipart
 * body to the server's POST /import; the server forwards it to the chosen
 * LLM and discards both the file and the model response immediately. The
 * UI mandates a non-collapsible egress disclosure naming the chosen model
 * provider before the upload kicks off. This module:
 *   - does NOT import from src/lib/local-store/* (only the orchestrator
 *     touches storage),
 *   - does NOT log file content, label, or the model response,
 *   - does NOT cache or persist any part of the upload client-side.
 */
import { registerProvider } from '../registry';
import type { ContributionProvider } from '../types';
import { fileUploadAuth } from './auth';
import { fileUploadIdentity } from './identity';
import { fileUploadImport } from './import';

export const fileUploadProvider: ContributionProvider = {
  id: 'file-upload',
  displayName: 'Import from file',
  capabilities: {
    requiresInstanceUrl: false,
    supportsRevocation: false,
    supportsIncrementalSync: false,
    supportsFileImport: true,
    defaultScopes: [],
  },
  auth: fileUploadAuth,
  identity: fileUploadIdentity,
  import: fileUploadImport,
};

registerProvider(fileUploadProvider);
