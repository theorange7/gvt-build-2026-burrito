/* Design philosophy reminder: the highlight reel should feel curated and consequential. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame } from './SlideFrame';

export function HighlightReel({ content, mode, index }: { content: SliceContent; mode: WrapMode; index: number }) {
  return <SlideFrame content={content} mode={mode} index={index} label="HIGHLIGHT REEL" accent="#f97316" />;
}
