'use client';

// The Hangout Lounge.
//
// The only mode with no winner. Everything here is built so that doing nothing
// is a valid way to be in the room: the spotlight is opt-in, the decks are
// there when the conversation stalls, and the vibe meter is shared rather than
// per-person so nobody is quietly losing.
//
// The soundboard is the one piece of real machinery — a pad pressed on one
// phone fires on every phone in the room, which is what makes it feel like one
// room rather than six people on a call.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Player, RoomState, SocialReactionId } from '@/lib/types';
import { roomStore } from '@/lib/roomStore';
import { audioSFX } from '@/lib/audioFeedback';
import {
  DECK_ORDER,
  HANGOUT_DECKS,
  SOUNDBOARD_PADS,
  nextVibeTier,
  vibeTier,
} from '@/lib/hangout/decks';
import { HangoutDeckId } from '@/lib/hangout/hangoutTypes';
import BackgroundMusic from '../BackgroundMusic';
import AvatarIllustration from '../AvatarIllustration';
import { Hand, Mic, MicOff, Shuffle, Sparkles } from 'lucide-react';

interface HangoutLoungeProps {
  room: RoomState;
  myPlayer: Player;
  roomId: string;
}

const REACTIONS: { id: SocialReactionId; emoji: string; label: string }[] = [
  { id: 'laugh', emoji: '😂', label: 'Laugh' },
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'almost', emoji: '👏', label: 'Clap' },
  { id: 'drama', emoji: '🎭', label: 'Drama' },
];

/** Plays a soundboard pad locally. Keyed by id so the room stays in sync. */
function playPad(padId: string): void {
  switch (padId) {
    case 'horn':
    case 'bell':
      audioSFX.playStreetVendorBell();
      break;
    case 'brass':
      audioSFX.playNollywoodBrass();
      break;
    case 'gen':
      audioSFX.playGeneratorRev();
      break;
    case 'choi':
      audioSFX.playChoiSuccess();
      break;
    case 'whaala':
      audioSFX.playWhaalaFailure();
      break;
    case 'zap':
      audioSFX.playPowerUpZap();
      break;
    case 'boom':
      audioSFX.playCrashBoom();
      break;
    default:
      audioSFX.playPop();
  }
}

