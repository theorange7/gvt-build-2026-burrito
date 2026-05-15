/* Design philosophy reminder: consistency should celebrate rhythm and durability over spectacle. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame, type SlideVariant } from './SlideFrame';

export function Consistency({ content, mode, index, variant }: { content: SliceContent; mode: WrapMode; index: number; variant?: SlideVariant }) {
  return <SlideFrame content={content} mode={mode} index={index} label="CONSISTENCY" accent="#84cc16" variant={variant} />;
}
