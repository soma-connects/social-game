'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Sparkles, ThumbsUp, ThumbsDown, ArrowRight, Frown } from 'lucide-react';
import { Player, RoomState } from '@/lib/types';
import { TRUTH_OR_DARE_CATEGORIES, TRUTH_OR_DARE_SELECTION_LABELS } from '@/lib/truthOrDareContent';
import { useCountdown } from '@/hooks/useCountdown';
import { audioSFX } from '@/lib/audioFeedback';
import { roomStore } from '@/lib/roomStore';
import TruthOrDareWheel from './TruthOrDareWheel';
import TruthOrDareCardFlip from './TruthOrDareCardFlip';

interface TruthOrDareGameProps {
  room: RoomState;
  myPlayer: Player;
  roomId: string;
}

export default function TruthOrDareGame({ room, myPlayer, roomId }: TruthOrDareGameProps) {
  const state = room.truthOrDareState ?? null;
  const caller = room.players.find((p) => p.id === state?.callerId) ?? null;
  const target = room.players.find((p) => p.id === state?.targetId) ?? null;
  const amCaller = !!state && myPlayer.id === state.callerId;
  const amTarget = !!state && myPlayer.id === state.targetId;

  const secondsLeft = useCountdown(state?.deadline, 20_000);

  if (!state) {
    return (
      <div className="glass-card rounded-3xl p-8 text-center border border-white/10">
        <Dices className="w-10 h-10 mx-auto text-partyPink animate-pulse" />
        <p className="mt-3 text-sm font-bold text-gray-300">Setting up the first round…</p>
      </div>
    );
  }

  const spin = async () => {
    audioSFX.playChoiSuccess();
    await roomStore.truthOrDareSelect(roomId);
  };

  const choose = async (choice: 'truth' | 'dare') => {
    audioSFX.playChoiSuccess();
    await roomStore.truthOrDareChoose(roomId, choice);
  };

  const resolve = async (completed: boolean) => {
    audioSFX.playChoiSuccess();
    await roomStore.truthOrDareResolve(roomId, completed);
  };

  const nextRound = async () => {
    audioSFX.playNollywoodBrass();
    await roomStore.truthOrDareNextRound(roomId);
  };

  const categoryInfo = state.category ? TRUTH_OR_DARE_CATEGORIES.find((c) => c.id === state.category) : null;
  const modeInfo = TRUTH_OR_DARE_SELECTION_LABELS[state.selectionMode];
  const forfeitEntries = Object.entries(state.forfeits ?? {}).filter(([, count]) => count > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-card rounded-3xl p-5 border border-partyPink/40 bg-slate-900/80 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-56 h-56 bg-partyPink/10 blur-3xl rounded-full pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10 flex-wrap">
          <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-partyPink via-terracotta to-partyYellow flex items-center justify-center text-2xl shadow-lg">
            🎯
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-partyPink tracking-widest uppercase">TRUTH OR DARE</span>
              <span className="bg-white/10 text-gray-200 text-[9px] px-2 py-0.5 rounded-full font-extrabold border border-white/15">
                ROUND {state.round}
              </span>
              <span className="bg-partyCyan/20 text-partyCyan text-[9px] px-2 py-0.5 rounded-full font-extrabold border border-partyCyan/30">
                {modeInfo.emoji} {modeInfo.label}
              </span>
              {secondsLeft !== null && (
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-black border ${
                    secondsLeft <= 8
                      ? 'bg-red-500/25 text-red-200 border-red-400/40 animate-pulse'
                      : 'bg-amber-500/20 text-amber-200 border-amber-400/30'
                  }`}
                >
                  ⏳ {secondsLeft}s
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-white mt-1">
              {state.phase === 'selecting' &&
                (state.selectionMode === 'wheel'
                  ? `${caller?.name ?? 'Someone'} is spinning the wheel…`
                  : `${caller?.name ?? 'Someone'} is flipping their card…`)}
              {state.phase === 'choosing' && `${target?.name ?? 'Someone'} is choosing Truth or Dare…`}
              {state.phase === 'prompt' && `${target?.name ?? 'Someone'} is on the spot!`}
              {state.phase === 'resolved' && `Round ${state.round} is done.`}
            </p>
          </div>
        </div>
      </div>

      {/* Selection mechanic */}
      {(state.phase === 'selecting' || state.phase === 'choosing') && (
        <div className="glass-card rounded-3xl p-6 border border-white/10 space-y-4">
          {state.selectionMode === 'wheel' ? (
            <TruthOrDareWheel
              players={room.players}
              callerId={state.callerId}
              targetId={state.targetId || null}
              spinKey={state.selectedAt ?? 0}
            />
          ) : (
            <TruthOrDareCardFlip
              caller={caller}
              flipped={state.phase === 'choosing' || !!state.selectedAt}
              flipKey={state.selectedAt ?? 0}
            />
          )}

          {state.phase === 'selecting' && (
            <div className="text-center">
              {amCaller ? (
                <button
                  onClick={spin}
                  className="bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-sm px-8 py-3 rounded-2xl transition-all active:scale-95 shadow-xl inline-flex items-center gap-2"
                >
                  <Dices className="w-4 h-4" />
                  {state.selectionMode === 'wheel' ? 'SPIN THE WHEEL' : 'FLIP YOUR CARD'}
                </button>
              ) : (
                <p className="text-xs font-bold text-gray-400">
                  Waiting on {caller?.name ?? 'the caller'}
                  {state.selectionMode === 'wheel' ? ' to spin…' : ' to flip…'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Truth or Dare choice */}
      <AnimatePresence mode="wait">
        {state.phase === 'choosing' && (
          <motion.div
            key="choosing"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card rounded-3xl p-5 border border-white/10 space-y-3"
          >
            {amTarget ? (
              <>
                <p className="text-xs font-bold text-gray-300 text-center">You&apos;re up! Pick one:</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => choose('truth')}
                    className="flex-1 bg-partyCyan/15 hover:bg-partyCyan/25 border border-partyCyan/40 text-partyCyan font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    🫢 TRUTH
                  </button>
                  <button
                    onClick={() => choose('dare')}
                    className="flex-1 bg-partyPink/15 hover:bg-partyPink/25 border border-partyPink/40 text-partyPink font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    🎭 DARE
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm font-bold text-gray-300 text-center py-2">
                {target?.name ?? 'They'} are choosing Truth or Dare…
              </p>
            )}
          </motion.div>
        )}

        {state.phase === 'prompt' && (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div
              className={`glass-card rounded-3xl p-5 border text-center space-y-2 ${
                state.choice === 'dare' ? 'border-partyPink/40' : 'border-partyCyan/40'
              }`}
            >
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full border ${
                    state.choice === 'dare'
                      ? 'text-partyPink border-partyPink/40 bg-partyPink/10'
                      : 'text-partyCyan border-partyCyan/40 bg-partyCyan/10'
                  }`}
                >
                  {state.choice === 'dare' ? '🎭 DARE' : '🫢 TRUTH'}
                </span>
                {categoryInfo && (
                  <span className="text-[10px] font-black text-gray-300 px-2 py-0.5 rounded-full border border-white/15 bg-white/5">
                    {categoryInfo.emoji} {categoryInfo.label}
                  </span>
                )}
                {state.spicy && (
                  <span className="text-[10px] font-black text-orange-300 px-2 py-0.5 rounded-full border border-orange-400/30 bg-orange-500/10">
                    🌶️ SPICY
                  </span>
                )}
              </div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {target?.name ?? 'Someone'} must answer
              </p>
              <p className="text-lg sm:text-xl font-black text-white leading-snug">{state.promptText}</p>
            </div>

            {amTarget || myPlayer.isHost ? (
              <div className="glass-card rounded-3xl p-4 border border-white/10 space-y-2">
                <p className="text-xs font-bold text-gray-300 text-center">
                  {amTarget ? 'Did you do it?' : `Mark ${target?.name ?? 'their'} round for them:`}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => resolve(true)}
                    className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <ThumbsUp className="w-4 h-4" /> COMPLETED
                  </button>
                  <button
                    onClick={() => resolve(false)}
                    className="flex-1 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-300 font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <ThumbsDown className="w-4 h-4" /> FORFEIT
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 text-center flex items-center justify-center gap-1">
                  <Frown className="w-3 h-3" /> Forfeits are on the honor system — settle it however the room agreed.
                </p>
              </div>
            ) : (
              <p className="text-sm font-bold text-gray-300 text-center py-2">
                Watching {target?.name ?? 'them'} take it on…
              </p>
            )}
          </motion.div>
        )}

        {state.phase === 'resolved' && (
          <motion.div
            key="resolved"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`glass-card rounded-3xl p-6 border text-center space-y-3 ${
              state.completed ? 'border-emerald-400/50' : 'border-red-500/50'
            }`}
          >
            <p
              className={`flex items-center justify-center gap-2 text-xl sm:text-2xl font-black ${
                state.completed ? 'text-emerald-300' : 'text-red-300'
              }`}
            >
              {state.completed ? (
                <>
                  <Sparkles className="w-6 h-6" /> {target?.name ?? 'They'} PULLED IT OFF
                </>
              ) : (
                <>
                  <Frown className="w-6 h-6" /> {target?.name ?? 'They'} FORFEITED
                </>
              )}
            </p>
            {myPlayer.isHost ? (
              <button
                onClick={nextRound}
                className="bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-sm px-8 py-3 rounded-2xl transition-all active:scale-95 inline-flex items-center gap-2"
              >
                NEXT ROUND <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <p className="text-xs text-gray-400 font-bold">Waiting for the host to call the next round…</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Forfeit tally — for fun, so the room can see who owes what */}
      {forfeitEntries.length > 0 && (
        <div className="glass-card rounded-3xl p-4 border border-white/10">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Forfeits so far</p>
          <div className="flex flex-wrap gap-2">
            {forfeitEntries.map(([playerId, count]) => {
              const player = room.players.find((p) => p.id === playerId);
              return (
                <span
                  key={playerId}
                  className="bg-red-500/10 text-red-300 text-[10px] font-black px-2.5 py-1 rounded-full border border-red-500/25"
                >
                  {player?.name ?? 'Someone'} × {count}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
