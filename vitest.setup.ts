import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

vi.mock('framer-motion', () => {
  const createTag = (tag: string) =>
    React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ children, ...props }, ref) =>
      React.createElement(tag, { ...props, ref }, children),
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    motion: new Proxy(
      {},
      {
        get: (_, tag: string) => createTag(tag),
      },
    ),
  };
});

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(_: IntersectionObserverCallback, __?: IntersectionObserverInit) {}
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
  });

  if (typeof navigator !== 'undefined') {
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  }

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      value: MockIntersectionObserver,
    });

    Object.defineProperty(window, 'scrollTo', {
      writable: true,
      value: vi.fn(),
    });
  }

  if (typeof HTMLElement !== 'undefined') {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      writable: true,
      value: vi.fn(),
    });
  }
});

afterEach(() => {
  cleanup();
});
