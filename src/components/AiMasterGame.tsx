'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Heart, Mic, Send, ThumbsDown, ThumbsUp, Coins, Sparkles, Skull } from 'lucide-react';
import { AiMasterState, Player, RoomState } from '@/lib/types';
import { STARTING_LIVES } from '@/lib/gameRules';
import { aiGameMaster } from '@/lib/aiGameMaster';
import { audioSFX } from '@/lib/audioFeedback';
import { roomStore } from '@/lib/roomStore';
import { speechEngine } from '@/lib/speechService';
import AvatarIllustration from './AvatarIllustration';

interface AiMasterGameProps {
  room: RoomState;
  myPlayer: Player;
  roomId: string;
}

const CATEGORY_LABEL: Record<AiMasterState['category'], string> = {
  truth: '🫢 TRUTH',
  dare: '🎭 DARE',
  bluff: '🃏 TRUTH OR BLUFF',
  trivia: '🧠 TRIVIA',
  story: '📖 STORY',
};

const BRIBE_ASKS: { id: 'skip' | 'life' | 'redirect'; label: string; blurb: string }[] = [
  { id: 'skip', label: 'Let me off', blurb: 'Pass this round without answering' },
  { id: 'life', label: 'Sell me a life', blurb: 'Get one heart back' },
  { id: 'redirect', label: 'Pick on them instead', blurb: 'Shove the challenge onto someone else' },
];

