import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UnlockGate } from '@/components/unlock/UnlockGate';
import { hasActiveKey, lock } from '@/lib/local-store/crypto';
import { addContribution } from '@/lib/local-store/contributions';
import { clearSessionId, db, setSessionId } from '@/lib/local-store/db';
import { loadTestKey } from '../setup/key';
import { SAMPLE_CONTRIBUTIONS } from '../fixtures/contributions';

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UnlockGate>
        <div data-testid="protected">unlocked content</div>
      </UnlockGate>
    </QueryClientProvider>,
  );
}

// Simulate an already-validated invite session so tests bypass the invite gate
// and go straight to the passphrase setup / unlock screen.
// NOTE: clearSessionId is intentionally deferred to afterAll so the global
// afterEach (which clears DB tables) still operates on the test-session DB,
// not the default DB. Calling clearSessionId in afterEach would reset _instance
// before the global teardown runs, causing salt written in one test to leak
// into the next.
beforeEach(() => {
  setSessionId('test-session');
});

afterEach(() => {
  lock();
});

afterAll(() => {
  clearSessionId();
});

describe('<UnlockGate />', () => {
  it('shows the setup form on first launch (no salt yet)', async () => {
    renderGate();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /create your passphrase/i })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('completes setup, persists salt, and reveals children', async () => {
    const user = userEvent.setup();
    renderGate();

    await screen.findByRole('heading', { name: /create your passphrase/i });
    const fields = screen.getAllByPlaceholderText(/passphrase/i);
    await user.type(fields[0], 'a-strong-pass');
    await user.type(fields[1], 'a-strong-pass');
    await user.click(screen.getByRole('button', { name: /set passphrase/i }));

    await waitFor(() => expect(screen.getByTestId('protected')).toBeInTheDocument());
    expect(hasActiveKey()).toBe(true);

    const saltRow = await db().meta.get('kdfSalt');
    expect(saltRow?.value).toBeDefined();
  });

  it('rejects mismatched passphrase confirmation', async () => {
    const user = userEvent.setup();
    renderGate();

    await screen.findByRole('heading', { name: /create your passphrase/i });
    const fields = screen.getAllByPlaceholderText(/passphrase/i);
    await user.type(fields[0], 'a-strong-pass');
    await user.type(fields[1], 'different-pass');
    await user.click(screen.getByRole('button', { name: /set passphrase/i }));

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(hasActiveKey()).toBe(false);
  });

  it('rejects passphrases shorter than 8 characters', async () => {
    const user = userEvent.setup();
    renderGate();

    await screen.findByRole('heading', { name: /create your passphrase/i });
    const fields = screen.getAllByPlaceholderText(/passphrase/i);
    await user.type(fields[0], 'short');
    await user.type(fields[1], 'short');
    await user.click(screen.getByRole('button', { name: /set passphrase/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(hasActiveKey()).toBe(false);
  });

  it('shows the unlock form when a salt exists', async () => {
    const { salt } = await loadTestKey();
    await db().meta.put({ key: 'kdfSalt', value: Array.from(salt) });
    lock();

    renderGate();
    await waitFor(() => expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument());
  });

  it('rejects the wrong passphrase against existing encrypted data', async () => {
    const { salt } = await loadTestKey();
    await db().meta.put({ key: 'kdfSalt', value: Array.from(salt) });
    await addContribution(SAMPLE_CONTRIBUTIONS[0]);
    lock();

    renderGate();
    const user = userEvent.setup();
    const field = await screen.findByPlaceholderText(/^Passphrase$/i);
    await user.type(field, 'definitely-not-the-test-passphrase');
    await user.click(screen.getByRole('button', { name: /^unlock$/i }));

    expect(await screen.findByText(/wrong passphrase/i)).toBeInTheDocument();
    expect(hasActiveKey()).toBe(false);
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });
});
