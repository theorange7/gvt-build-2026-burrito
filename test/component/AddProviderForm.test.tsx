import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddProviderForm } from '@/components/settings/AddProviderForm';
import { hasProvider, registerProvider } from '@/lib/providers/registry';
import { gitlabDedicatedProvider } from '@/lib/providers/gitlab-dedicated';
import { gitlabCalls, clearGitlabCalls } from '../mocks/gitlab';
import { loadTestKey } from '../setup/key';

function rendered() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AddProviderForm />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await loadTestKey();
  if (!hasProvider('gitlab-dedicated')) {
    registerProvider(gitlabDedicatedProvider);
  }
  clearGitlabCalls();
});

afterEach(() => {});

describe('<AddProviderForm />', () => {
  it('rejects http:// instance URL inline without making a network call', async () => {
    const user = userEvent.setup();
    rendered();

    await user.type(
      screen.getByLabelText(/instance url/i),
      'http://gitlab.test.example.com',
    );
    await user.type(screen.getByLabelText(/personal access token/i), 'glpat-x');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    expect(await screen.findByText(/https/i)).toBeInTheDocument();
    expect(gitlabCalls).toHaveLength(0);
  });

  it('rejects an empty token', async () => {
    const user = userEvent.setup();
    rendered();
    await user.type(
      screen.getByLabelText(/instance url/i),
      'https://gitlab.test.example.com',
    );
    const submit = screen.getByRole('button', { name: /connect/i });
    expect(submit).toBeDisabled();
  });

  it('shows a helpful error when GitLab returns 401', async () => {
    const user = userEvent.setup();
    rendered();
    await user.type(
      screen.getByLabelText(/instance url/i),
      'https://gitlab.test.example.com',
    );
    await user.type(screen.getByLabelText(/personal access token/i), 'glpat-wrong');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(screen.getByText(/auth|401/i)).toBeInTheDocument());
  });
});
