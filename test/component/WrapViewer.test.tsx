import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WrapViewer } from '@/components/wrap/WrapViewer';
import { saveWrap } from '@/lib/local-store/wraps';
import { loadTestKey } from '../setup/key';
import type { SliceContent, WrapMode } from '@/lib/types';

// WrapExperience relies on window.matchMedia which happy-dom doesn't implement.
// Mock it so WrapViewer tests can focus on data loading and routing logic.
vi.mock('@/components/wrap/WrapExperience', () => ({
  WrapExperience: ({ id, mode, title, slices }: { id: string; mode: WrapMode; title: string; slices: SliceContent[] }) => (
    <div data-testid="wrap-experience" data-id={id} data-mode={mode} data-title={title} data-slices={slices.length} />
  ),
}));

const SAMPLE_SLICES: SliceContent[] = [
  { sliceKey: 'launches_shipped', headline: 'Twelve launches.', body: 'Steady throughput all year.' },
  { sliceKey: 'velocity', headline: 'Deliberate cadence.', body: 'Consistent quarter over quarter.', stat: '38 PRs' },
];

beforeEach(async () => {
  await loadTestKey();
});

describe('<WrapViewer />', () => {
  it('renders loading state while wrap is being fetched', () => {
    // Render with an ID that doesn't exist yet — useLiveQuery returns undefined initially
    render(<WrapViewer id="nonexistent-id-loading" />);
    // The loading indicator contains "Loading wrap"
    expect(screen.getByText(/loading wrap/i)).toBeInTheDocument();
  });

  it('renders not-found state when wrap does not exist in the store', async () => {
    render(<WrapViewer id="does-not-exist" />);
    // After the live query resolves with null, shows the unavailable message
    await waitFor(() => {
      expect(screen.queryByText(/loading wrap/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/this wrap isn.t on this device/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toBeInTheDocument();
  });

  it('renders WrapExperience with correct id, mode, title, and slices when wrap exists', async () => {
    const wrap = await saveWrap({
      mode: 'year-end',
      windowStart: new Date('2026-01-01'),
      windowEnd: new Date('2026-12-31'),
      title: 'Your year, wrapped for work.',
      sliceContent: SAMPLE_SLICES,
    });

    render(<WrapViewer id={wrap.id} />);

    await waitFor(() => {
      expect(screen.getByTestId('wrap-experience')).toBeInTheDocument();
    });

    const el = screen.getByTestId('wrap-experience');
    expect(el.dataset.id).toBe(wrap.id);
    expect(el.dataset.mode).toBe('year-end');
    expect(el.dataset.title).toBe('Your year, wrapped for work.');
    expect(el.dataset.slices).toBe(String(SAMPLE_SLICES.length));
  });

  it('forwards snapshot mode correctly', async () => {
    const wrap = await saveWrap({
      mode: 'snapshot',
      windowStart: new Date('2026-10-01'),
      windowEnd: new Date('2026-12-31'),
      title: 'Your recent momentum, wrapped.',
      sliceContent: SAMPLE_SLICES,
    });

    render(<WrapViewer id={wrap.id} />);

    await waitFor(() => {
      expect(screen.getByTestId('wrap-experience')).toBeInTheDocument();
    });

    expect(screen.getByTestId('wrap-experience').dataset.mode).toBe('snapshot');
  });
});
