import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BackfillRangePicker } from '@/components/settings/BackfillRangePicker';
import { addImportedRange } from '@/lib/local-store/importedRanges';
import { loadTestKey } from '../setup/key';

function rendered(identityId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BackfillRangePicker identityId={identityId} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await loadTestKey();
});

describe('<BackfillRangePicker />', () => {
  it('flags a fully covered range as a no-op', async () => {
    await addImportedRange(
      'identity-1',
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-12-31T00:00:00Z'),
    );

    const user = userEvent.setup();
    rendered('identity-1');

    const start = await screen.findByLabelText(/start/i);
    const end = screen.getByLabelText(/end/i);
    await user.clear(start);
    await user.type(start, '2025-04-01');
    await user.clear(end);
    await user.type(end, '2025-05-01');

    expect(await screen.findByText(/already (covered|stored|imported)|will skip/i)).toBeInTheDocument();
  });

  it('describes the gaps when a range is partially covered', async () => {
    await addImportedRange(
      'identity-1',
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-02-01T00:00:00Z'),
    );

    const user = userEvent.setup();
    rendered('identity-1');

    const start = await screen.findByLabelText(/start/i);
    const end = screen.getByLabelText(/end/i);
    await user.clear(start);
    await user.type(start, '2025-01-15');
    await user.clear(end);
    await user.type(end, '2025-03-01');

    expect(await screen.findByText(/gap|will fetch|uncovered/i)).toBeInTheDocument();
  });
});
