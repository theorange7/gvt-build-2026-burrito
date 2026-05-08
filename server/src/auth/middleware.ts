import type { HttpRequest } from '@azure/functions';
import { verifyInstallToken } from './jwt';

export class HttpAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpAuthError';
  }
}

export async function requireInstallToken(request: HttpRequest): Promise<{ installId: string }> {
  const auth = request.headers.get('authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new HttpAuthError(401, 'Missing bearer token');
  }
  try {
    return await verifyInstallToken(match[1]);
  } catch {
    throw new HttpAuthError(401, 'Invalid token');
  }
}
