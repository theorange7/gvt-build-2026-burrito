'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PROVIDERS_CONFIG } from '@/lib/providers/config';
import { connectIdentityWithApiToken } from '@/lib/providers/orchestrator';

type AddProviderFormProps = {
  onConnected?: (identityId: string) => void;
};

export function AddProviderForm({ onConnected }: AddProviderFormProps) {
  const queryClient = useQueryClient();
  const providers = PROVIDERS_CONFIG.providers;
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '');
  const [instanceUrl, setInstanceUrl] = useState('https://');
  const [token, setToken] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const config = useMemo(() => providers.find((p) => p.id === providerId), [providers, providerId]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!config) throw new Error('Pick a provider.');
      const trimmedUrl = instanceUrl.trim().replace(/\/+$/, '');
      if (!/^https:\/\//i.test(trimmedUrl)) {
        throw new Error(
          'Instance URL must use HTTPS. The GitLab provider refuses to send a token over plaintext HTTP.',
        );
      }
      if (token.trim().length < 8) {
        throw new Error('Personal access token looks too short.');
      }
      return connectIdentityWithApiToken({
        providerId: config.id,
        instanceUrl: trimmedUrl,
        token: token.trim(),
      });
    },
    onSuccess: (result) => {
      setToken('');
      setValidationError(null);
      queryClient.invalidateQueries({ queryKey: ['identities'] });
      onConnected?.(result.identityId);
    },
  });

  const submitDisabled =
    mutation.isPending || token.trim().length < 1 || instanceUrl.trim().length < 1;

  return (
    <section className="rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)]/78 p-6">
      <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">Connect provider</p>
      <h3 className="mt-2 font-display text-2xl text-[color:var(--foreground)]">
        Add a contribution source.
      </h3>
      <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
        Tokens stay encrypted on this device. We only send the token in the
        Authorization header to the instance URL you specify, over HTTPS.
      </p>

      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setValidationError(null);
          if (!/^https:\/\//i.test(instanceUrl.trim())) {
            setValidationError(
              'Instance URL must use HTTPS. The GitLab provider refuses to send a token over plaintext HTTP.',
            );
            return;
          }
          mutation.mutate();
        }}
      >
        <label className="grid gap-2 text-sm">
          <span className="text-[color:var(--muted)]">Provider</span>
          <select
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
            className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-[color:var(--foreground)] outline-none focus:border-[color:var(--accent)]"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-[color:var(--muted)]">Instance URL</span>
          <input
            type="url"
            value={instanceUrl}
            onChange={(event) => setInstanceUrl(event.target.value)}
            placeholder="https://gitlab.example.com"
            className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-[color:var(--foreground)] outline-none focus:border-[color:var(--accent)]"
            required
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-[color:var(--muted)]">Personal access token</span>
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="glpat-…"
            className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-[color:var(--foreground)] outline-none focus:border-[color:var(--accent)]"
            required
          />
        </label>

        <p className="text-xs leading-5 text-[color:var(--muted)]">
          Generate a PAT in your GitLab profile with{' '}
          <code className="rounded bg-black/30 px-1 py-0.5">read_api</code> and{' '}
          <code className="rounded bg-black/30 px-1 py-0.5">read_user</code>.
        </p>

        {validationError ? (
          <p role="alert" className="text-sm text-[rgb(255,193,168)]">
            {validationError}
          </p>
        ) : null}
        {mutation.isError ? (
          <p role="alert" className="text-sm text-[rgb(255,193,168)]">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to connect.'}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-black transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </section>
  );
}
