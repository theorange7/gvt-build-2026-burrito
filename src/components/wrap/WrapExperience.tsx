'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SliceContent, WrapMode } from '@/lib/types';
import { WrapDesktop } from '@/components/wrap/WrapDesktop';
import { WrapPhone } from '@/components/wrap/WrapPhone';

const MX_PALETTE = {
  hot: '#FF4D2E',
  lime: '#C6FF3B',
  ink: '#0A0A0A',
  cream: '#FFF4DE',
  paper: '#FBF5E5',
  accent: '#6B3DFF',
  accent2: '#7BE3FF',
  accent3: '#FFB3C7',
};

export function WrapExperience({
  id,
  mode,
  title,
  slices,
}: {
  id: string;
  mode: WrapMode;
  title: string;
  slices: SliceContent[];
}) {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleClose = () => router.back();

  if (isMobile === null) return null;

  if (isMobile) {
    return <WrapPhone p={MX_PALETTE} slices={slices} mode={mode} onClose={handleClose} />;
  }

  return <WrapDesktop slices={slices} mode={mode} title={title} onClose={handleClose} />;
}
