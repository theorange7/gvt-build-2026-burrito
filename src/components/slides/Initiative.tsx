/* Design philosophy reminder: initiative should feel self-propelled and authored. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame } from './SlideFrame';

export function Initiative({ content, mode, index }: { content: SliceContent; mode: WrapMode; index: number }) {
  return <SlideFrame content={content} mode={mode} index={index} label="INITIATIVE" accent="#ec4899" />;
}
