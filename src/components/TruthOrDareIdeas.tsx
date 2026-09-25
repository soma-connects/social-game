'use client';

import React, { useEffect, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { roomStore } from '@/lib/roomStore';
import { TruthOrDareIdea, TruthOrDarePromptSource } from '@/lib/types';
import {
  StoredTruthOrDareIdea,
  TRUTH_OR_DARE_IDEAS_PER_TYPE,
  TRUTH_OR_DARE_IDEA_MAX_CHARS,
  addIdea,
} from '@/lib/truthOrDareIdeas';

interface TruthOrDareIdeasProps {
  roomId: string;
  /** How many the whole room has written. Counts only — the rest is private until drawn. */
  counts: { truth: number; dare: number };
  /** Where the host said prompts come from. Ideas are kept either way, but only drawn if this allows it. */
  promptSource: TruthOrDarePromptSource;
}

const PLACEHOLDERS = {
  truth: "e.g. What's the most embarrassing song on your playlist?",
  dare: 'e.g. Do your best impression of the person on your left',
} as const;

/**
 * Where a player writes the room's own truths and dares, before the match.
 *
 * Nobody sees who wrote what, or what is coming: the pool lives in the room's
 * private state and an idea only becomes public when it is drawn. That is why
 * this fetches the player's own list from the server instead of reading it off
 * the room — the room has nothing to read.
 */
export default function TruthOrDareIdeas({ roomId, counts, promptSource }: TruthOrDareIdeasProps) {
  const [mine, setMine] = useState<TruthOrDareIdea[]>([]);
  const [type, setType] = useState<'truth' | 'dare'>('truth');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    roomStore.getMyTruthOrDareIdeas(roomId).then((ideas) => {
      if (!cancelled) setMine(ideas);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const mineOf = (kind: 'truth' | 'dare') => mine.filter((i) => i.type === kind);
  const total = counts.truth + counts.dare;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    // The server's own rules, run here first, so a typo or a full list is
    // answered beside the box instead of as a banner across the whole page.
    const asStored: StoredTruthOrDareIdea[] = mine.map((i) => ({ ...i, authorId: 'me' }));
    const check = addIdea(asStored, 'me', type, text);
    if (check.status === 'refused') {
      setError(check.error);
      return;
    }

    setBusy(true);
    setError(null);
    const result = await roomStore.addTruthOrDareIdea(roomId, type, check.idea.text);
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.ideas) setMine(result.ideas);
    setText('');
  };

  const remove = async (id: string) => {
    setError(null);
    const result = await roomStore.removeTruthOrDareIdea(roomId, id);
    if (result.error) setError(result.error);
    else if (result.ideas) setMine(result.ideas);
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-partyYellow" />
          YOUR OWN IDEAS
        </h4>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Write truths and dares for the room. Nobody sees who wrote what, or what is coming — an idea only
          shows up when it gets drawn.
        </p>
      </div>

      {promptSource === 'library' && (
        <p className="text-[11px] text-amber-300">
          The host has the built-in prompts only, so these will not be drawn yet. They are kept if that changes.
        </p>
      )}

      <form onSubmit={submit} className="space-y-2">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Truth or dare">
          {(['truth', 'dare'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setType(kind)}
              aria-pressed={type === kind}
              className={`py-2 rounded-xl border text-xs font-black transition-all active:scale-95 ${
                type === kind
                  ? kind === 'dare'
                    ? 'bg-partyPink/20 border-partyPink text-white'
                    : 'bg-partyCyan/20 border-partyCyan text-white'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
              }`}
            >
              {kind === 'dare' ? '🎭 DARE' : '🤫 TRUTH'}
              <span className="ml-1.5 font-mono text-[10px] opacity-70">
                {mineOf(kind).length}/{TRUTH_OR_DARE_IDEAS_PER_TYPE}
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            maxLength={TRUTH_OR_DARE_IDEA_MAX_CHARS}
            placeholder={PLACEHOLDERS[type]}
            aria-label={`Write a ${type}`}
            className="flex-1 min-w-0 bg-partyDark/90 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-partyYellow"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="bg-partyYellow hover:bg-yellow-400 disabled:opacity-50 text-partyDark font-black text-sm px-4 py-2.5 rounded-xl transition-all active:scale-95 shrink-0"
          >
            ADD
          </button>
        </div>
        {error && <p className="text-[11px] text-red-300">{error}</p>}
      </form>

      {mine.length > 0 && (
        <ul className="space-y-1.5">
          {mine.map((idea) => (
            <li
              key={idea.id}
              className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <span
                className={`mt-0.5 shrink-0 text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded-full border ${
                  idea.type === 'dare'
                    ? 'text-partyPink border-partyPink/40 bg-partyPink/10'
                    : 'text-partyCyan border-partyCyan/40 bg-partyCyan/10'
                }`}
              >
                {idea.type === 'dare' ? 'DARE' : 'TRUTH'}
              </span>
              <span className="flex-1 min-w-0 text-xs text-gray-200 break-words">{idea.text}</span>
              <button
                type="button"
                onClick={() => remove(idea.id)}
                aria-label={`Remove: ${idea.text}`}
                className="shrink-0 text-gray-400 hover:text-white active:scale-90 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-gray-500">
        {total === 0
          ? 'Nobody has written any yet.'
          : `The room has ${total} idea${total === 1 ? '' : 's'} so far — ${counts.truth} truth${
              counts.truth === 1 ? '' : 's'
            } and ${counts.dare} dare${counts.dare === 1 ? '' : 's'}.`}
      </p>
    </div>
  );
}