export default function AiMasterGame({ room, myPlayer, roomId }: AiMasterGameProps) {
  const state = room.aiMasterState ?? null;
  const target = room.players.find((p) => p.id === state?.targetId) ?? null;
  const amTarget = !!state && myPlayer.id === state.targetId;
  const amEliminated = !!myPlayer.eliminated;

  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [showBribe, setShowBribe] = useState(false);
  const [bribeAmount, setBribeAmount] = useState(50);
  const sessionRef = useRef<{ stop: () => void } | null>(null);

  /**
   * Speak each new host line exactly once.
   *
   * The room re-renders on every snapshot, so keying off the text itself would
   * have the host repeat itself every poll.
   */
  const spokenRef = useRef<string | null>(null);
  useEffect(() => {
    const line = state?.hostLine;
    if (!line || spokenRef.current === line) return;
    spokenRef.current = line;
    aiGameMaster.speak(line);
  }, [state?.hostLine]);

  // Never leave the recogniser running when the round moves on underneath us.
  useEffect(() => {
    if (state?.phase !== 'announcing' && sessionRef.current) {
      sessionRef.current.stop();
      sessionRef.current = null;
      setListening(false);
    }
  }, [state?.phase]);

  useEffect(() => () => sessionRef.current?.stop(), []);

  if (!state) {
    return (
      <div className="glass-card rounded-3xl p-8 text-center border border-white/10">
        <Bot className="w-10 h-10 mx-auto text-partyYellow animate-pulse" />
        <p className="mt-3 text-sm font-bold text-gray-300">The AI Master is warming up…</p>
      </div>
    );
  }

  const toggleMic = async () => {
    if (listening) {
      sessionRef.current?.stop();
      sessionRef.current = null;
      setListening(false);
      return;
    }
    const accessError = await speechEngine.probeMicPermission();
    if (accessError) return;

    setListening(true);
    setTranscript('');
    sessionRef.current = speechEngine.listenForSpeech({
      targetWord: '',
      language: 'en-US',
      onResult: (res: any) => setTranscript(res.transcript ?? ''),
      onError: () => setListening(false),
    });
  };

  const submitAnswer = async () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setListening(false);
    audioSFX.playChoiSuccess();
    await roomStore.aiMasterRespond(roomId, transcript.trim() || '(said nothing)');
    setTranscript('');
  };

  const castVote = async (verdict: 'pass' | 'fail') => {
    audioSFX.playChoiSuccess();
    await roomStore.aiMasterVote(roomId, verdict);
  };

  const offerBribe = async (ask: 'skip' | 'life' | 'redirect') => {
    setShowBribe(false);
    audioSFX.playPowerUpZap();
    await roomStore.aiMasterBribe(roomId, bribeAmount, ask);
  };

  const myVote = state.votes?.[myPlayer.id];
  const votesIn = Object.keys(state.votes ?? {}).length;
  const eligibleVoters = room.players.filter(
    (p) => p.id !== state.targetId && p.connected !== false
  ).length;
  const latestBribe = (state.bribes ?? [])[(state.bribes ?? []).length - 1];

  return (
    <div className="space-y-4">
      {/* The host itself */}
      <div className="glass-card rounded-3xl p-5 border border-partyYellow/40 bg-slate-900/80 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-56 h-56 bg-partyYellow/10 blur-3xl rounded-full pointer-events-none" />
        <div className="flex items-start gap-3 relative z-10">
          <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-partyYellow via-terracotta to-partyPink flex items-center justify-center text-2xl shadow-lg glow-yellow">
            🤖
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-partyYellow tracking-widest uppercase">
                AI GAME MASTER
              </span>
              <span className="bg-white/10 text-gray-200 text-[9px] px-2 py-0.5 rounded-full font-extrabold border border-white/15">
                ROUND {state.round}
              </span>
              <span className="bg-partyPink/20 text-partyPink text-[9px] px-2 py-0.5 rounded-full font-extrabold border border-partyPink/30">
                {CATEGORY_LABEL[state.category]}
              </span>
            </div>
            <p className="text-sm sm:text-base font-bold text-white mt-1">
              &quot;{state.hostLine ?? `${target?.name ?? 'Someone'}, you are up.`}&quot;
            </p>
          </div>
        </div>
      </div>

      {/* Life bars — the whole point of the mode, so they stay on screen */}
      <div className="glass-card rounded-3xl p-4 border border-white/10">
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {room.players.map((player) => {
            const isTarget = player.id === state.targetId;
            const out = !!player.eliminated;
            return (
              <div
                key={player.id}
                className={`rounded-2xl border p-2.5 flex items-center gap-2.5 transition-all ${
                  isTarget
                    ? 'bg-partyYellow/15 border-partyYellow'
                    : out
                    ? 'bg-white/[0.02] border-white/5 opacity-50'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <AvatarIllustration avatar={player.avatar} size="sm" isSpeaking={isTarget} />
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-white truncate flex items-center gap-1">
                    {player.name}
                    {player.id === myPlayer.id && (
                      <span className="bg-partyCyan text-partyDark text-[8px] px-1 rounded font-black">YOU</span>
                    )}
                  </p>
                  {out ? (
                    <p className="text-[9px] font-black text-red-300 flex items-center gap-1">
                      <Skull className="w-2.5 h-2.5" /> ELIMINATED — STILL VOTING
                    </p>
                  ) : (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {Array.from({ length: STARTING_LIVES }, (_, i) => (
                        <Heart
                          key={i}
                          className={`w-3 h-3 ${
                            i < (player.lives ?? STARTING_LIVES) ? 'text-red-400 fill-current' : 'text-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                  <p className="text-[9px] text-partyCyan font-bold">{player.score} pts</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The challenge */}
      <div className="glass-card rounded-3xl p-5 border border-partyCyan/30 text-center space-y-2">
        <p className="text-[10px] font-black text-partyCyan tracking-widest uppercase">
          {target?.name ?? 'Someone'} MUST DO THIS
        </p>
        <p className="text-lg sm:text-xl font-black text-white leading-snug">{state.challenge}</p>
      </div>

      {/* What this player can actually do about it */}
      <AnimatePresence mode="wait">
        {state.phase === 'announcing' && (
          <motion.div
            key="answering"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card rounded-3xl p-5 border border-white/10 space-y-3"
          >
            {amTarget ? (
              <>
                <p className="text-xs font-bold text-gray-300 text-center">
                  Answer out loud — the room decides whether you got away with it.
                </p>
                <div className="min-h-[52px] rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm text-white">
                  {transcript || <span className="text-gray-500">Tap the mic and speak…</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMic}
                    className={`flex-1 font-black text-sm py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 ${
                      listening
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'bg-partyCyan text-partyDark hover:bg-cyan-400'
                    }`}
                  >
                    <Mic className="w-4 h-4" /> {listening ? 'LISTENING — TAP TO STOP' : 'TAP TO SPEAK'}
                  </button>
                  <button
                    onClick={submitAnswer}
                    disabled={!transcript.trim()}
                    className="bg-partyYellow disabled:opacity-40 text-partyDark font-black text-sm px-5 py-3 rounded-2xl flex items-center gap-2 active:scale-95"
                  >
                    <Send className="w-4 h-4" /> DONE
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm font-bold text-gray-300 text-center py-2">
                🎧 {target?.name} is answering. Listen in on the call…
              </p>
            )}
          </motion.div>
        )}

        {state.phase === 'voting' && (
          <motion.div
            key="voting"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card rounded-3xl p-5 border border-white/10 space-y-3"
          >
            {state.response && (
              <div className="rounded-2xl bg-black/40 border border-white/10 px-4 py-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                  {target?.name} said
                </p>
                <p className="text-sm text-white mt-0.5">{state.response}</p>
              </div>
            )}

            {amTarget ? (
              <p className="text-sm font-bold text-gray-300 text-center py-2">
                ⏳ The room is deciding your fate… ({votesIn}/{eligibleVoters} in)
              </p>
            ) : (
              <>
                <p className="text-xs font-bold text-gray-300 text-center">
                  Did {target?.name} pull it off? {amEliminated && '(you are out, but your vote still counts)'}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => castVote('pass')}
                    className={`flex-1 font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 border ${
                      myVote === 'pass'
                        ? 'bg-emerald-500 text-white border-emerald-400'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" /> THEY DID IT
                  </button>
                  <button
                    onClick={() => castVote('fail')}
                    className={`flex-1 font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 border ${
                      myVote === 'fail'
                        ? 'bg-red-500 text-white border-red-400'
                        : 'bg-red-500/15 text-red-300 border-red-500/40 hover:bg-red-500/25'
                    }`}
                  >
                    <ThumbsDown className="w-4 h-4" /> NOT GOOD ENOUGH
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 text-center">
                  {votesIn}/{eligibleVoters} votes in — a tie counts as a fail
                </p>
              </>
            )}
          </motion.div>
        )}

        {state.phase === 'verdict' && (
          <motion.div
            key="verdict"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`glass-card rounded-3xl p-6 border text-center space-y-3 ${
              state.passed ? 'border-emerald-400/50' : 'border-red-500/50'
            }`}
          >
            <p className={`text-2xl font-black ${state.passed ? 'text-emerald-300' : 'text-red-300'}`}>
              {state.passed ? '✅ SURVIVED' : '💔 BOMBED IT'}
            </p>
            {myPlayer.isHost && (
              <button
                onClick={() => roomStore.aiMasterNextRound(roomId)}
                className="bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-sm px-8 py-3 rounded-2xl transition-all active:scale-95"
              >
                NEXT ROUND
              </button>
            )}
            {!myPlayer.isHost && (
              <p className="text-xs text-gray-400 font-bold">Waiting for the host to call the next round…</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bribery. Public on purpose — the joke is everyone seeing you try. */}
      {latestBribe && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            latestBribe.accepted
              ? 'bg-amber-500/10 border-amber-400/40 text-amber-200'
              : 'bg-white/5 border-white/15 text-gray-300'
          }`}
        >
          {latestBribe.accepted ? '🤝' : '🚫'} {latestBribe.hostLine}
        </div>
      )}

      {!amEliminated && state.phase !== 'verdict' && (
        <div className="glass-card rounded-3xl p-4 border border-amber-400/25 space-y-3">
          <button
            onClick={() => setShowBribe((s) => !s)}
            className="w-full glass-pill hover:bg-white/15 text-amber-200 font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 border border-amber-400/30 transition-all"
          >
            <Coins className="w-4 h-4" />
            {showBribe ? 'NEVER MIND' : 'SLIDE THE HOST SOMETHING…'}
          </button>

          {showBribe && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={Math.max(10, myPlayer.score)}
                  step={10}
                  value={Math.min(bribeAmount, Math.max(10, myPlayer.score))}
                  onChange={(e) => setBribeAmount(Number(e.target.value))}
                  className="flex-1 accent-partyYellow"
                />
                <span className="text-sm font-black text-partyYellow w-16 text-right">{bribeAmount} pts</span>
              </div>
              <p className="text-[10px] text-gray-400">
                You have {myPlayer.score} points. A refused bribe still costs you a third of it — and the
                whole room hears about it.
              </p>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                {BRIBE_ASKS.map((ask) => (
                  <button
                    key={ask.id}
                    onClick={() => offerBribe(ask.id)}
                    disabled={myPlayer.score < bribeAmount || (ask.id !== 'life' && !amTarget)}
                    className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:border-amber-400/40 disabled:opacity-30 text-left transition-all active:scale-95"
                  >
                    <span className="block text-xs font-extrabold text-white">{ask.label}</span>
                    <span className="block text-[10px] text-gray-400 leading-tight mt-0.5">{ask.blurb}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-partyYellow" />
                Skipping and redirecting only work on your own round.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
