/* Design philosophy reminder: cross-team work should read as connective tissue across the organisation. */
import type { SliceContent, WrapMode } from '@/lib/types';
import { SlideFrame, type SlideVariant } from './SlideFrame';

export function CrossTeamImpact({ content, mode, index, variant }: { content: SliceContent; mode: WrapMode; index: number; variant?: SlideVariant }) {
  return <SlideFrame content={content} mode={mode} index={index} label="CROSS-TEAM IMPACT" accent="#0ea5e9" variant={variant} />;
}
