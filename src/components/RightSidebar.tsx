'use client';

import React from 'react';
import { PowerupItem, EventLog, Player } from '@/lib/types';
import { SHOP_ITEMS } from '@/lib/gameRules';
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

export default function RightSidebar({ activePlayer, myPlayer, events, onUsePowerup }: RightSidebarProps) {
  const isMyTurn = activePlayer.id === myPlayer.id;

  // Read from MY inventory, not the active player's. The old version listed
  // whoever's turn it was, so on someone else's turn you were shown their
  // powerups — other people's hands are not yours to see, and it made your own
  // items vanish from the panel until your turn came round.
  const ownedPowerups: PowerupItem[] = SHOP_ITEMS.map((item) => ({
    id: item.id,
    name: item.name,
    icon: item.icon,
    description: item.description,
    count: myPlayer.inventory.filter((i) => i === item.id).length,
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
