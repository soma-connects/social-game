'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Heart, Mic, Send, ThumbsDown, ThumbsUp, Coins, Sparkles, Skull, Headphones, Check, HeartCrack, Handshake, Ban, Ghost, Target, ShoppingBag } from 'lucide-react';
import { AiMasterState, Player, RoomState } from '@/lib/types';
import { STARTING_LIVES } from '@/lib/gameRules';
import { AI_MASTER_ITEMS, AI_MASTER_PASS_POINTS, AI_MASTER_VOTE_POINTS, AI_MASTER_VOTE_SWING, type AiMasterItem } from '@/lib/aiMasterShop';
import { aiGameMaster } from '@/lib/aiGameMaster';
import { useCountdown } from '@/hooks/useCountdown';
import { audioSFX } from '@/lib/audioFeedback';
import { roomStore } from '@/lib/roomStore';
import { speechEngine } from '@/lib/speechService';
import { micStream } from '@/lib/micStream';
import MicContentionNotice from './MicContentionNotice';
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
  /** The keyboard stays hidden until somebody asks for it. */
  const [showTyping, setShowTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [showBribe, setShowBribe] = useState(false);
  /** The answer has been sent and the AI Master is ruling on it. */
  const [submitting, setSubmitting] = useState(false);
  /** NEXT ROUND has been tapped and the host is writing the next challenge. */
  const [advancing, setAdvancing] = useState(false);
  const [bribeAmount, setBribeAmount] = useState(50);
  /** The price-list item waiting on a victim to be named. */
  const [choosingVictimFor, setChoosingVictimFor] = useState<AiMasterItem | null>(null);
  const sessionRef = useRef<{ stop: () => void } | null>(null);

  /**
   * How long this beat has left.
   *
   * The game had no clock anywhere, so a room waiting on somebody could not
   * tell a player thinking from a player gone. Shown from thirty seconds out —
   * before that it is pressure nobody needs.
   */
  const secondsLeft = useCountdown(state?.deadline, 30_000);

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

  // A tap that has been answered by the room moving on is no longer waiting.
  useEffect(() => {
    setSubmitting(false);
    setAdvancing(false);
  }, [state?.round, state?.phase]);

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
    beginListening();
  };

  /** The actual session start, unconditional — toggleMic's stop guard lives above it. */
  const beginListening = () => {
    setListening(true);
    setTranscript('');
    sessionRef.current = speechEngine.listen({
      roomId: roomId,
      mode: 'dictation',
      targetWord: '',
      language: 'en-US',
      onResult: (res: any) => setTranscript(res.transcript ?? ''),
      onError: () => setListening(false),
    });
  };

  /** Restarts the mic with priority over the call. */
  const restartWithMicPriority = () => {
    micStream.setSpeechPriority(true);
    sessionRef.current?.stop();
    beginListening();
  };

  const submitAnswer = async () => {
    if (submitting) return;
    setSubmitting(true);
    sessionRef.current?.stop();
    sessionRef.current = null;
    setListening(false);
    audioSFX.playChoiSuccess();
    await roomStore.aiMasterRespond(roomId, transcript.trim() || '(said nothing)');
    setTranscript('');
    setSubmitting(false);
  };

  const callNextRound = async () => {
    if (advancing) return;
    setAdvancing(true);
    await roomStore.aiMasterNextRound(roomId);
    // On success the round changes and the effect above clears this; on a refusal
    // the button must not stay stuck.
    setAdvancing(false);
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

  const buy = async (item: AiMasterItem, victimId?: string) => {
    setChoosingVictimFor(null);
    audioSFX.playPowerUpZap();
    await roomStore.aiMasterBuy(roomId, item.id, victimId);
  };

  /** Why an item cannot be bought right now, or null if it can. Mirrors the server's rules. */
  const blockedReason = (item: AiMasterItem): string | null => {
    if (myPlayer.score < item.price) return `Needs ${item.price} pts`;
    if (item.targetOnly && !amTarget) return 'Only on your own round';
    if (item.id === 'skip' && state.phase === 'verdict') return 'Round is decided';
    if (item.id === 'redirect' && state.phase !== 'announcing') return 'Too late — you answered';
    if (item.id === 'spotlight' && state.spotlight) return 'Already bought this round';
    if (item.id === 'life' && (myPlayer.lives ?? STARTING_LIVES) >= STARTING_LIVES) return 'Hearts are full';
    return null;
  };

  const victimChoices = room.players.filter(
    (p) => p.id !== myPlayer.id && !p.eliminated && p.connected !== false
  );

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
                {state.styleLabel ?? CATEGORY_LABEL[state.category]}
              </span>
              {secondsLeft !== null && (
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-black border ${
                    secondsLeft <= 10
                      ? 'bg-red-500/25 text-red-200 border-red-400/40 animate-pulse'
                      : 'bg-amber-500/20 text-amber-200 border-amber-400/30'
                  }`}
                >
                  ⏳ {secondsLeft}s
                </span>
              )}
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
                    {/*
                      The host's bias, made visible.

                      It was already real — the grudged player is drawn twice as
                      often and the favoured one less — and it was already
                      documented as being public. It just was not shown
                      anywhere, so a player picked on three rounds running had
                      no way to read it as the host having a personality rather
                      than the game being broken.
                    */}
                    {player.id === state.favorId && !out && (
                      <span
                        title="The host has taken a liking to them — they come up less often"
                        className="bg-emerald-400/25 text-emerald-200 text-[8px] px-1 rounded font-black border border-emerald-300/30"
                      >
                        ★ PET
                      </span>
                    )}
                    {player.id === state.grudgeId && !out && (
                      <span
                        title="The host has it in for them — they come up twice as often"
                        className="bg-rose-500/25 text-rose-200 text-[8px] px-1 rounded font-black border border-rose-300/30"
                      >
                        ☠ MARKED
                      </span>
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
                {!showTyping && (
                  <div className="min-h-[52px] rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm text-white">
                    {transcript || <span className="text-gray-500">Tap the mic and speak…</span>}
                  </div>
                )}
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
                    disabled={!transcript.trim() || submitting}
                    className="bg-partyYellow disabled:opacity-40 text-partyDark font-black text-sm px-5 py-3 rounded-2xl flex items-center gap-2 active:scale-95"
                  >
                    <Send className="w-4 h-4" /> {submitting ? 'JUDGING…' : 'DONE'}
                  </button>
                </div>
                {/* Same escape hatch Debate and Story Builder have. Without it
                    a player whose mic the transcriber could not follow had no
                    way to answer at all: DONE stays greyed out until there is
                    text, the round timed out, and the host scored it as a
                    dodge — which costs a life the second time. */}
                {showTyping ? (
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    maxLength={600}
                    rows={2}
                    autoFocus
                    placeholder="Type your answer…"
                    className="w-full rounded-2xl bg-black/40 border border-white/15 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-partyCyan"
                  />
                ) : (
                  <button
                    onClick={() => setShowTyping(true)}
                    className="block mx-auto text-xs text-gray-400 hover:text-partyCyan underline underline-offset-4"
                  >
                    Mic not catching it? Type instead
                  </button>
                )}
                <MicContentionNotice active={listening} onClaimPriority={restartWithMicPriority} />
              </>
            ) : (
              <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-gray-300 text-center py-2">
                <Headphones className="w-4 h-4 shrink-0" /> {target?.name} is answering. Listen in on the call…
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
                {state.judged
                  ? '🤖 The AI Master has made up its mind. The room is deciding what it was worth…'
                  : '⏳ The AI Master could not rule — the room is deciding your fate…'}{' '}
                ({votesIn}/{eligibleVoters} in)
              </p>
            ) : (
              <>
                <p className="text-xs font-bold text-gray-300 text-center">
                  {state.judged
                    ? '🤖 The AI Master has made up its mind.'
                    : '🤖 The AI Master could not rule on this one — the room decides.'}{' '}
                  How was {target?.name}? {amEliminated && '(you are out, but your vote still counts)'}
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
                    <ThumbsUp className="w-4 h-4" /> GOOD
                  </button>
                  <button
                    onClick={() => castVote('fail')}
                    className={`flex-1 font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 border ${
                      myVote === 'fail'
                        ? 'bg-red-500 text-white border-red-400'
                        : 'bg-red-500/15 text-red-300 border-red-500/40 hover:bg-red-500/25'
                    }`}
                  >
                    <ThumbsDown className="w-4 h-4" /> BAD
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 text-center">
                  {state.judged
                    ? `Each vote moves ${target?.name}'s points by ${AI_MASTER_VOTE_SWING}. The AI Master decides who survives.`
                    : 'A tie counts as a fail.'}{' '}
                  ({votesIn}/{eligibleVoters} in)
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
              state.outcome === 'dodged' || state.outcome === 'skipped'
                ? 'border-amber-400/50'
                : state.passed
                ? 'border-emerald-400/50'
                : 'border-red-500/50'
            }`}
          >
            {/* Says how it ended, not just whether. A player who paid their way out,
                one who said nothing, and one who earned a pass all used to read
                as SURVIVED. */}
            <p
              className={`flex items-center justify-center gap-2 text-2xl font-black ${
                state.outcome === 'dodged' || state.outcome === 'skipped'
                  ? 'text-amber-300'
                  : state.passed
                  ? 'text-emerald-300'
                  : 'text-red-300'
              }`}
            >
              {state.outcome === 'dodged' ? (
                <><Ghost className="w-6 h-6" /> NO SHOW</>
              ) : state.outcome === 'skipped' ? (
                <><Coins className="w-6 h-6" /> BOUGHT THEIR WAY OUT</>
              ) : state.passed ? (
                <><Check className="w-6 h-6" /> SURVIVED</>
              ) : (
                <><HeartCrack className="w-6 h-6" /> BOMBED IT</>
              )}
            </p>
            {state.outcome === 'dodged' && (
              <p className="text-xs font-bold text-gray-400">
                {target?.name} said nothing — no points, and no life lost. A second silent round in a row costs a life.
              </p>
            )}
            {state.outcome !== 'dodged' && state.outcome !== 'skipped' && (
              <p className="text-xs font-bold text-gray-400">
                {state.verdictBy === 'ai'
                  ? '🤖 The AI Master ruled'
                  : '🗳 The AI Master could not rule — the room decided'}
                {state.voteSwing ? ` · room votes ${state.voteSwing > 0 ? '+' : ''}${state.voteSwing} pts` : ''}
              </p>
            )}
            {myPlayer.isHost && (
              <button
                onClick={callNextRound}
                disabled={advancing}
                className="bg-partyYellow hover:bg-yellow-400 disabled:opacity-60 text-partyDark font-black text-sm px-8 py-3 rounded-2xl transition-all active:scale-95"
              >
                {advancing ? 'THE HOST IS WRITING THE NEXT ONE…' : 'NEXT ROUND'}
              </button>
            )}
            {!myPlayer.isHost && (
              <p className="text-xs text-gray-400 font-bold">Waiting for the host to call the next round…</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* What was just bought or offered. Public on purpose — the joke is everyone seeing you try. */}
      {latestBribe && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            latestBribe.accepted
              ? 'bg-amber-500/10 border-amber-400/40 text-amber-200'
              : 'bg-white/5 border-white/15 text-gray-300'
          }`}
        >
          {latestBribe.accepted ? (
            <Handshake className="w-4 h-4 inline-block mr-1 align-text-bottom" />
          ) : (
            <Ban className="w-4 h-4 inline-block mr-1 align-text-bottom" />
          )}
          {latestBribe.hostLine}
        </div>
      )}

      {/* A bought spotlight, shown to everyone — the person it points at should see who did it. */}
      {state.spotlight && (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200 flex items-center gap-2">
          <Target className="w-4 h-4 shrink-0" />
          <span>
            {state.spotlight.byName} paid {state.spotlight.price} pts to put{' '}
            {state.spotlight.target === myPlayer.id ? 'YOU' : state.spotlight.targetName} on the spot next round.
          </span>
        </div>
      )}

      {!amEliminated && (
        <div className="glass-card rounded-3xl p-4 border border-amber-400/25 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs font-black text-amber-200 tracking-widest uppercase">
              <ShoppingBag className="w-4 h-4" /> The host&apos;s price list
            </p>
            <span className="text-sm font-black text-partyYellow">{myPlayer.score} pts</span>
          </div>

          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {AI_MASTER_ITEMS.map((item) => {
              const blocked = blockedReason(item);
              return (
                <button
                  key={item.id}
                  onClick={() => (item.needsVictim ? setChoosingVictimFor(item) : buy(item))}
                  disabled={!!blocked}
                  className={`p-2.5 rounded-xl border text-left transition-all active:scale-95 disabled:opacity-40 ${
                    choosingVictimFor?.id === item.id
                      ? 'border-partyYellow bg-partyYellow/10'
                      : 'border-white/10 bg-white/5 hover:border-amber-400/40'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-white">{item.label}</span>
                    <span className="text-[10px] font-black text-partyYellow shrink-0">{item.price}</span>
                  </span>
                  <span className="block text-[10px] text-gray-400 leading-tight mt-0.5">{item.blurb}</span>
                  {blocked && <span className="block text-[9px] font-bold text-amber-300/80 mt-1">{blocked}</span>}
                </button>
              );
            })}
          </div>

          {choosingVictimFor && (
            <div className="space-y-2 animate-fadeIn">
              <p className="text-[11px] font-bold text-gray-300">
                {choosingVictimFor.id === 'spotlight' ? 'Who does the host go after next round?' : 'Who gets your challenge?'}
              </p>
              <div className="flex flex-wrap gap-2">
                {victimChoices.length === 0 && (
                  <span className="text-[11px] text-gray-500">Nobody else is around to pick on.</span>
                )}
                {victimChoices.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => buy(choosingVictimFor, p.id)}
                    className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 hover:border-partyYellow hover:bg-partyYellow/10 pl-1 pr-3 py-1 text-xs font-extrabold text-white active:scale-95"
                  >
                    <AvatarIllustration avatar={p.avatar} size="sm" />
                    {p.name}
                  </button>
                ))}
                <button
                  onClick={() => setChoosingVictimFor(null)}
                  className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-bold text-gray-400 hover:text-white"
                >
                  Never mind
                </button>
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-partyYellow shrink-0" />
            Surviving a round pays {AI_MASTER_PASS_POINTS}. Judging one pays {AI_MASTER_VOTE_POINTS}.
          </p>

          {/* The gamble. Cheaper to try, and the host may just take the money. */}
          {state.phase !== 'verdict' && (
            <div className="pt-2 border-t border-white/10 space-y-3">
              <button
                onClick={() => setShowBribe((s) => !s)}
                className="w-full glass-pill hover:bg-white/15 text-amber-200 font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 border border-amber-400/30 transition-all"
              >
                <Coins className="w-4 h-4" />
                {showBribe ? 'NEVER MIND' : 'OR SLIDE THE HOST SOMETHING… (A GAMBLE)'}
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
                    A refused bribe still costs you a third of it — and the whole room hears about it.
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
                  <p className="text-[10px] text-gray-500">Skipping and redirecting only work on your own round.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
