/* Design philosophy reminder: treat velocity as calm momentum, not cartoon speed. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame } from './SlideFrame';

export function Velocity({ content, mode, index }: { content: SliceContent; mode: WrapMode; index: number }) {
  return <SlideFrame content={content} mode={mode} index={index} label="VELOCITY" accent="#7c3aed" />;
}
