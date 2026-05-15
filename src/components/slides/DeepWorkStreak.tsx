/* Design philosophy reminder: deep work is the quiet plateau where focus accumulates. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame, type SlideVariant } from './SlideFrame';

export function DeepWorkStreak({ content, mode, index, variant }: { content: SliceContent; mode: WrapMode; index: number; variant?: SlideVariant }) {
  return <SlideFrame content={content} mode={mode} index={index} label="DEEP WORK STREAK" accent="#10b981" variant={variant} />;
}
