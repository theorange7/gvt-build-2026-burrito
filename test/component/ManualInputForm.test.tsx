import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManualInputForm } from '@/components/dashboard/ManualInputForm';
import { listContributions } from '@/lib/local-store/contributions';
import { loadTestKey } from '../setup/key';

function rendered(open = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = () => {};
  return render(
    <QueryClientProvider client={client}>
      <ManualInputForm open={open} onClose={onClose} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await loadTestKey();
});

describe('<ManualInputForm />', () => {
  it('renders nothing when open=false', () => {
    rendered(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the form when open=true', () => {
    rendered();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add contribution/i })).toBeInTheDocument();
  });

  it('disables submit when text is empty', () => {
    rendered();
    expect(screen.getByRole('button', { name: /add contribution/i })).toBeDisabled();
  });

  it('enables submit once text is entered', async () => {
    const user = userEvent.setup();
    rendered();
    await user.type(screen.getByPlaceholderText(/describe a contribution/i), 'Shipped the auth migration.');
    expect(screen.getByRole('button', { name: /add contribution/i })).not.toBeDisabled();
  });

  it('saves a contribution to the local store on submit', async () => {
    const user = userEvent.setup();
    rendered();

    await user.type(screen.getByPlaceholderText(/describe a contribution/i), 'Led the Q4 planning retro.');
    await user.click(screen.getByRole('button', { name: /add contribution/i }));

    await waitFor(async () => {
      const contributions = await listContributions();
      expect(contributions.length).toBeGreaterThan(0);
    });

    const contributions = await listContributions();
    expect(contributions[0].rawData).toMatchObject({ source: 'manual', freeText: 'Led the Q4 planning retro.' });
  });

  it('shows success message after submission', async () => {
    const user = userEvent.setup();
    rendered();

    await user.type(screen.getByPlaceholderText(/describe a contribution/i), 'Reviewed three PRs from new engineers.');
    await user.click(screen.getByRole('button', { name: /add contribution/i }));

    await waitFor(() => {
      expect(screen.getByText(/contribution saved/i)).toBeInTheDocument();
    });
  });

  it('saves with user-selected category overriding AI classification', async () => {
    const user = userEvent.setup();
    rendered();

    await user.type(screen.getByPlaceholderText(/describe a contribution/i), 'Mentored a junior engineer.');
    await user.click(screen.getByRole('button', { name: /mentorship/i }));
    await user.click(screen.getByRole('button', { name: /add contribution/i }));

    await waitFor(async () => {
      const contributions = await listContributions();
      expect(contributions.length).toBeGreaterThan(0);
    });

    const contributions = await listContributions();
    expect(contributions[0].category).toBe('mentorship');
  });
});
