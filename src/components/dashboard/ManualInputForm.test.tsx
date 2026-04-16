import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManualInputForm } from './ManualInputForm';
import { renderWithQueryClient } from '@/test/renderWithQueryClient';

describe('ManualInputForm', () => {
  it('submits a contribution, resets, and closes on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'c1',
            userId: 'demo-user',
            source: 'manual',
            category: 'delivery',
            signal: 'Added a contribution.',
            rawData: {},
            occurredAt: new Date('2025-05-10T00:00:00.000Z').toISOString(),
            weight: 3,
            createdAt: new Date('2025-05-10T00:00:00.000Z').toISOString(),
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        }),
    );

    renderWithQueryClient(React.createElement(ManualInputForm, { userId: 'demo-user' }));

    fireEvent.click(screen.getByRole('button', { name: /add contribution/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe a contribution/i), {
      target: { value: 'Documented the new runbook.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^add contribution$/i }));

    await waitFor(() => {
      expect(screen.getByText(/contribution added to the timeline/i)).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText(/describe a contribution/i)).not.toBeInTheDocument();
  });

  it('shows an inline error when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Request failed.' }),
      }),
    );

    renderWithQueryClient(React.createElement(ManualInputForm, { userId: 'demo-user' }));

    fireEvent.click(screen.getByRole('button', { name: /add contribution/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe a contribution/i), {
      target: { value: 'Raised a blocker in standup.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^add contribution$/i }));

    expect(await screen.findByText(/request failed/i)).toBeInTheDocument();
  });
});
