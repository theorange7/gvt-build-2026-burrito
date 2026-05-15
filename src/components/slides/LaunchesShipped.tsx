/* Design philosophy reminder: this slide should feel like a published evidence plate for major launches. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame, type SlideVariant } from './SlideFrame';

export function LaunchesShipped({ content, mode, index, variant }: { content: SliceContent; mode: WrapMode; index: number; variant?: SlideVariant }) {
  return <SlideFrame content={content} mode={mode} index={index} label="LAUNCHES SHIPPED" accent="#ff6b35" variant={variant} />;
}
