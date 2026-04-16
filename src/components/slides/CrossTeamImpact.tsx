/* Design philosophy reminder: cross-team work should read as connective tissue across the organisation. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame } from './SlideFrame';

export function CrossTeamImpact({ content, mode, index }: { content: SliceContent; mode: WrapMode; index: number }) {
  return <SlideFrame content={content} mode={mode} index={index} label="CROSS-TEAM IMPACT" accent="#0ea5e9" />;
}
