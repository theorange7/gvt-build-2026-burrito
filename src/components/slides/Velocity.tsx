/* Design philosophy reminder: treat velocity as calm momentum, not cartoon speed. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame, type SlideVariant } from './SlideFrame';

export function Velocity({ content, mode, index, variant }: { content: SliceContent; mode: WrapMode; index: number; variant?: SlideVariant }) {
  return <SlideFrame content={content} mode={mode} index={index} label="VELOCITY" accent="#7c3aed" variant={variant} />;
}
