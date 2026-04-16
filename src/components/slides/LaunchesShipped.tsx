/* Design philosophy reminder: this slide should feel like a published evidence plate for major launches. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame } from './SlideFrame';

export function LaunchesShipped({ content, mode, index }: { content: SliceContent; mode: WrapMode; index: number }) {
  return <SlideFrame content={content} mode={mode} index={index} label="LAUNCHES SHIPPED" accent="#ff6b35" />;
}