export default function HangoutLounge({ room, myPlayer, roomId }: HangoutLoungeProps) {
  const hs = room.hangoutState;

  const [deck, setDeck] = useState<HangoutDeckId>('hot_take');
  const [drawing, setDrawing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [floating, setFloating] = useState<{ key: number; emoji: string; x: number }[]>([]);

  // What this browser has already played or animated, so a re-render never
  // fires the same horn twice.
  const lastSoundAt = useRef(0);
  const lastReactionAt = useRef(0);
  const floatKey = useRef(0);

  // One ticking clock for the spotlight countdown.
  useEffect(() => {
    if (!hs?.spotlightEndsAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [hs?.spotlightEndsAt]);

  /**
   * Fires a soundboard pad somebody else pressed.
   *
   * The `at` timestamp is the trigger rather than the pad id: pressing the same
   * pad twice in a row is a completely normal thing to do, and comparing ids
   * would swallow the second press.
   */
  useEffect(() => {
    const sound = hs?.lastSound;
    if (!sound || sound.at <= lastSoundAt.current) return;

    // Skip anything already stale on arrival — a client that reconnects should
    // not replay a horn from three minutes ago.
    const fresh = Date.now() - sound.at < 6000;
    lastSoundAt.current = sound.at;
    if (fresh) playPad(sound.padId);
  }, [hs?.lastSound]);

  // Reactions float up on every screen at once, for the same reason.
  useEffect(() => {
    const reactions = hs?.reactions ?? [];
    const incoming = reactions.filter((r) => r.at > lastReactionAt.current);
    if (incoming.length === 0) return;
    lastReactionAt.current = reactions[reactions.length - 1].at;

    const additions = incoming.slice(-6).map((r) => ({
      key: floatKey.current++,
      emoji: REACTIONS.find((x) => x.id === r.reaction)?.emoji ?? '✨',
      x: 8 + Math.random() * 84,
    }));
    setFloating((current) => [...current, ...additions].slice(-14));

    const timer = setTimeout(() => {
      setFloating((current) => current.slice(additions.length));
    }, 2200);
    return () => clearTimeout(timer);
  }, [hs?.reactions]);

  const connected = useMemo(
    () => room.players.filter((p) => p.connected !== false),
    [room.players]
  );

  if (!hs) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center glass-card rounded-2xl">
        <p className="text-emerald-300 font-bold">Opening the lounge…</p>
      </div>
    );
  }

  // A spotlight is only cleared server-side by the next action somebody takes,
  // so a room that goes quiet would sit on an expired one forever showing
  // "0 sec" next to somebody who no longer has the floor. The end time is the
  // truth and every client can read it, so expiry is decided here.
  const spotlightLive = Boolean(hs.spotlightEndsAt && hs.spotlightEndsAt > now);
  const spotlight = spotlightLive
    ? room.players.find((p) => p.id === hs.spotlightId) ?? null
    : null;
  const iHaveTheMic = spotlightLive && hs.spotlightId === myPlayer.id;
  const secondsLeft = spotlightLive ? Math.max(0, Math.ceil((hs.spotlightEndsAt! - now) / 1000)) : 0;
  const tier = vibeTier(hs.vibe);
  const next = nextVibeTier(hs.vibe);
  const vibeProgress = next
    ? Math.min(100, ((hs.vibe - tier.at) / (next.at - tier.at)) * 100)
    : 100;

  // Whoever has not held the mic this lap. The lounge never forces a turn, but
  // it should be able to say who has not had one.
  const notYet = connected.filter((p) => !hs.spotlightHistory.includes(p.id));

  const takeMic = () => {
    audioSFX.playTap();
    void roomStore.hangoutTakeMic(roomId);
  };
  const passMicTo = (playerId: string) => {
    audioSFX.playTap();
    void roomStore.hangoutPassMic(roomId, playerId);
  };
  const dropMic = () => {
    audioSFX.playTap();
    void roomStore.hangoutDropMic(roomId);
  };

  const draw = async () => {
    if (drawing) return;
    setDrawing(true);
    audioSFX.playDiceRoll();
    try {
      // The AI deck is written per room, so it is fetched here and posted with
      // the draw — the room API has no business calling out to a model on a
      // path everybody's browser hits every second.
      let text: string | undefined;
      if (deck === 'host') {
        text = await fetchHostPrompt(room);
      }
      await roomStore.hangoutDraw(roomId, deck, text);
    } finally {
      setDrawing(false);
    }
  };

  const hitPad = (padId: string) => {
    // Played immediately for the person pressing it. Waiting for the round trip
    // puts a visible lag between the tap and the noise, which makes the whole
    // board feel broken even though it works.
    playPad(padId);
    lastSoundAt.current = Date.now();
    void roomStore.hangoutSound(roomId, padId);
  };

  const react = (reaction: SocialReactionId) => {
    audioSFX.playPop();
    void roomStore.hangoutReact(roomId, reaction);
  };

  return (
    <div className="relative flex flex-col items-center w-full max-w-lg mx-auto space-y-3 px-2 py-4 select-none">
      <BackgroundMusic screen="hangout" />

      {/* Floating reactions, room-wide. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-30">
        {floating.map((f) => (
          <span
            key={f.key}
            className="absolute bottom-10 text-2xl animate-floatUp"
            style={{ left: `${f.x}%` }}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      <div className="w-full flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 uppercase tracking-widest">
          🍻 HANGOUT LOUNGE
        </span>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
          {connected.length} in the room
        </span>
      </div>

      {/* ── vibe meter ────────────────────────────────────────────────────── */}
      <div className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-black text-white flex items-center gap-1.5">
            <span className="text-base leading-none">{tier.emoji}</span>
            {tier.label}
          </span>
          <span className="text-[10px] font-black text-slate-400 tabular-nums">
            {next ? `${hs.vibe} / ${next.at}` : `${hs.vibe}`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-fuchsia-400 transition-all duration-500"
            style={{ width: `${vibeProgress}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-slate-500 leading-snug">
          Shared, not scored. Everyone reacting is what moves it.
        </p>
      </div>

      {/* ── the mic ───────────────────────────────────────────────────────── */}
      <div className="w-full rounded-2xl border border-emerald-400/25 bg-emerald-950/20 p-3 space-y-2.5">
        {spotlight ? (
          <div className="flex items-center gap-3">
            <AvatarIllustration avatar={spotlight.avatar} size="sm" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                {iHaveTheMic ? 'You have the floor' : 'Has the floor'}
              </p>
              <p className="text-sm font-black text-white truncate">{spotlight.name}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-black text-white tabular-nums leading-none">{secondsLeft}</p>
              <p className="text-[9px] font-black text-slate-400 uppercase">sec</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-1">
            <p className="text-sm font-black text-white">The floor is open</p>
            <p className="text-[11px] text-slate-400 leading-snug">
              Everyone can talk. Grab the mic when the room needs one voice at a time.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {iHaveTheMic ? (
            <button
              onClick={dropMic}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/15 bg-white/5 text-slate-200 text-xs font-black active:scale-95 transition"
            >
              <MicOff className="w-3.5 h-3.5" /> DROP THE MIC
            </button>
          ) : (
            <button
              onClick={takeMic}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-black active:scale-95 transition"
            >
              <Hand className="w-3.5 h-3.5" /> {spotlight ? 'TAKE IT NEXT' : 'TAKE THE MIC'}
            </button>
          )}
        </div>

        {/* Hand it to somebody specific. The most useful button in the room
            when one person has been quiet for twenty minutes. */}
        {notYet.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 shrink-0">
              Not yet:
            </span>
            {notYet.map((p) => (
              <button
                key={p.id}
                onClick={() => passMicTo(p.id)}
                className="shrink-0 px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-[10px] font-black text-slate-300 hover:border-emerald-400/50 active:scale-95 transition"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── the card on the table ─────────────────────────────────────────── */}
      <div className="w-full space-y-2">
        <div className="grid grid-cols-5 gap-1.5">
          {DECK_ORDER.map((id) => {
            const d = HANGOUT_DECKS[id];
            return (
              <button
                key={id}
                onClick={() => {
                  setDeck(id);
                  audioSFX.playTap();
                }}
                className={`py-1.5 rounded-xl border text-center transition-all active:scale-95 ${
                  deck === id ? d.accent : 'border-white/10 bg-white/5 text-slate-400'
                }`}
              >
                <span className="block text-base leading-none">{d.emoji}</span>
                <span className="block text-[8px] font-black uppercase mt-0.5 leading-tight">
                  {d.label.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </div>

        <div
          className={`rounded-2xl border p-4 min-h-[110px] flex flex-col justify-center text-center transition-all ${
            hs.card ? HANGOUT_DECKS[hs.card.deck].accent : 'border-white/10 bg-white/5'
          }`}
        >
          {hs.card ? (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest opacity-70">
                {HANGOUT_DECKS[hs.card.deck].emoji} {HANGOUT_DECKS[hs.card.deck].label}
              </p>
              <p className="mt-1.5 text-sm font-bold text-white leading-relaxed">{hs.card.text}</p>
              <p className="mt-1.5 text-[10px] font-bold opacity-60">
                drawn by {hs.card.drawnByName}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-black text-slate-300">{HANGOUT_DECKS[deck].label}</p>
              <p className="mt-1 text-[11px] text-slate-500">{HANGOUT_DECKS[deck].blurb}</p>
            </>
          )}
        </div>

        <button
          onClick={draw}
          disabled={drawing}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-black active:scale-95 transition disabled:opacity-50"
        >
          <Shuffle className="w-3.5 h-3.5" />
          {drawing ? 'DRAWING…' : `DRAW A ${HANGOUT_DECKS[deck].label.toUpperCase()}`}
        </button>
      </div>

      {/* ── reactions ─────────────────────────────────────────────────────── */}
      <div className="w-full grid grid-cols-4 gap-1.5">
        {REACTIONS.map((r) => (
          <button
            key={r.id}
            onClick={() => react(r.id)}
            className="py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-90 transition text-center"
          >
            <span className="block text-lg leading-none">{r.emoji}</span>
            <span className="block text-[9px] font-black text-slate-400 mt-0.5">{r.label}</span>
          </button>
        ))}
      </div>

      {/* ── soundboard ────────────────────────────────────────────────────── */}
      <div className="w-full space-y-1.5">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Soundboard — everyone hears it
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {SOUNDBOARD_PADS.map((pad) => (
            <button
              key={pad.id}
              onClick={() => hitPad(pad.id)}
              className="py-2.5 rounded-xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.02] hover:border-amber-400/50 active:scale-90 transition text-center"
            >
              <span className="block text-lg leading-none">{pad.emoji}</span>
              <span className="block text-[8px] font-black text-slate-400 mt-0.5 leading-tight">
                {pad.label}
              </span>
            </button>
          ))}
        </div>
        {hs.lastSound && (
          <p className="text-[10px] text-slate-500 text-center">
            last played by {hs.lastSound.byName}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Asks the AI host for a prompt written for this specific room.
 *
 * Called from the browser rather than the room API on purpose: the room
 * endpoint is hit by every player several times a second, and hanging a
 * model call off it would put a multi-second stall in the path of every
 * heartbeat. A failure here is silent — the deck has its own fallbacks.
 */
async function fetchHostPrompt(room: RoomState): Promise<string | undefined> {
  try {
    const names = room.players.map((p) => p.name).join(', ');
    const res = await fetch('/api/ai-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'challenge',
        roomVibe: room.roomVibe,
        gameContext: `A relaxed hangout lounge with these people: ${names}. Write ONE short prompt or question for the group to talk about out loud. One sentence, no preamble.`,
      }),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { success?: boolean; text?: string };
    const text = (data.text ?? '').trim();
    return data.success && text ? text : undefined;
  } catch {
    return undefined;
  }
}
