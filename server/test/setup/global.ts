import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '../mocks/server';

process.env.ENV_MODE = 'local';
process.env.AZURE_TABLES_CONNECTION_STRING = 'fake-connection-string';
process.env.ServiceBusConnection =
  'Endpoint=sb://localhost:5672;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=fake;UseDevelopmentEmulator=true;';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
