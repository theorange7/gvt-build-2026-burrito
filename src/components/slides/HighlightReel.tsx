/* Design philosophy reminder: the highlight reel should feel curated and consequential. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame, type SlideVariant } from './SlideFrame';

export function HighlightReel({ content, mode, index, variant }: { content: SliceContent; mode: WrapMode; index: number; variant?: SlideVariant }) {
  return <SlideFrame content={content} mode={mode} index={index} label="HIGHLIGHT REEL" accent="#f97316" variant={variant} />;
}
