/* Design philosophy reminder: collaboration style should read as social craft, not soft filler. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame } from './SlideFrame';

export function CollaborationStyle({ content, mode, index }: { content: SliceContent; mode: WrapMode; index: number }) {
  return <SlideFrame content={content} mode={mode} index={index} label="COLLABORATION STYLE" accent="#06b6d4" />;
}
