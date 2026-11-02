'use client';

import React, { useState } from 'react';
import {
  Flag,
  Home,
  LogOut,
  Mic,
  MicOff,
  Package,
  ScrollText,
  Share2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { MapTheme } from '@/lib/types';
import { SHOP_ITEMS } from '@/lib/gameRules';
import ThemeSelector from './ThemeSelector';

type ConfirmAction = 'leave' | 'end' | null;

interface MobileBoardActionsProps {
  open: boolean;
  roomId: string;
  currentTheme: MapTheme;
  showThemeSelector: boolean;
  showInventory: boolean;
  inventory: string[];
  isMyTurn: boolean;
  canEndMatch: boolean;
  micMuted: boolean;
  soundMuted: boolean;
  onClose: () => void;
  onSelectTheme: (theme: MapTheme) => void;
  onOpenRoster: () => void;
  onOpenFeed: () => void;
  onUsePowerup: (powerupId: string) => void;
  onOpenTrapPicker: () => void;
  onToggleMic: () => void;
  onToggleSound: () => void;
  onGoHome: () => void;
  onLeave: () => void;
  onEndMatch: () => void;
}

/** Room actions reached from the roadmap's edge button on small screens. */
export default function MobileBoardActions({
  open,
  roomId,
  currentTheme,
  showThemeSelector,
  showInventory,
  inventory,
  isMyTurn,
  canEndMatch,
  micMuted,
  soundMuted,
  onClose,
  onSelectTheme,
  onOpenRoster,
  onOpenFeed,
  onUsePowerup,
  onOpenTrapPicker,
  onToggleMic,
  onToggleSound,
  onGoHome,
  onLeave,
  onEndMatch,
}: MobileBoardActionsProps) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  if (!open) return null;

  const confirmCopy = confirmAction === 'end'
    ? {
        title: 'End this match?',
        detail: 'Everyone returns to the room lobby and the current match progress is cleared.',
        confirm: 'END MATCH',
        run: onEndMatch,
      }
    : confirmAction === 'leave'
      ? {
          title: 'Leave this room?',
          detail: 'Your player will leave the room and the rest of the group can continue.',
          confirm: 'LEAVE ROOM',
          run: onLeave,
        }
      : null;

  const openPanel = (callback: () => void) => {
    onClose();
    callback();
  };

  const ownedPowerups = SHOP_ITEMS.map((item) => ({
    item,
    count: inventory.filter((id) => id === item.id).length,
  })).filter(({ count }) => count > 0);

  const usageHint = (itemId: string, target: (typeof SHOP_ITEMS)[number]['target']) => {
    if (itemId === 'mine') return 'Tap to plant it four spaces ahead';
    if (target === 'opponent') return 'Tap, then choose a rival';
    if (target === 'leader') return 'Tap to target the player in first place';
    return 'Tap to activate on yourself';
  };

  const shareRoom = () => {
    const url = `${window.location.origin}/game/${roomId}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`Join my Voice Party room ${roomId}: ${url}`)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[70] lg:hidden" role="presentation">
      <button
        type="button"
        aria-label="Close board actions"
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-actions-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        className="absolute right-0 top-0 flex h-full w-[min(88vw,360px)] flex-col gap-4 overflow-y-auto border-l border-white/15 bg-slate-950/95 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-[max(env(safe-area-inset-top),1rem)] shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-partyCyan">Room {roomId}</p>
            <h2 id="board-actions-title" className="text-lg font-black text-white">
              {confirmCopy ? 'Confirm action' : 'Board actions'}
            </h2>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label="Close" className="glass-pill rounded-xl p-2 text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {confirmCopy ? (
          <div className="mt-4 space-y-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
            <h3 className="text-base font-black text-white">{confirmCopy.title}</h3>
            <p className="text-sm leading-relaxed text-gray-300">{confirmCopy.detail}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmAction(null)} className="glass-pill rounded-xl px-3 py-3 text-xs font-black text-white">
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => {
                  const run = confirmCopy.run;
                  onClose();
                  run();
                }}
                className="min-h-11 rounded-xl bg-red-500 px-3 py-3 text-xs font-black text-white"
              >
                {confirmCopy.confirm}
              </button>
            </div>
          </div>
        ) : (
          <>
            {showInventory && (
              <section className="space-y-2 rounded-2xl border border-partyPink/25 bg-partyPink/[0.06] p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
                    <Package className="h-4 w-4 text-partyPink" /> Your powerups
                  </h3>
                  <span className="text-[9px] font-bold uppercase text-gray-400">
                    {isMyTurn ? 'Ready to use' : 'Use on your turn'}
                  </span>
                </div>
                {ownedPowerups.length > 0 ? (
                  <div className="space-y-2">
                    {ownedPowerups.map(({ item, count }) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!isMyTurn}
                        onClick={() => openPanel(() => onUsePowerup(item.id))}
                        className="flex min-h-16 w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] p-2.5 text-left transition enabled:active:scale-[0.98] enabled:hover:border-partyPink/60 disabled:opacity-50"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-black text-white">{item.name}</span>
                            <span className="shrink-0 rounded-full bg-partyYellow px-2 py-0.5 text-[10px] font-black text-partyDark">x{count}</span>
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-snug text-gray-300">{item.description}</span>
                          <span className="mt-1 block text-[9px] font-black uppercase tracking-wide text-partyCyan">
                            {usageHint(item.id, item.target)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-white/[0.04] px-3 py-3 text-[11px] leading-relaxed text-gray-400">
                    No powerups yet. Buy one from the shop between rounds and it will appear here.
                  </p>
                )}
              </section>
            )}

            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={<Users />} label="Roster" onClick={() => openPanel(onOpenRoster)} />
              <ActionButton icon={<ScrollText />} label="Feed" onClick={() => openPanel(onOpenFeed)} />
              <ActionButton icon={<Mic />} label={micMuted ? 'Unmute mic' : 'Mute mic'} onClick={onToggleMic} />
              <ActionButton icon={soundMuted ? <VolumeX /> : <Volume2 />} label={soundMuted ? 'Unmute sound' : 'Mute sound'} onClick={onToggleSound} />
              <ActionButton icon={<Share2 />} label="Share room" onClick={shareRoom} />
            </div>

            {showThemeSelector && (
              <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Board theme</p>
                <ThemeSelector currentTheme={currentTheme} onSelectTheme={onSelectTheme} />
              </section>
            )}

            <button type="button" onClick={() => openPanel(onOpenTrapPicker)} className="glass-pill flex min-h-11 items-center justify-between rounded-xl px-3 py-3 text-left text-xs font-bold text-white">
              <span>Set a trap word</span><span className="text-partyYellow">›</span>
            </button>
            <button type="button" onClick={() => { onClose(); onGoHome(); }} className="glass-pill flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-bold text-white">
              <Home className="h-4 w-4 text-partyCyan" /> Back to home
            </button>
            {canEndMatch && (
              <button type="button" onClick={() => setConfirmAction('end')} className="glass-pill flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-bold text-amber-200">
                <Flag className="h-4 w-4" /> End match
              </button>
            )}
            <button type="button" onClick={() => setConfirmAction('leave')} className="glass-pill flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-bold text-red-300">
              <LogOut className="h-4 w-4" /> Leave room
            </button>
          </>
        )}
      </aside>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="glass-pill flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[11px] font-black text-white active:scale-[0.98]">
      <span className="text-partyCyan [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      {label}
    </button>
  );
}
