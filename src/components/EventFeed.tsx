'use client';

import React from 'react';
import { EventLog } from '@/lib/types';
import { Activity, Bell } from 'lucide-react';

interface EventFeedProps {
  events: EventLog[];
}

/** The server stores ISO timestamps; show them in the player's local time. */
function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function EventFeed({ events }: EventFeedProps) {
  const displayEvents = events.length > 0 ? events : [
    { id: 'placeholder', text: '🎮 Waiting for the first move…', timestamp: '', type: 'system' as const },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-1 border-b border-white/10">
        <h4 className="font-extrabold text-xs text-white flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-partyCyan" /> RECENT GAME EVENTS
        </h4>
        <span className="text-[10px] font-mono text-gray-400">LIVE FEED</span>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {displayEvents.map((evt) => (
          <div
            key={evt.id}
            className={`p-2.5 rounded-xl border text-xs leading-snug transition-all animate-fadeIn ${
              evt.type === 'buff'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : evt.type === 'debuff'
                ? 'bg-red-500/20 border-red-500/40 text-red-300'
                : evt.type === 'dare'
                ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                : evt.type === 'social'
                ? 'bg-partyCyan/15 border-partyCyan/40 text-partyCyan'
                : 'bg-white/5 border-white/10 text-gray-300'
            }`}
          >
            <div className="flex justify-between items-start">
              <span>{evt.text}</span>
              <span className="text-[9px] font-mono text-gray-400 shrink-0 ml-2">
                {evt.timestamp ? formatTimestamp(evt.timestamp) : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
