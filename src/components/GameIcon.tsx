'use client';

import React, { useState } from 'react';

interface GameIconProps {
  /** Path under public/, e.g. `/powerups/boost.png`. */
  src?: string;
  /** Shown when the art is missing or fails to load. */
  emoji: string;
  /** Describe it only where the icon carries meaning text does not. */
  alt?: string;
  /** Sizes both the image and the emoji, so give it a box and a text size. */
  className?: string;
  /** Skip lazy loading for something appearing right now, like an overlay. */
  eager?: boolean;
}

/**
 * An icon that prefers generated art and falls back to the emoji.
 *
 * The game shipped with emoji in every icon slot, which render differently on
 * Android, iOS and Windows — the same room looks like three different products.
 * Art replaces them, but it arrives a sheet at a time, so anything not drawn
 * yet has to keep working: a missing file lands on the emoji it replaced
 * instead of an empty square.
 */
export default function GameIcon({
  src,
  emoji,
  alt = '',
  className = '',
  eager = false,
}: GameIconProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className={`inline-flex items-center justify-center leading-none ${className}`}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        {emoji}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- plain img throughout this app
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
      className={`object-contain select-none ${className}`}
    />
  );
}
