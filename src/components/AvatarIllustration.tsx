'use client';

import React, { useState } from 'react';
import { AvatarStyle } from '@/lib/types';
import { AVATARS } from '@/lib/gameContent';

interface AvatarIllustrationProps {
  avatar: AvatarStyle;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** 'face' is the square portrait crop; 'card' is the full 2:3 character poster */
  variant?: 'face' | 'card';
  isSpeaking?: boolean;
  className?: string;
}

const FACE_SIZES = {
  xs: 'w-8 h-8',
  sm: 'w-10 h-10',
  md: 'w-14 h-14',
  lg: 'w-20 h-20',
  xl: 'w-28 h-28',
} as const;

const CARD_SIZES = {
  xs: 'w-14',
  sm: 'w-20',
  md: 'w-28',
  lg: 'w-36',
  xl: 'w-48',
} as const;

export default function AvatarIllustration({
  avatar,
  size = 'md',
  variant = 'face',
  isSpeaking = false,
  className = '',
}: AvatarIllustrationProps) {
  const [imageFailed, setImageFailed] = useState(false);

  // Room state persists a snapshot of the avatar, so a player who joined before an
  // art update can be carrying stale image paths. Prefer the current definition.
  const current = AVATARS.find((a) => a.id === avatar.id) ?? avatar;
  const accent = current.color || '#FFD000';
  const imageSrc = variant === 'card' ? current.cardUrl : current.faceUrl ?? current.cardUrl;

  const shape = variant === 'card' ? 'rounded-2xl' : 'rounded-full';
  // The card keeps the art's own aspect ratio. Forcing one letterboxes it —
  // the character art is roughly 0.88 wide-to-tall and varies per character.
  const box = variant === 'card' ? CARD_SIZES[size] : FACE_SIZES[size];
  const rotateClass = variant === 'card' ? 'rotate-1 hover:rotate-3 hover:scale-[1.03] transition-all duration-300 cursor-pointer' : 'hover:scale-105 transition-all duration-200';

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden border-2 shadow-xl shrink-0 ${shape} ${box} ${rotateClass} ${
        isSpeaking ? 'audio-wave-ring scale-105' : ''
      } ${className}`}
      style={{ backgroundColor: `${accent}22`, borderColor: isSpeaking ? '#34D399' : accent }}
    >
      {imageSrc && !imageFailed ? (
        <img
          src={imageSrc}
          alt={current.name}
          decoding="async"
          onError={() => setImageFailed(true)}
          className={variant === 'card' ? 'w-full h-auto block' : 'w-full h-full object-cover object-top'}
        />
      ) : (
        // Art missing or failed to load: initial on the character's accent colour
        <span
          className="font-black leading-none select-none"
          style={{ color: accent, fontSize: variant === 'card' ? '2rem' : '45%' }}
        >
          {current.name.charAt(0).toUpperCase()}
        </span>
      )}

      {isSpeaking && (
        <span
          className={`absolute inset-0 border-2 border-emerald-400 animate-ping opacity-75 pointer-events-none ${shape}`}
        />
      )}
    </div>
  );
}
