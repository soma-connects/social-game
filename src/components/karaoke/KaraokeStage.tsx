'use client';

// Karaoke Stage.
//
// One singer at a time, everybody else watching. The performer gets the note
// highway and their own microphone; the room gets a live accuracy meter and a
// set of reaction buttons that are worth real points to whoever is singing.
//
// The tune is played BEFORE the round rather than under it. A guide melody
// playing out of a phone speaker goes straight back into the microphone, and
// the pitch detector cannot tell it from the singer — so the room would be
// scoring the backing track. Listening first, then singing to a click, is also
// simply how the solfège rounds already work.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, RoomState, SocialReactionId } from '@/lib/types';
import { roomStore } from '@/lib/roomStore';
import { audioSFX } from '@/lib/audioFeedback';
import { usePitchDetection } from '@/hooks/usePitchDetection';
import { getSong } from '@/lib/karaoke/songbook';
import {
  StagedSong,
  freshTally,
  gradePerformance,
  noteAccuracy,
  recordFrame,
  settleNotes,
  stageSong,
} from '@/lib/karaoke/karaokeScoring';
import NoteHighway from './NoteHighway';
import BackgroundMusic from '../BackgroundMusic';
import AvatarIllustration from '../AvatarIllustration';
import { Mic, Music, Play, Trophy, Volume2, SkipForward, Star } from 'lucide-react';

interface KaraokeStageProps {
  room: RoomState;
  myPlayer: Player;
  roomId: string;
}

type LocalStage = 'idle' | 'calibrating' | 'listening' | 'countdown' | 'singing' | 'submitting';

/** Beats of count-in before the song starts, so nobody comes in cold. */
const COUNT_IN_BEATS = 4;

const REACTIONS: { id: SocialReactionId; emoji: string; label: string }[] = [
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'laugh', emoji: '😂', label: 'Laugh' },
  { id: 'almost', emoji: '👏', label: 'Almost' },
  { id: 'drama', emoji: '🎭', label: 'Drama' },
];

