/* Design philosophy reminder: identity is the final editorial verdict on how the year felt. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame } from './SlideFrame';

export function Identity({ content, mode, index }: { content: SliceContent; mode: WrapMode; index: number }) {
  return <SlideFrame content={content} mode={mode} index={index} label="IDENTITY" accent="#8b5cf6" />;
}
