import React, { useEffect, useRef } from 'react';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';
import { Player } from '@/lib/types';
import { BOARD_GRAPH, PREV_NODES } from '@/lib/gameRules';
import AvatarIllustration from './AvatarIllustration';

interface PlayerTokenProps {
  player: Player;
  isActive: boolean;
  spreadX: number;
  spreadY: number;
  /** Smaller on the overview, where six tokens share a much smaller board. */
  size?: 'xs' | 'sm';
}

/**
 * Walks the road between two nodes, following real edges in either direction.
 *
 * Node ids are identifiers, not distances — id 24 sits one step from the start
 * while id 23 is the finish — so any path built from id arithmetic sends the
 * token on a jumbled tour of unrelated corners of the map. Backward moves
 * (rewind, asteroid pushback, duel loss) can only be walked along the reverse
 * edges, which is why the forward search alone was never enough.
 */
function bfs(from: number, to: number, edges: (id: number) => number[]): number[] | null {
  const queue: number[][] = [[from]];
  const seen = new Set([from]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    for (const next of edges(path[path.length - 1])) {
      if (seen.has(next)) continue;
      const candidate = [...path, next];
      if (next === to) return candidate;
      seen.add(next);
      queue.push(candidate);
    }
  }
  return null;
}

function graphPath(from: number, to: number): number[] {
  if (from === to) return [from];

  return (
    bfs(from, to, (id) => BOARD_GRAPH[id]?.next ?? []) ??
    bfs(from, to, (id) => PREV_NODES[id] ?? []) ??
    // Disconnected in both directions — jump rather than invent a route.
    [from, to]
  );
}

export default function PlayerToken({
  player,
  isActive,
  spreadX,
  spreadY,
  size = 'sm',
}: PlayerTokenProps) {
  const controls = useAnimation();
  const prevPosRef = useRef(player.boardPosition);

  /**
   * Where the token sits before any animation has run.
   *
   * This used to be left entirely to `controls.set()` in the effect below, and
   * that never landed: with `initial={false}` there is no declarative starting
   * position, and the imperative set is dropped if it runs before the element
   * has subscribed to the controls. The result was that on every page load —
   * every refresh, every player joining — all the tokens rendered stacked in the
   * board's top-left corner instead of on their tiles, and only sorted
   * themselves out once somebody moved.
   *
   * Giving the element a real starting position fixes the load, and the effect
   * below still owns the walking animation.
   */
  const startNode = BOARD_GRAPH[player.boardPosition];
  const initialPosition = {
    left: `${(startNode?.x ?? 50) + spreadX}%`,
    top: `${(startNode?.y ?? 50) + spreadY}%`,
  };

  useEffect(() => {
    const prevPos = prevPosRef.current;
    const currPos = player.boardPosition;
    
    if (prevPos !== currPos) {
      const pathX = [];
      const pathY = [];

      for (const nodeId of graphPath(prevPos, currPos)) {
        const node = BOARD_GRAPH[nodeId];
        if (node) {
          pathX.push(`${node.x + spreadX}%`);
          pathY.push(`${node.y + spreadY}%`);
        }
      }

      const durationPerStep = 0.5; // Slow down to build suspense!
      const totalSteps = Math.max(1, pathX.length - 1);
      
      controls.start({
        left: pathX,
        top: pathY,
        transition: {
          duration: totalSteps * durationPerStep,
          ease: "linear",
          times: pathX.map((_, i) => i / totalSteps) // distribute evenly
        }
      });
      
      prevPosRef.current = currPos;
    } else {
      // Just snap to current if it's the first render or no change
      const node = BOARD_GRAPH[currPos];
      if (node) {
        controls.set({ left: `${node.x + spreadX}%`, top: `${node.y + spreadY}%` });
      }
    }
  }, [player.boardPosition, spreadX, spreadY, controls]);

  return (
    <motion.div
      key={player.id}
      animate={controls}
      initial={initialPosition}
      className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none ${
        isActive ? 'z-40' : 'z-30'
      }`}
    >
      <motion.div 
        className="relative"
        animate={{ 
          scale: isActive ? 1.08 : 0.92,
          y: isActive ? -6 : 0,
          filter: isActive ? 'drop-shadow(0 0 15px rgba(234,179,8,0.8))' : 'drop-shadow(0 0 5px rgba(0,0,0,0.5))'
        }}
        transition={{ type: 'spring', stiffness: 200, damping: 12 }}
      >
        {isActive && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-partyYellow text-partyDark font-black text-[9px] px-2 py-0.5 rounded-full uppercase shadow-lg animate-bounce whitespace-nowrap z-20">
            YOUR TURN
          </div>
        )}

        {/* The Shield Bubble */}
        <AnimatePresence>
          {player.hasShield && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              transition={{ duration: 0.3 }}
              className="absolute -inset-3 rounded-full border-4 border-cyan-400 bg-cyan-400/20 shadow-[0_0_20px_rgba(34,211,238,0.6)] z-10 animate-pulse"
            />
          )}
        </AnimatePresence>

        <AvatarIllustration
          avatar={player.avatar}
          size={size}
          isSpeaking={isActive}
          className={`relative z-10 shadow-2xl border-2 ${isActive ? 'border-partyYellow' : 'border-white/20'}`}
        />
      </motion.div>
    </motion.div>
  );
}
