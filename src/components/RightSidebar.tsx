'use client';

import React from 'react';
import { PowerupItem, EventLog, Player, PowerupType } from '@/lib/types';
import PowerupCard from './PowerupCard';
import EventFeed from './EventFeed';
import { Package } from 'lucide-react';

interface RightSidebarProps {
  /** Whose turn it is — powerups apply to this player. */
  activePlayer: Player;
  /** The player using this browser. */
  myPlayer: Player;
  events: EventLog[];
  onUsePowerup: (powerupId: string) => void;
}

const POWERUP_CATALOGUE: { id: PowerupType; name: string; icon: string; description: string }[] = [
  { id: 'boost', name: 'Rocket Nitro', icon: '🚀', description: 'Advance +3 spaces instantly' },
  { id: 'rewind', name: 'Rewind Trap', icon: '⏪', description: 'Push back -2 spaces' },
  { id: 'shield', name: 'Magic Shield', icon: '🛡️', description: 'Block the next debuff or dare' },
  { id: 'dare_gun', name: 'Dare Gun', icon: '🎤', description: 'Force an opponent into a live dare' },
  { id: 'freeze', name: 'Ice Freeze', icon: '❄️', description: 'Freeze an opponent for 1 round' },
  { id: 'bomb', name: 'Point Bomb', icon: '💣', description: 'Blast 50 points off the leader' },
];

export default function RightSidebar({ activePlayer, myPlayer, events, onUsePowerup }: RightSidebarProps) {
  const isMyTurn = activePlayer.id === myPlayer.id;

  // Counts come straight from the inventory. The old version defaulted the boost
  // to 1 even when the player had none, so the button offered a powerup the
  // server would reject.
  // Filter to only items the active player actually owns (count > 0)
  const ownedPowerups: PowerupItem[] = POWERUP_CATALOGUE.map((item) => ({
    ...item,
    count: activePlayer.inventory.filter((i) => i === item.id).length,
  })).filter((p) => p.count > 0);

  return (
    <aside className="hidden lg:block w-80 glass-card rounded-3xl p-5 border border-white/15 space-y-6 backdrop-blur-xl bg-slate-900/70 shadow-2xl shrink-0">
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-partyYellow" /> INVENTORY & POWERUPS
          </h3>
          <span className="text-[10px] font-mono text-partyCyan font-bold">
            {isMyTurn ? 'YOUR TURN' : activePlayer.name.toUpperCase()}
          </span>
        </div>

        {ownedPowerups.length > 0 ? (
          <div className="grid grid-cols-1 gap-2">
            {ownedPowerups.map((p) => (
              <PowerupCard key={p.id} powerup={p} disabled={!isMyTurn} onUse={() => onUsePowerup(p.id)} />
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center space-y-1">
            <p className="text-xs font-bold text-gray-300">Inventory Empty</p>
            <p className="text-[10px] text-gray-400">Buy powerups in the shop after your turn!</p>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-white/10">
        <EventFeed events={events} />
      </div>
    </aside>
  );
}
