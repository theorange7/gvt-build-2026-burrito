/* Design philosophy reminder: mentorship should feel warm, generous, and quietly consequential. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame } from './SlideFrame';

export function Mentorship({ content, mode, index }: { content: SliceContent; mode: WrapMode; index: number }) {
  return <SlideFrame content={content} mode={mode} index={index} label="MENTORSHIP" accent="#f59e0b" />;
}
