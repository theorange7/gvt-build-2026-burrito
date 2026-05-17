import { afterAll, afterEach, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { server } from '../mocks/server';

process.env.ENV_MODE = 'local';
process.env.AZURE_TABLES_CONNECTION_STRING = 'fake-connection-string';
process.env.ServiceBusConnection =
  'Endpoint=sb://localhost:5672;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=fake;UseDevelopmentEmulator=true;';
// Spec 31 share viewer assets — point at the checked-in pre-built dist so
// tests can load the template + bundle without running esbuild first.
process.env.SHARE_VIEWER_DIST_DIR =
  process.env.SHARE_VIEWER_DIST_DIR ?? resolve(__dirname, '..', '..', '..', 'share-viewer', 'dist');

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
