'use client';

import React, { useMemo, useState } from 'react';
import { BadgeCheck, Flame, Laugh, Sparkles, ThumbsDown, ThumbsUp, Theater } from 'lucide-react';
import { Player, RoomState, SocialReactionId } from '@/lib/types';
import { sumReactionBonus } from '@/lib/gameRules';
import { roomStore } from '@/lib/roomStore';

interface SocialVoicePanelProps {
  room: RoomState;
  activePlayer: Player;
  myPlayer: Player;
}

const REACTIONS: {
  id: SocialReactionId;
  label: string;
  helper: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'laugh', label: 'Laugh', helper: 'That flaw was funny', Icon: Laugh },
  { id: 'fire', label: 'Fire', helper: 'Strong delivery', Icon: Flame },
  { id: 'almost', label: 'Almost', helper: 'Close enough to tease', Icon: Sparkles },
  { id: 'drama', label: 'Drama', helper: 'Nollywood energy', Icon: Theater },
];

export default function SocialVoicePanel({ room, activePlayer, myPlayer }: SocialVoicePanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const socialRound = room.socialRound?.targetPlayerId === activePlayer.id ? room.socialRound : null;
  const reactions = socialRound?.reactions ?? [];
  const judgeVotes = socialRound?.judgeVotes ?? [];
  const isPerformer = activePlayer.id === myPlayer.id;

  const reactionCounts = useMemo(() => {
    return REACTIONS.reduce<Record<SocialReactionId, number>>(
      (acc, reaction) => {
        acc[reaction.id] = reactions.filter((item) => item.reaction === reaction.id).length;
        return acc;
      },
      { laugh: 0, fire: 0, almost: 0, drama: 0 }
    );
  }, [reactions]);

  const socialBonus = sumReactionBonus(reactions);
  const passVotes = judgeVotes.filter((vote) => vote.vote === 'pass').length;
  const failVotes = judgeVotes.filter((vote) => vote.vote === 'fail').length;
  const myVote = judgeVotes.find((vote) => vote.voterId === myPlayer.id)?.vote ?? null;

  const sendReaction = async (reaction: SocialReactionId) => {
    if (busy || isPerformer) return;
    setBusy(reaction);
    await roomStore.addSocialReaction(room.roomId, reaction, myPlayer.id, myPlayer.name, activePlayer.id);
    setBusy(null);
  };

  const sendVote = async (vote: 'pass' | 'fail') => {
    if (busy || isPerformer) return;
    setBusy(vote);
    await roomStore.addJudgeVote(room.roomId, vote, myPlayer.id, myPlayer.name, activePlayer.id);
    setBusy(null);
  };

  const socialMeter = Math.min(100, Math.round((socialBonus / 60) * 100));
  const crowdSummary = passVotes > failVotes
    ? 'The room is leaning positive — vibes are helping this round.'
    : failVotes > passVotes
    ? 'The room is teasing the performer — it still earns crowd energy.'
    : 'The room is watching closely. Drop a line that makes them laugh.';

  // The performer cannot react to themselves — every control below is disabled
  // for them. Rendering the full panel anyway put ~500px of dead UI under the
  // thing they are actually trying to do. They get a one-line live meter instead.
  if (isPerformer) {
    return (
      <div className="glass-card rounded-2xl px-4 py-2.5 border border-partyCyan/25 bg-slate-900/70 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Laugh className="w-4 h-4 text-partyYellow shrink-0" />
          <span className="text-[11px] font-bold text-gray-300 truncate">
            {reactions.length > 0
              ? `${reactions.length} reaction${reactions.length === 1 ? '' : 's'} from the room`
              : 'The room is watching…'}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden xs:flex items-center gap-1.5 text-[11px]">
            {REACTIONS.map(({ id, Icon }) =>
              reactionCounts[id] > 0 ? (
                <span key={id} className="flex items-center gap-0.5 text-partyCyan font-black">
                  <Icon className="w-3 h-3" />
                  {reactionCounts[id]}
                </span>
              ) : null
            )}
          </div>
          <span className="text-lg font-black text-partyYellow">+{socialBonus}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-4 sm:p-5 border border-partyCyan/30 bg-slate-900/70 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Laugh className="w-4 h-4 text-partyYellow" /> CROWD JUDGE MODE
          </h3>
          <p className="text-[11px] text-gray-400">
            React to {activePlayer.name}&apos;s voice moment with laugh, fire, almost or drama.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-black text-gray-400 uppercase">Social Bonus</p>
          <p className="text-2xl font-black text-partyYellow">+{socialBonus}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] uppercase text-gray-400 font-black tracking-[0.2em]">
          <span>Laugh meter</span>
          <span>{socialMeter}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-partyYellow transition-all"
            style={{ width: `${socialMeter}%` }}
          />
        </div>
        <p className="text-[11px] text-gray-300">{crowdSummary}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {REACTIONS.map(({ id, label, helper, Icon }) => {
          const alreadyUsed = reactions.some((reaction) => reaction.voterId === myPlayer.id && reaction.reaction === id);
          return (
            <button
              key={id}
              onClick={() => sendReaction(id)}
              disabled={isPerformer || alreadyUsed || busy !== null}
              title={helper}
              className={`rounded-2xl border p-3 text-left transition-all ${
                alreadyUsed
                  ? 'bg-partyYellow/20 border-partyYellow text-partyYellow'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:border-partyCyan hover:bg-partyCyan/10'
              } disabled:cursor-default disabled:opacity-80`}
            >
              <div className="flex items-center justify-between gap-2">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-xs font-black">{reactionCounts[id]}</span>
              </div>
              <p className="text-xs font-extrabold mt-1">{label}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => sendVote('pass')}
          disabled={isPerformer || busy !== null}
          className={`rounded-2xl border p-3 flex items-center justify-center gap-2 text-xs font-black transition-all ${
            myVote === 'pass'
              ? 'bg-emerald-500 text-partyDark border-emerald-300'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
          } disabled:cursor-default disabled:opacity-80`}
        >
          <ThumbsUp className="w-4 h-4" /> PASS ({passVotes})
        </button>
        <button
          onClick={() => sendVote('fail')}
          disabled={isPerformer || busy !== null}
          className={`rounded-2xl border p-3 flex items-center justify-center gap-2 text-xs font-black transition-all ${
            myVote === 'fail'
              ? 'bg-red-500 text-white border-red-300'
              : 'bg-red-500/15 text-red-300 border-red-500/40 hover:bg-red-500/25'
          } disabled:cursor-default disabled:opacity-80`}
        >
          <ThumbsDown className="w-4 h-4" /> FAIL ({failVotes})
        </button>
      </div>

      {passVotes > failVotes && (
        <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/40 p-3 text-xs font-bold text-emerald-300 flex items-center gap-2">
          <BadgeCheck className="w-4 h-4 shrink-0" /> Crowd pass is winning: +35 bonus if the round ends now.
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-[11px] text-gray-300">
        <p className="font-black uppercase tracking-[0.2em] text-gray-400 mb-1">Voice highlight</p>
        <p>{isPerformer ? 'Your round is being judged — the crowd decides whether you earn vibe points too.' : crowdSummary}</p>
      </div>
    </div>
  );
}
