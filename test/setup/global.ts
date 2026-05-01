import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { server } from '../mocks/server';
import { lock } from '@/lib/local-store/crypto';
import { db } from '@/lib/local-store/db';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  if (typeof window !== 'undefined' && !navigator.storage) {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: vi.fn().mockResolvedValue(true), persisted: vi.fn().mockResolvedValue(true) },
    });
  }
});

afterEach(async () => {
  cleanup();
  server.resetHandlers();
  lock();
  try {
    const instance = db();
    await instance.contributions.clear();
    await instance.wraps.clear();
    await instance.meta.clear();
  } catch {
    // db may not have been opened
  }
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.useRealTimers();
});
