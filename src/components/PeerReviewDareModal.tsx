'use client';

import React, { useState } from 'react';
import { Mic, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { Player } from '@/lib/types';
import { DARES } from '@/lib/gameContent';
import { audioSFX } from '@/lib/audioFeedback';

interface PeerReviewDareModalProps {
  targetPlayer: Player;
  challengerPlayer: Player;
  onResolveDare: (passed: boolean) => void;
}

export default function PeerReviewDareModal({ targetPlayer, challengerPlayer, onResolveDare }: PeerReviewDareModalProps) {
  const [dareText] = useState(() => DARES[Math.floor(Math.random() * DARES.length)]);
  const [isPerforming, setIsPerforming] = useState(false);

  const handleJudgement = (passed: boolean) => {
    if (passed) {
      audioSFX.playChoiSuccess();
    } else {
      audioSFX.playWhaalaFailure();
    }
    onResolveDare(passed);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="glass-card max-w-lg w-full rounded-3xl p-6 border border-partyPink/60 space-y-6 text-center shadow-2xl glow-pink">
        <div className="space-y-2">
          <span className="bg-partyPink text-white text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-wider animate-pulse">
            PEER-REVIEWED PUNISHMENT DARE
          </span>
          <h3 className="text-2xl sm:text-3xl font-black text-white">
            {challengerPlayer.name} DARES {targetPlayer.name}!
          </h3>
          <p className="text-xs text-partyYellow font-mono">Opponents will act as judge and jury!</p>
        </div>

        {/* Dare Prompt Card */}
        <div className="p-6 rounded-2xl bg-partyDark/90 border border-partyYellow/40 space-y-3">
          <span className="text-4xl">🎭</span>
          <p className="text-lg font-black text-partyYellow leading-snug">&quot;{dareText}&quot;</p>
        </div>

        {/* Live Mic Perform Area */}
        <div className="space-y-3">
          {!isPerforming ? (
            <button
              onClick={() => {
                setIsPerforming(true);
                audioSFX.playNollywoodBrass();
              }}
              className="w-full bg-partyCyan hover:bg-cyan-400 text-partyDark font-black text-base py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all"
            >
              <Mic className="w-5 h-5" />
              <span>START 10-SEC LIVE PERFORMANCE</span>
            </button>
          ) : (
            <div className="p-4 rounded-2xl bg-partyGreen/20 border border-partyGreen text-partyGreen font-bold text-sm animate-pulse flex items-center justify-center gap-2">
              <Mic className="w-5 h-5" />
              <span>LIVE MIC ACTIVE - PERFORM NOW!</span>
            </div>
          )}
        </div>

        {/* Opponent Judge Buttons */}
        <div className="space-y-2 pt-2">
          <span className="text-xs font-bold text-gray-400 block">OPPONENTS: JUDGE ATTEMPT NOW</span>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleJudgement(true)}
              className="bg-partyGreen hover:bg-emerald-400 text-partyDark font-black text-base py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>PASS (+100 PTS)</span>
            </button>

            <button
              onClick={() => handleJudgement(false)}
              className="bg-red-500 hover:bg-red-600 text-white font-black text-base py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg"
            >
              <XCircle className="w-5 h-5" />
              <span>FAIL (WHAALA!)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
