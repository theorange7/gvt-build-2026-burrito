'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
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

  const inputStyle: React.CSSProperties = {
    background: '#ffffff',
    border: '2px solid #0A0A0A',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#0A0A0A',
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '14px',
    outline: 'none',
    width: '100%',
  };

  const monoLabelStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#0A0A0A',
    opacity: 0.7,
  };

  return (
    <section
      className="rounded-[20px] p-6"
      style={{
        background: '#FBF5E5',
        border: '2px solid #0A0A0A',
        boxShadow: '4px 4px 0 #0A0A0A',
      }}
    >
      <p style={monoLabelStyle}>Connect provider</p>
      <h3
        className="mt-2"
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#0A0A0A',
        }}
      >
        Add a contribution source.
      </h3>
      <p
        className="mt-2 text-sm leading-6"
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          color: '#0A0A0A',
          opacity: 0.65,
        }}
      >
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
          <span style={monoLabelStyle}>Provider</span>
          <select
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
            style={inputStyle}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span style={monoLabelStyle}>Instance URL</span>
          <input
            type="url"
            value={instanceUrl}
            onChange={(event) => setInstanceUrl(event.target.value)}
            placeholder="https://gitlab.example.com"
            style={inputStyle}
            required
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span style={monoLabelStyle}>Personal access token</span>
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="glpat-…"
            style={inputStyle}
            required
          />
        </label>

        <p
          className="text-xs leading-5"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: '#0A0A0A',
            opacity: 0.6,
          }}
        >
          Generate a PAT in your GitLab profile with{' '}
          <code
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: '#ffffff',
              border: '1px solid #0A0A0A',
              borderRadius: '4px',
              padding: '1px 5px',
            }}
          >
            read_api
          </code>{' '}
          and{' '}
          <code
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: '#ffffff',
              border: '1px solid #0A0A0A',
              borderRadius: '4px',
              padding: '1px 5px',
            }}
          >
            read_user
          </code>
          .
        </p>

        {validationError ? (
          <p
            role="alert"
            style={{
              fontSize: '13px',
              color: '#FF4D2E',
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {validationError}
          </p>
        ) : null}
        {mutation.isError ? (
          <p
            role="alert"
            style={{
              fontSize: '13px',
              color: '#FF4D2E',
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to connect.'}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitDisabled}
          className="transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            background: '#FF4D2E',
            border: '2px solid #0A0A0A',
            boxShadow: '3px 3px 0 #0A0A0A',
            borderRadius: '8px',
            padding: '12px 20px',
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '14px',
            fontWeight: 700,
            color: '#0A0A0A',
            cursor: submitDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {mutation.isPending ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </section>
  );
}
