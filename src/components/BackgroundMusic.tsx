'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Music, VolumeX } from 'lucide-react';
import { SOUNDTRACKS, SoundtrackScreen } from '@/lib/soundtrack';

/** Muting is a preference about the person, not the room, so it follows them. */
const MUTE_KEY = 'voice_party_music_muted';

interface BackgroundMusicProps {
  screen: SoundtrackScreen;
  /** Hides the toggle where a screen already has its own audio controls. */
  showToggle?: boolean;
}

/**
 * Background music for one screen.
 *
 * Replaces the bare `<audio autoPlay loop>` each screen used to carry. Two
 * things that markup cannot do:
 *
 *  1. **Autoplay is blocked.** Browsers refuse to start audio before the user
 *     has interacted with the page, and a plain `autoPlay` attribute fails
 *     silently — so on a fresh tab the music simply never played. This retries
 *     on the first real interaction.
 *  2. **Mute was per screen.** Asteroid Defense had a toggle, the board did not,
 *     and neither remembered anything. Muting now sticks across every screen and
 *     survives a refresh.
 *
 * `preload="none"` matters too: eight tracks live in the app and only one is
 * ever wanted, so nothing is fetched until it is actually going to play.
 */
export default function BackgroundMusic({ screen, showToggle = true }: BackgroundMusicProps) {
  const track = SOUNDTRACKS[screen];
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);

  // Read the stored preference after mount — localStorage does not exist during
  // SSR, and reading it in render would desync the first paint.
  useEffect(() => {
    setMuted(typeof window !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1');
    setReady(true);
  }, []);

  const attemptPlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || muted) return;
    el.volume = track.volume;
    void el.play().catch(() => {
      /* still gesture-locked; the listener below will try again */
    });
  }, [muted, track.volume]);

  useEffect(() => {
    if (!ready) return;
    const el = audioRef.current;
    if (!el) return;

    if (muted) {
      el.pause();
      return;
    }

    attemptPlay();

    // If the browser refused, start on the first thing the user does. Once is
    // enough — after that the element is unlocked for the rest of the session.
    const unlock = () => attemptPlay();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ready, muted, attemptPlay, track.src]);

  const toggle = () => {
    setMuted((wasMuted) => {
      const next = !wasMuted;
      try {
        localStorage.setItem(MUTE_KEY, next ? '1' : '0');
      } catch {
        /* private mode — the preference just will not persist */
      }
      return next;
    });
  };

  return (
    <>
      <audio ref={audioRef} src={track.src} loop preload="none" className="hidden" />
      {showToggle && ready && (
        <button
          onClick={toggle}
          aria-label={muted ? 'Turn music on' : 'Turn music off'}
          title={muted ? 'Music off' : 'Music on'}
          className={`fixed bottom-24 left-4 lg:bottom-6 z-40 w-11 h-11 rounded-full border shadow-xl backdrop-blur-md transition active:scale-95 flex items-center justify-center ${
            muted
              ? 'bg-slate-900/90 border-white/15 text-gray-500'
              : 'bg-slate-900/90 border-partyCyan/50 text-partyCyan'
          }`}
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Music className="w-5 h-5" />}
        </button>
      )}
    </>
  );
}
