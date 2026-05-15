/* Design philosophy reminder: initiative should feel self-propelled and authored. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame, type SlideVariant } from './SlideFrame';

export function Initiative({ content, mode, index, variant }: { content: SliceContent; mode: WrapMode; index: number; variant?: SlideVariant }) {
  return <SlideFrame content={content} mode={mode} index={index} label="INITIATIVE" accent="#ec4899" variant={variant} />;
}
