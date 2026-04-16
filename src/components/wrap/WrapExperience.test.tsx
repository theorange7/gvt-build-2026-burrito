import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WrapExperience } from './WrapExperience';
import type { SliceContent } from '@/lib/types';
import { renderWithQueryClient } from '@/test/renderWithQueryClient';

const slices: SliceContent[] = [
  {
    sliceKey: 'unknown_slice',
    headline: 'Still moving.',
    body: 'You kept important work visible across the quarter.',
    stat: '4 wins',
    supporting: null,
  },
];

describe('WrapExperience', () => {
  it('renders a fallback slide for an unmapped slice key', () => {
    renderWithQueryClient(
      React.createElement(WrapExperience, {
        id: 'wrap-1',
        mode: 'snapshot',
        title: 'Your recent momentum, wrapped.',
        slices,
      }),
    );

    expect(screen.getByText(/still moving/i)).toBeInTheDocument();
    expect(screen.getByText(/unknown slice/i)).toBeInTheDocument();
  });

  it('shows share feedback after copying the current URL', async () => {
    vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);

    renderWithQueryClient(
      React.createElement(WrapExperience, {
        id: 'wrap-1',
        mode: 'snapshot',
        title: 'Your recent momentum, wrapped.',
        slices,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    await waitFor(() => {
      expect(screen.getByText(/link copied/i)).toBeInTheDocument();
    });
  });
});
