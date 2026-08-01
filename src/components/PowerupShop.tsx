'use client';

import React, { useState } from 'react';
import { ArrowRight, Check, Coins, ShoppingCart } from 'lucide-react';
import { Player, TurnResult } from '@/lib/types';
import { MINIGAME_LABELS, SHOP_ITEMS, describePerformance } from '@/lib/gameRules';
import { roomStore } from '@/lib/roomStore';
import { audioSFX } from '@/lib/audioFeedback';
import AvatarIllustration from './AvatarIllustration';

interface PowerupShopProps {
  roomId: string;
  activePlayer: Player;
  turnResult: TurnResult | null;
  onDone: () => void;
}

/**
 * Step 2 of the turn loop: the mini-game has banked points and locked in the
 * movement, and the player spends before they move.
 *
 * Points are the score as well as the currency, so buying is a genuine
 * trade-off rather than free progression.
 */
export default function PowerupShop({ roomId, activePlayer, turnResult, onDone }: PowerupShopProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBuy = async (itemId: string, price: number) => {
    if (activePlayer.score < price) return;
    setBusy(itemId);
    setError(null);
    const res = await roomStore.buyPowerup(roomId, itemId);
    setBusy(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    audioSFX.playPowerUpZap();
  };

  const steps = turnResult?.steps ?? 1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* What the mini-game earned */}
      <div className="glass-card rounded-3xl p-6 border border-partyYellow/40 bg-slate-900/70 space-y-4">
        <div className="flex items-center gap-4">
          <AvatarIllustration avatar={activePlayer.avatar} size="lg" />
          <div className="min-w-0">
            <span className="text-[10px] text-partyYellow font-black uppercase tracking-wider block">
              {turnResult ? MINIGAME_LABELS[turnResult.game] : 'MINI-GAME'} RESULT
            </span>
            <h3 className="font-extrabold text-2xl text-white truncate">{activePlayer.name}</h3>
            <p className="text-xs text-partyCyan font-bold">
              {turnResult ? describePerformance(turnResult.performance) : 'Ready to move.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-partyDark/80 border border-white/10 p-4 text-center">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">POINTS BANKED</p>
            <p className="text-3xl font-black text-partyYellow flex items-center justify-center gap-1.5">
              <Coins className="w-5 h-5" /> {activePlayer.score}
            </p>
            {turnResult && turnResult.pointsEarned > 0 && (
              <p className="text-[11px] text-emerald-400 font-bold">+{turnResult.pointsEarned} this round</p>
            )}
          </div>

          <div className="rounded-2xl bg-partyDark/80 border border-white/10 p-4 text-center">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">MOVEMENT EARNED</p>
            <p className="text-3xl font-black text-emerald-400">
              {steps} <span className="text-base">node{steps === 1 ? '' : 's'}</span>
            </p>
            <p className="text-[11px] text-gray-400">Your dice is already set</p>
          </div>
        </div>
      </div>

      {/* The shop */}
      <div className="glass-card rounded-3xl p-6 border border-partyCyan/40 bg-slate-900/70 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-partyCyan" /> BUFF SHOP
          </h3>
          <span className="text-[11px] text-gray-400">Spend now or save for a bigger buff</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SHOP_ITEMS.map((item) => {
            const owned = activePlayer.inventory.filter((i) => i === item.id).length;
            const affordable = activePlayer.score >= item.price;
            return (
              <button
                key={item.id}
                onClick={() => handleBuy(item.id, item.price)}
                disabled={!affordable || busy !== null}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${
                  affordable
                    ? 'bg-gradient-to-r from-partyPurple/40 to-white/5 border-partyCyan/50 hover:border-partyYellow hover:scale-102 cursor-pointer'
                    : 'bg-white/5 border-white/10 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-2xl p-1.5 rounded-xl bg-white/10 shrink-0">{item.icon}</span>
                  <div className="min-w-0">
                    <h5 className="font-extrabold text-xs text-white flex items-center gap-1.5">
                      {item.name}
                      {owned > 0 && (
                        <span className="bg-emerald-500/30 text-emerald-300 text-[9px] px-1.5 rounded-full font-black">
                          x{owned}
                        </span>
                      )}
                    </h5>
                    <p className="text-[10px] text-gray-300 truncate">{item.description}</p>
                  </div>
                </div>
                <span
                  className={`font-black text-xs px-2.5 py-1 rounded-full shrink-0 ${
                    affordable ? 'bg-partyYellow text-partyDark' : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {busy === item.id ? '…' : `${item.price}`}
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="text-xs text-red-300 bg-red-500/15 border border-red-500/40 rounded-xl px-3 py-2">{error}</p>
        )}

        <button
          onClick={onDone}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-partyDark font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl glow-emerald"
        >
          <Check className="w-5 h-5" />
          <span>DONE — MOVE {steps} NODE{steps === 1 ? '' : 'S'}</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