export default function KaraokeStage({ room, myPlayer, roomId }: KaraokeStageProps) {
  const ks = room.karaokeState;

  const { pitch, isCalibrated, isActive, getRange, startCalibration, stopDetection } =
    usePitchDetection();

  const [stage, setStage] = useState<LocalStage>('idle');
  const [countIn, setCountIn] = useState(0);
  const [liveAccuracy, setLiveAccuracy] = useState(0);
  const [liveStreak, setLiveStreak] = useState(0);
  const [micFailed, setMicFailed] = useState(false);
  const [staged, setStaged] = useState<StagedSong | null>(null);

  // Written every animation frame, so they are refs rather than state.
  const timeRef = useRef(0);
  const pitchRef = useRef(0);
  const traceRef = useRef<{ t: number; hz: number }[]>([]);
  const tallyRef = useRef(freshTally());
  const rafRef = useRef(0);
  const stopGuideRef = useRef<(() => void) | null>(null);
  const lastBeatRef = useRef(-1);
  const submittedRef = useRef('');

  pitchRef.current = pitch;

  const currentSongId = ks ? ks.setup.setlist[ks.songIndex] : undefined;
  const song = currentSongId ? getSong(currentSongId) : undefined;
  const singerId = ks?.singerOrder[ks.singerIndex];
  const singer = room.players.find((p) => p.id === singerId);
  const isMyTurn = singerId === myPlayer.id;
  const turnKey = `${ks?.turnSeq ?? 0}`;

  /** Stops the clock, the guide melody and the animation frame. */
  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    stopGuideRef.current?.();
    stopGuideRef.current = null;
  }, []);

  useEffect(() => () => {
    teardown();
    stopDetection();
  }, [teardown, stopDetection]);

  // A new turn resets everything local. Without this the previous singer's
  // trace and tally bleed into the next person's first second on stage.
  useEffect(() => {
    teardown();
    setStage('idle');
    setLiveAccuracy(0);
    setLiveStreak(0);
    setCountIn(0);
    setStaged(null);
    timeRef.current = 0;
    traceRef.current = [];
    tallyRef.current = freshTally();
    lastBeatRef.current = -1;
  }, [turnKey, teardown]);

  // ── the performance loop ──────────────────────────────────────────────────

  const finishPerformance = useCallback(
    async (activeStaged: StagedSong) => {
      teardown();
      setStage('submitting');

      const result = gradePerformance(tallyRef.current, activeStaged);
      audioSFX.playChoiSuccess();

      // Named by turn, so a re-render or a double timer cannot post the same
      // performance twice and score it twice.
      const key = turnKey;
      if (submittedRef.current === key) return;
      submittedRef.current = key;

      await roomStore.submitKaraokePerformance(roomId, {
        seq: ks?.turnSeq ?? 0,
        songId: activeStaged.song.id,
        accuracy: result.accuracy,
        notesHit: result.notesHit,
        notesTotal: result.notesTotal,
        bestStreak: result.bestStreak,
        points: result.points,
        grade: result.grade,
        verdict: result.verdict,
      });
    },
    [roomId, teardown, turnKey, ks?.turnSeq]
  );

  const runLoop = useCallback(
    (activeStaged: StagedSong) => {
      const beatSeconds = activeStaged.secondsPerBeat;
      const countInSeconds = COUNT_IN_BEATS * beatSeconds;
      const startedAt = performance.now();

      const tick = () => {
        const elapsed = (performance.now() - startedAt) / 1000;
        const songTime = elapsed - countInSeconds;
        timeRef.current = songTime;

        // Count-in clicks, then a click on every beat of the song itself.
        const beat = Math.floor(elapsed / beatSeconds);
        if (beat !== lastBeatRef.current) {
          lastBeatRef.current = beat;
          if (elapsed < countInSeconds) {
            setCountIn(COUNT_IN_BEATS - beat);
            audioSFX.playMetronomeTick(true);
          } else {
            if (countIn !== 0) setCountIn(0);
            audioSFX.playMetronomeTick(beat % 4 === 0);
          }
        }

        if (songTime >= 0) {
          const hz = pitchRef.current;
          traceRef.current.push({ t: songTime, hz });
          recordFrame(tallyRef.current, activeStaged, songTime, hz);
          settleNotes(tallyRef.current, activeStaged, songTime);
        }

        if (songTime >= activeStaged.seconds + 0.4) {
          void finishPerformance(activeStaged);
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      setStage('singing');
      rafRef.current = requestAnimationFrame(tick);
    },
    // countIn is read only to avoid a redundant setState; it must not restart
    // the loop, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finishPerformance]
  );

  // A cheap 6Hz sampler for the two numbers shown to the room. The tally
  // itself updates every frame; only the display is throttled.
  useEffect(() => {
    if (stage !== 'singing' || !staged) return;
    const timer = setInterval(() => {
      const notes = staged.timeline;
      let sum = 0;
      let counted = 0;
      for (const note of notes) {
        if (note.endAt > timeRef.current) break;
        sum += noteAccuracy(tallyRef.current, note.index);
        counted += 1;
      }
      setLiveAccuracy(counted > 0 ? sum / counted : 0);
      setLiveStreak(tallyRef.current.streak);
    }, 160);
    return () => clearInterval(timer);
  }, [stage, staged]);

  // Spectators get the singer's live accuracy without a second scoring engine.
  useEffect(() => {
    if (stage !== 'singing' || !isMyTurn || !song) return;
    roomStore.pushLiveState(roomId, myPlayer.id, {
      status: `Singing ${song.title}`,
      score: Math.round(liveAccuracy * 100),
    });
  }, [stage, isMyTurn, liveAccuracy, roomId, myPlayer.id, song]);

  // ── singer actions ────────────────────────────────────────────────────────

  const takeTheMic = async () => {
    if (!song) return;
    setStage('calibrating');
    setMicFailed(false);

    const ok = await startCalibration();
    if (!ok) {
      setMicFailed(true);
      setStage('idle');
    }
  };

  // Calibration finishing is what actually stages the song, because the
  // singer's measured range is the input that decides what key it is in.
  useEffect(() => {
    if (stage !== 'calibrating' || !isCalibrated || !song) return;
    setStaged(stageSong(song, getRange()));
    setStage('listening');
  }, [stage, isCalibrated, song, getRange]);

  const playGuide = useCallback(
    (activeStaged: StagedSong) => {
      stopGuideRef.current?.();
      // Long songs get the opening phrases rather than the whole thing —
      // nobody needs to hear ninety seconds back before singing it.
      const preview = activeStaged.timeline.filter((note) => note.startAt < 12);
      stopGuideRef.current = audioSFX.playMelody(
        preview.map((note) => ({
          freq: note.targetHz,
          at: note.startAt,
          seconds: note.endAt - note.startAt,
        }))
      );
    },
    []
  );

  useEffect(() => {
    if (stage === 'listening' && staged) playGuide(staged);
  }, [stage, staged, playGuide]);

  const startSinging = () => {
    if (!staged) return;
    stopGuideRef.current?.();
    stopGuideRef.current = null;
    tallyRef.current = freshTally();
    traceRef.current = [];
    timeRef.current = -COUNT_IN_BEATS * staged.secondsPerBeat;
    lastBeatRef.current = -1;
    setCountIn(COUNT_IN_BEATS);
    setStage('countdown');
    runLoop(staged);
  };

  // ── room actions ──────────────────────────────────────────────────────────

  const react = async (reaction: SocialReactionId) => {
    if (!ks?.lastPerformance || ks.lastPerformance.playerId === myPlayer.id) return;
    audioSFX.playPop();
    await roomStore.cheerKaraoke(roomId, reaction);
  };

  const nextUp = () => roomStore.karaokeNext(roomId);
  const encore = () => roomStore.karaokeEncore(roomId);

  if (!ks) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center glass-card rounded-2xl">
        <p className="text-fuchsia-300 font-bold">Setting up the stage…</p>
      </div>
    );
  }

  const leaderboard = [...room.players]
    .map((p) => ({ player: p, score: ks.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  const songNumber = ks.songIndex + 1;
  const totalSongs = ks.setup.setlist.length;

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto space-y-4 px-2 py-4 select-none">
      {/* No music bed while somebody is singing. It would play out of the
          phone speaker, back into the microphone, and be scored as if they had
          sung it — and it drowns the click track they are timing against. */}
      {stage !== 'listening' && stage !== 'countdown' && stage !== 'singing' && (
        <BackgroundMusic screen="karaoke" />
      )}

      {/* Marquee */}
      <div className="w-full flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-400/30 uppercase tracking-widest">
          🎤 KARAOKE STAGE
        </span>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">
          Song {Math.min(songNumber, totalSongs)} of {totalSongs}
        </span>
      </div>

      {/* ── finished ──────────────────────────────────────────────────────── */}
      {ks.phase === 'finished' && (
        <div className="w-full glass-card rounded-2xl p-4 border border-fuchsia-400/40 space-y-3">
          <div className="text-center space-y-1">
            <Trophy className="w-12 h-12 text-amber-400 mx-auto" />
            <h3 className="text-lg font-black text-white uppercase tracking-wide">Set Complete</h3>
          </div>
          {leaderboard.map((row, idx) => (
            <div
              key={row.player.id}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                idx === 0 ? 'bg-amber-500/15 border-amber-400/50' : 'bg-white/5 border-white/10'
              }`}
            >
              <span className="text-base w-6 text-center">{['🥇', '🥈', '🥉'][idx] ?? `${idx + 1}`}</span>
              <span className="text-sm font-black text-white truncate flex-1 min-w-0">{row.player.name}</span>
              <span className="text-sm font-black text-fuchsia-300 shrink-0">{row.score}</span>
            </div>
          ))}
          {myPlayer.isHost && (
            <button
              onClick={encore}
              className="w-full bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white font-black text-sm py-3 rounded-2xl active:scale-95 transition"
            >
              🎶 ENCORE — RUN THE SET AGAIN
            </button>
          )}
        </div>
      )}

      {/* ── applause ──────────────────────────────────────────────────────── */}
      {ks.phase === 'applause' && ks.lastPerformance && (
        <div className="w-full glass-card rounded-2xl p-4 border border-fuchsia-400/40 space-y-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="text-4xl font-black text-amber-300 w-14 text-center shrink-0">
              {ks.lastPerformance.grade}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-white truncate">
                {ks.lastPerformance.playerName} · {ks.lastPerformance.songTitle}
              </p>
              <p className="text-[11px] text-slate-400 leading-snug">{ks.lastPerformance.verdict}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Accuracy" value={`${Math.round(ks.lastPerformance.accuracy * 100)}%`} />
            <Stat label="Notes" value={`${ks.lastPerformance.notesHit}/${ks.lastPerformance.notesTotal}`} />
            <Stat label="Streak" value={String(ks.lastPerformance.bestStreak)} />
          </div>

          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-slate-400">
              {ks.lastPerformance.points} sung
              {ks.lastPerformance.crowdBonus > 0 && (
                <span className="text-fuchsia-300"> + {ks.lastPerformance.crowdBonus} crowd</span>
              )}
            </span>
            <span className="text-base font-black text-fuchsia-300">
              {ks.lastPerformance.points + ks.lastPerformance.crowdBonus}
            </span>
          </div>

          {/* The crowd bonus is real points, so reacting is worth doing rather
              than decoration. The performer cannot cheer for themselves. */}
          {ks.lastPerformance.playerId !== myPlayer.id ? (
            <div className="grid grid-cols-4 gap-1.5">
              {REACTIONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => react(r.id)}
                  className="py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition text-center"
                >
                  <span className="block text-lg leading-none">{r.emoji}</span>
                  <span className="block text-[9px] font-black text-slate-400 mt-0.5">{r.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-center font-bold text-slate-400">
              The room is deciding what they thought…
            </p>
          )}

          {myPlayer.isHost && (
            <button
              onClick={nextUp}
              className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-black text-xs py-2.5 rounded-xl active:scale-95 transition"
            >
              <SkipForward className="w-4 h-4" /> NEXT SINGER
            </button>
          )}
        </div>
      )}

      {/* ── on deck / performing ──────────────────────────────────────────── */}
      {(ks.phase === 'on_deck' || ks.phase === 'performing') && song && (
        <div className="w-full space-y-3">
          {/* Who is up, and what they are singing */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-slate-900/80 border border-white/10">
            {singer && (
              <AvatarIllustration avatar={singer.avatar} size="sm" className="shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {isMyTurn ? 'You are up' : 'On the mic'}
              </p>
              <p className="text-sm font-black text-white truncate">
                {singer?.name ?? 'Waiting…'} · <span className="text-fuchsia-300">{song.title}</span>
              </p>
            </div>
            <span
              className={`text-[9px] font-black px-2 py-1 rounded-lg shrink-0 uppercase ${
                song.difficulty === 'easy'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : song.difficulty === 'medium'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-red-500/20 text-red-300'
              }`}
            >
              {song.difficulty}
            </span>
          </div>

          {/* The highway, once the song has been staged for this voice. */}
          {isMyTurn && staged && (stage === 'listening' || stage === 'countdown' || stage === 'singing' || stage === 'submitting') && (
            <div className="relative">
              <NoteHighway
                staged={staged}
                timeRef={timeRef}
                pitchRef={pitchRef}
                traceRef={traceRef}
                accuracyOf={(index) => noteAccuracy(tallyRef.current, index)}
                running={stage === 'singing'}
              />

              {stage === 'countdown' && countIn > 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-6xl font-black text-amber-300 drop-shadow-[0_0_20px_rgba(253,224,71,0.7)]">
                    {countIn}
                  </span>
                </div>
              )}

              {stage === 'listening' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/75 rounded-xl">
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-cyan-300">
                    <Volume2 className="w-4 h-4 animate-pulse" /> Listen to the tune
                  </p>
                  <p className="text-[11px] text-slate-400 text-center px-6 leading-relaxed">
                    Played in your key, not the songbook&apos;s. Hit start when you have it —
                    the tune stops so the microphone only hears you.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => staged && playGuide(staged)}
                      className="px-3 py-2 rounded-xl border border-white/15 bg-white/5 text-slate-200 text-[11px] font-black active:scale-95"
                    >
                      HEAR IT AGAIN
                    </button>
                    <button
                      onClick={startSinging}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-[11px] font-black active:scale-95 flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> START SINGING
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Live meters, for the singer and the room alike. */}
          {stage === 'singing' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Accuracy</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-150"
                      style={{ width: `${Math.round(liveAccuracy * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-black text-white tabular-nums w-9 text-right">
                    {Math.round(liveAccuracy * 100)}%
                  </span>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Streak</p>
                <span className="flex items-center gap-1 text-sm font-black text-amber-300">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {liveStreak}
                </span>
              </div>
            </div>
          )}

          {/* Take the mic */}
          {isMyTurn && stage === 'idle' && (
            <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-950/20 p-4 text-center space-y-2">
              <p className="text-sm font-black text-white">{song.title}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">{song.blurb}</p>
              <p className="text-[10px] text-slate-500">
                {song.origin === 'original' ? 'Written for this game' : song.credit}
              </p>
              {micFailed && (
                <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  The microphone would not start. Allow it and try again.
                </p>
              )}
              <button
                onClick={takeTheMic}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white font-black text-sm py-3 rounded-2xl active:scale-95 transition"
              >
                <Mic className="w-4 h-4" /> TAKE THE MIC
              </button>
            </div>
          )}

          {isMyTurn && stage === 'calibrating' && (
            <div className="rounded-2xl border border-cyan-400/30 bg-cyan-950/20 p-5 text-center space-y-2">
              <Music className="w-8 h-8 text-cyan-300 mx-auto animate-pulse" />
              <p className="text-sm font-black text-white">Finding your range</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Hum anything — low, then high. The song gets moved into whatever you can
                comfortably reach, so nobody is asked to sing somebody else&apos;s key.
              </p>
              {isActive && <p className="text-[10px] font-mono text-cyan-400">{Math.round(pitch)} Hz</p>}
            </div>
          )}

          {/* Everyone else */}
          {!isMyTurn && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-center space-y-2">
              <p className="text-sm font-black text-white">
                {singer?.name ?? 'Someone'} is on {song.title}
              </p>
              <p className="text-[11px] text-slate-400">
                {room.liveState?.playerId === singerId && typeof room.liveState.score === 'number'
                  ? `Holding ${room.liveState.score}% of the notes so far`
                  : 'Keep your microphone open — the room is the audience.'}
              </p>
              {myPlayer.isHost && (
                <button
                  onClick={nextUp}
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-[11px] font-black text-slate-300 active:scale-95"
                >
                  <SkipForward className="w-3.5 h-3.5" /> SKIP THEM
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Running scores, always visible — it is a competition. */}
      {ks.phase !== 'finished' && leaderboard.length > 0 && (
        <div className="w-full grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
          {leaderboard.map((row) => (
            <div
              key={row.player.id}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl border ${
                row.player.id === singerId
                  ? 'bg-fuchsia-500/15 border-fuchsia-400/50'
                  : 'bg-slate-900/70 border-white/10'
              }`}
            >
              <span className="text-[11px] font-black text-white truncate flex-1 min-w-0">
                {row.player.name}
              </span>
              <span className="text-[11px] font-black text-fuchsia-300 shrink-0 tabular-nums">
                {row.score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-1.5">
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm font-black text-white tabular-nums">{value}</p>
    </div>
  );
}
