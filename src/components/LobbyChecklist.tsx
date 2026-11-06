'use client';

import React from 'react';
import { CheckCircle2, Crown, HelpCircle, Hourglass } from 'lucide-react';
import { Player, RoomState } from '@/lib/types';
import { useVoiceState } from '@/lib/voiceCallActions';
import MicCheck from './MicCheck';

interface LobbyChecklistProps {
  room: RoomState;
  myPlayer: Player;
  /** Opens the "How it works" walkthrough. */
  onOpenGuide?: () => void;
}

/**
 * What to do in the lobby, in order, for whoever is looking at it.
 *
 * Playtest: guests saw the same eight-mode picker and LAUNCH button as the
 * host, pressed it, and nothing happened (the server only lets the host start).
 * Nobody told them the host starts the game and they just wait. Guests now get
 * a waiting card; the host gets the three steps to a match.
 */
export default function LobbyChecklist({ room, myPlayer, onOpenGuide }: LobbyChecklistProps) {
  const voice = useVoiceState();
  const onCall = voice.status === 'live';
  const host = room.players.find((p) => p.isHost);
  const others = room.players.length - 1;

  const guide = onOpenGuide && (
    <button
      type="button"
      onClick={onOpenGuide}
      className="w-full mt-1 flex items-center justify-center gap-1.5 text-[11px] font-black text-partyCyan hover:text-white py-1.5 transition"
    >
      <HelpCircle className="w-3.5 h-3.5" /> HOW DOES THIS GAME WORK?
    </button>
  );

  if (!myPlayer.isHost) {
    return (
      <div className="glass-card rounded-3xl p-4 sm:p-5 border border-partyYellow/40 bg-partyYellow/5 space-y-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-partyYellow/20 text-partyYellow flex items-center justify-center shrink-0">
            <Hourglass className="w-6 h-6 animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-[0.2em] text-partyYellow">YOU&apos;RE IN!</p>
            <h3 className="text-base sm:text-lg font-black text-white leading-tight">
              WAITING FOR {(host?.name ?? 'THE HOST').toUpperCase()} TO START
            </h3>
          </div>
        </div>

        <ol className="space-y-2.5">
          <Step
            n={1}
            done={onCall}
            title="Join the voice call"
            detail={onCall ? 'You are on the call. Say hi!' : 'Tap the green JOIN CALL button at the top of the screen.'}
          />
          <Step n={2} title="Test your mic" detail="Tap the button, say something, and watch the bar jump.">
            <div className="pt-1.5">
              <MicCheck />
            </div>
          </Step>
          <Step
            n={3}
            title={`${host?.name ?? 'The host'} starts the game`}
            detail="They pick what to play. Your screen changes by itself, so there is nothing else to press."
          />
        </ol>
        {guide}
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-4 sm:p-5 border border-partyYellow/40 bg-partyYellow/5 space-y-3 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-partyYellow/20 text-partyYellow flex items-center justify-center shrink-0">
          <Crown className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black tracking-[0.2em] text-partyYellow">YOU&apos;RE THE HOST</p>
          <h3 className="text-base sm:text-lg font-black text-white leading-tight">3 STEPS TO START A GAME</h3>
        </div>
      </div>

      <ol className="space-y-2.5">
        <Step
          n={1}
          done={others > 0}
          title="Invite your crew"
          detail={
            others > 0
              ? `${others} ${others === 1 ? 'friend is' : 'friends are'} in. Wait here until everyone has arrived.`
              : 'Tap SHARE TO WHATSAPP below and send the link. They show up in the lounge as they join.'
          }
        />
        <Step
          n={2}
          done={onCall}
          title="Get on the voice call"
          detail={onCall ? 'You are on the call.' : 'Tap the green JOIN CALL button at the top so you can all talk.'}
        />
        <Step
          n={3}
          title="Pick a game and launch it"
          detail="Choose a mode under CHOOSE APP GAME MODE, then press SET UP & LAUNCH. New group? Start with the Board Game."
        />
      </ol>
      {guide}
    </div>
  );
}

function Step({
  n,
  title,
  detail,
  done = false,
  children,
}: {
  n: number;
  title: string;
  detail: string;
  done?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black border ${
          done
            ? 'bg-emerald-500 border-emerald-300 text-partyDark'
            : 'bg-white/5 border-white/20 text-partyYellow'
        }`}
        aria-label={done ? `Step ${n} done` : `Step ${n}`}
      >
        {done ? <CheckCircle2 className="w-4 h-4" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-black ${done ? 'text-emerald-300' : 'text-white'}`}>{title}</p>
        <p className="text-xs text-gray-300 leading-snug">{detail}</p>
        {children}
      </div>
    </li>
  );
}
