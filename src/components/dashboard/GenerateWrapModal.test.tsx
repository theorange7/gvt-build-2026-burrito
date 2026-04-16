import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenerateWrapModal } from './GenerateWrapModal';
import { renderWithQueryClient } from '@/test/renderWithQueryClient';

describe('GenerateWrapModal', () => {
  it('blocks invalid snapshot windows before sending a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderWithQueryClient(React.createElement(GenerateWrapModal, { userId: 'demo-user' }));

    fireEvent.click(screen.getByRole('button', { name: /generate wrap/i }));

    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: '2025-06-30' } });
    fireEvent.change(screen.getByLabelText(/to/i), { target: { value: '2025-04-01' } });

    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    expect(await screen.findByText(/choose a valid snapshot window/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a wrap link when generation succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jobId: 'job-123' }),
      }),
    );

    renderWithQueryClient(React.createElement(GenerateWrapModal, { userId: 'demo-user' }));

    fireEvent.click(screen.getByRole('button', { name: /generate wrap/i }));
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /view wrap/i })).toHaveAttribute('href', '/wrap/job-123');
    });
  });
});
