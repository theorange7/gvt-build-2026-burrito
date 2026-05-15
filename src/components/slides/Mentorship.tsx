/* Design philosophy reminder: mentorship should feel warm, generous, and quietly consequential. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame, type SlideVariant } from './SlideFrame';

export function Mentorship({ content, mode, index, variant }: { content: SliceContent; mode: WrapMode; index: number; variant?: SlideVariant }) {
  return <SlideFrame content={content} mode={mode} index={index} label="MENTORSHIP" accent="#f59e0b" variant={variant} />;
}
