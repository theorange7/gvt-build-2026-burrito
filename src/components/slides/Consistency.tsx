/* Design philosophy reminder: consistency should celebrate rhythm and durability over spectacle. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame } from './SlideFrame';

export function Consistency({ content, mode, index }: { content: SliceContent; mode: WrapMode; index: number }) {
  return <SlideFrame content={content} mode={mode} index={index} label="CONSISTENCY" accent="#84cc16" />;
}
