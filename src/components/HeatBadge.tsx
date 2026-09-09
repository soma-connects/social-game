'use client';

import React from 'react';
import { heatTier, isHot } from '@/lib/gameRules';

/**
 * The streak flame.
 *
 * A streak is only worth building if the room can see it — both so the player
 * on one knows what they are protecting, and so everybody else knows who to
 * root against. Renders nothing below the first paying tier, which keeps the
 * roster quiet in the opening rounds rather than showing five grey zeroes.
 */
export default function HeatBadge({
  streak,
  size = 'sm',
}: {
  streak: number | undefined;
  size?: 'sm' | 'md';
}) {
  const value = streak ?? 0;
  if (!isHot(value)) return null;

  const tier = heatTier(value);
  const compact = size === 'sm';

  return (
    <span
      title={`${tier.label} — ${value} strong rounds in a row, x${tier.multiplier} coins`}
      className={`inline-flex items-center gap-0.5 rounded-full font-black border animate-pulse ${
        compact ? 'text-[8px] px-1 py-px' : 'text-[10px] px-2 py-0.5'
      }`}
      style={{ color: tier.color, borderColor: `${tier.color}80`, backgroundColor: `${tier.color}22` }}
    >
      {tier.icon} {value}
      {compact ? '' : ` ${tier.label.toUpperCase()}`}
    </span>
  );
}
