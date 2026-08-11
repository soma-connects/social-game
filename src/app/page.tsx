'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Play, Users, Sparkles, MessageCircle, Share2, Globe } from 'lucide-react';
import { roomStore } from '@/lib/roomStore';
import { audioSFX } from '@/lib/audioFeedback';
import { AVATARS } from '@/lib/gameContent';
import AvatarIllustration from '@/components/AvatarIllustration';

export default function HomePage() {
  const router = useRouter();
  const [hostName, setHostName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Both flows wait for the server before navigating, so the game page never
  // opens onto a room that was never actually created.
  const handleCreateRoom = async () => {
    setBusy(true);
    setError(null);
    const newCode = roomStore.generateRoomCode();
    const room = await roomStore.createRoom(newCode, hostName.trim() || 'Chief Boss');
    setBusy(false);

    if (!room) {
      setError('Could not reach the game server. Check your connection and try again.');
      return;
    }
    audioSFX.playChoiSuccess();
    router.push(`/game/${newCode}`);
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode) return;

    setBusy(true);
    setError(null);
    const result = await roomStore.joinRoom(cleanCode, hostName.trim() || 'Guest Player');
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    audioSFX.playStreetVendorBell();
    router.push(`/game/${cleanCode}`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-partyDark">
      {/* Ambient Outer Space Cosmic Blobs */}
      <div className="absolute top-1/4 left-1/10 w-80 h-80 bg-cyan-500/20 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/10 w-96 h-96 bg-partyYellow/15 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/15 blur-3xl rounded-full pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-4xl w-full space-y-6 text-center z-10 animate-fadeIn relative">
        {/* Hero Section Flanked with Speech Bubbles & Characters */}
        <div className="relative flex flex-col items-center justify-center space-y-3">
          {/* Left Flanking Speech Bubble & Character */}
          <div className="hidden lg:flex items-center gap-2 absolute -left-12 top-6 animate-bounce-slow">
            <AvatarIllustration avatar={AVATARS[0]} size="lg" />
            <div className="p-3 rounded-2xl glass-pill border border-partyYellow/50 text-xs font-black text-partyYellow max-w-[140px] text-left shadow-xl">
              🗣️ &quot;Whaala for who no fit speak fast!&quot;
            </div>
          </div>

          {/* Right Flanking Speech Bubble & Character */}
          <div className="hidden lg:flex items-center gap-2 absolute -right-12 top-6 animate-bounce-slow">
            <div className="p-3 rounded-2xl glass-pill border border-partyPink/50 text-xs font-black text-partyPink max-w-[140px] text-right shadow-xl">
              🔥 &quot;Oya clear your throat sharp sharp!&quot;
            </div>
            <AvatarIllustration avatar={AVATARS[1]} size="lg" />
          </div>

          <div className="inline-flex items-center gap-2 glass-pill px-4 py-1.5 rounded-full text-xs font-black tracking-widest text-partyYellow border border-partyYellow/40 shadow-lg">
            <Sparkles className="w-4 h-4 text-partyYellow" /> NAIJA MULTIPLAYER VOICE ROADMAP
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-none drop-shadow-xl">
            VOICE PARTY <br />
            <span className="bg-gradient-to-r from-partyYellow via-terracotta to-partyPink bg-clip-text text-transparent">
              ROADMAP GAME
            </span>
          </h1>

          <p className="text-gray-300 text-sm sm:text-base max-w-lg mx-auto">
            High-speed voice challenges in <span className="text-partyYellow font-extrabold">Hausa, Igbo, Yoruba</span> & world languages! Win mini-games, drop traps & roll 3D dice to victory!
          </p>
        </div>

        {/* 2D Vector Caricatures Lineup */}
        <div className="flex justify-center items-center gap-2 sm:gap-4 py-1">
          {AVATARS.map((av) => (
            <div key={av.id} className="flex flex-col items-center">
              <AvatarIllustration avatar={av} size="md" />
              <span className="text-[10px] font-extrabold text-gray-300 mt-1">{av.name}</span>
            </div>
          ))}
        </div>

        {/* Home Glassmorphic Action Card (Tight Spacing to Title) */}
        <div className="glass-card rounded-3xl p-6 sm:p-8 border border-white/20 space-y-6 text-left shadow-2xl relative overflow-hidden backdrop-blur-xl bg-slate-900/60 max-w-xl mx-auto">
          {/* Ambient Inner Card Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-partyYellow/20 blur-2xl rounded-full pointer-events-none" />

          <div className="space-y-2">
            <label className="text-xs font-extrabold text-gray-300 uppercase tracking-wider block">
              ENTER YOUR PLAYER NAME:
            </label>
            <input
              type="text"
              placeholder="e.g. Chief Agbada, Sisi Vibe..."
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              className="w-full bg-partyDark/90 border border-white/25 rounded-2xl px-5 py-3.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-partyYellow shadow-inner font-bold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <button
              onClick={handleCreateRoom}
              disabled={busy}
              className="w-full bg-gradient-to-r from-partyYellow via-terracotta to-partyPink text-partyDark font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 transition-all transform hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-2xl glow-yellow"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>{busy ? 'WORKING…' : 'CREATE NEW ROOM'}</span>
            </button>

            <form onSubmit={handleJoinRoom} className="flex gap-2">
              <input
                type="text"
                placeholder="ROOM CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="w-2/3 bg-partyDark/90 border border-white/25 rounded-2xl px-3 py-3.5 text-xs text-white uppercase text-center font-mono placeholder-gray-500 focus:outline-none focus:border-partyCyan"
              />
              <button
                type="submit"
                disabled={busy || !joinCode.trim()}
                className="w-1/3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-partyDark font-black text-xs py-3.5 rounded-2xl transition-all shadow-md"
              >
                JOIN
              </button>
            </form>
          </div>

          {error && (
            <p className="text-xs text-red-300 bg-red-500/15 border border-red-500/40 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 text-xs text-gray-400 font-medium pt-2">
          <span className="flex items-center gap-1.5">🎙️ Web Speech STT</span>
          <span className="flex items-center gap-1.5">💬 WhatsApp Invite</span>
          <span className="flex items-center gap-1.5">⚡ Opponent Traps</span>
        </div>
      </div>
    </main>
  );
}
