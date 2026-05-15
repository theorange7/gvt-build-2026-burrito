/* Design philosophy reminder: collaboration style should read as social craft, not soft filler. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame, type SlideVariant } from './SlideFrame';

export function CollaborationStyle({ content, mode, index, variant }: { content: SliceContent; mode: WrapMode; index: number; variant?: SlideVariant }) {
  return <SlideFrame content={content} mode={mode} index={index} label="COLLABORATION STYLE" accent="#06b6d4" variant={variant} />;
}
