/* Design philosophy reminder: deep work is the quiet plateau where focus accumulates. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame } from './SlideFrame';

export function DeepWorkStreak({ content, mode, index }: { content: SliceContent; mode: WrapMode; index: number }) {
  return <SlideFrame content={content} mode={mode} index={index} label="DEEP WORK STREAK" accent="#10b981" />;
}
