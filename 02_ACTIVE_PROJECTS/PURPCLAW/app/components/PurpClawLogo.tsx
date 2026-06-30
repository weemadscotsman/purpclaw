'use client';

import React from 'react';

type PurpClawLogoSize = 'header' | 'compact' | 'hero';

interface PurpClawLogoProps {
  size?: PurpClawLogoSize;
  className?: string;
}

const SIZE_CLASSES: Record<PurpClawLogoSize, string> = {
  compact: 'h-8 w-[3.6rem]',
  header: 'h-10 w-[4.5rem]',
  hero: 'h-28 w-[12.5rem] md:h-36 md:w-[16rem]',
};

export function PurpClawLogo({ size = 'header', className = '' }: PurpClawLogoProps) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md border border-violet-300/15 bg-black/30 shadow-[0_0_28px_rgba(168,85,247,0.18)] ${SIZE_CLASSES[size]} ${className}`}
      aria-label="PURPCLAW animated logo"
    >
      <video
        className="h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        poster="/brand/purpclaw-logo-poster.png"
      >
        <source src="/brand/purpclaw-logo.webm" type="video/webm" />
      </video>
      <div className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-white/5" />
    </div>
  );
}
