'use client';

import React, { useState } from 'react';
import { RoomState, MiniGameId } from '@/lib/types';
import { Swords, CheckCircle2, Circle } from 'lucide-react';
import { roomStore } from '@/lib/roomStore';

interface TeamBattleGameSelectProps {
  room: RoomState;
  myPlayerId: string;
}

const ELIGIBLE_GAMES: { id: MiniGameId; icon: string; label: string; description: string }[] = [
  { id: 'voice_arena', icon: '🎙️', label: 'Voice Arena', description: 'Pronounce words correctly under pressure.' },
  { id: 'pitch_bird', icon: '🐦', label: 'Pitch Bird', description: 'Navigate a bird using the pitch of your voice.' },
  { id: 'solfege', icon: '🎵', label: 'Solfege', description: 'Sing back the correct musical notes.' },
  { id: 'truth_or_bluff', icon: '🎭', label: 'Truth or Bluff', description: 'Tell a convincing lie and fool the other team.' },
  { id: 'spelling_bee', icon: '🐝', label: 'Spelling Bee', description: 'Spell out words letter by letter.' },
  { id: 'story_builder', icon: '📖', label: 'Story Builder', description: 'Add to a growing story, sentence by sentence.' },
  { id: 'debate', icon: '⚖️', label: 'Debate', description: 'Argue your side of a silly topic.' },
  { id: 'guess_the_voice', icon: '🕵️', label: 'Guess the Voice', description: 'Record a disguised message and guess who spoke.' },
  { id: 'trivia_showdown', icon: '🧠', label: 'Trivia Showdown', description: 'Answer trivia questions fast with your voice.' },
  { id: 'asteroid_defense', icon: '☄️', label: 'Asteroid Defense', description: 'Shoot down asteroids by calling out their words!' }
];

export default function TeamBattleGameSelect({ room, myPlayerId }: TeamBattleGameSelectProps) {
  const isHost = room.hostId === myPlayerId;
  const [selectedGames, setSelectedGames] = useState<MiniGameId[]>(ELIGIBLE_GAMES.slice(0, 3).map(g => g.id));

  const toggleGame = (gameId: MiniGameId) => {
    setSelectedGames(prev => 
      prev.includes(gameId) 
        ? prev.filter(g => g !== gameId)
        : [...prev, gameId]
    );
  };

  const handleStartBattle = () => {
    if (!isHost || selectedGames.length === 0) return;
    roomStore.teamBattleStartSeries(room.roomId, selectedGames);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 animate-fadeIn">
      <div className="text-center space-y-2">
        <h2 className="text-3xl sm:text-4xl font-black text-white drop-shadow-md uppercase tracking-wider">
          Draft Your Battle
        </h2>
        <p className="text-gray-300">
          {isHost ? 'Select the mini-games for this series.' : 'Waiting for the host to select games...'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ELIGIBLE_GAMES.map((gameInfo) => {
          const isSelected = selectedGames.includes(gameInfo.id);
          
          return (
            <button
              key={gameInfo.id}
              onClick={() => isHost && toggleGame(gameInfo.id)}
              disabled={!isHost}
              className={`text-left p-4 rounded-2xl border transition-all ${
                isSelected 
                  ? 'bg-white/10 border-partyYellow shadow-[0_0_15px_rgba(255,236,72,0.3)]' 
                  : 'bg-black/40 border-white/10 opacity-70 hover:opacity-100 hover:border-white/30'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="text-3xl mb-3">{gameInfo.icon}</div>
                {isHost && (
                  <div className={isSelected ? 'text-partyYellow' : 'text-gray-500'}>
                    {isSelected ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                  </div>
                )}
              </div>
              <h3 className="text-lg font-bold text-white mb-1">{gameInfo.label}</h3>
              <p className="text-xs text-gray-400 line-clamp-2">{gameInfo.description}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center justify-center pt-8 border-t border-white/10">
        <div className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-widest">
          Series Length: <span className="text-partyYellow">{selectedGames.length} Rounds</span>
        </div>
        
        {isHost ? (
          <button
            onClick={handleStartBattle}
            disabled={selectedGames.length === 0}
            className="px-10 py-4 bg-partyYellow text-partyDark font-black text-lg sm:text-xl rounded-full hover:bg-yellow-400 hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-50 flex items-center gap-3"
          >
            <Swords className="w-6 h-6" />
            START TEAM BATTLE
          </button>
        ) : (
          <div className="glass-pill px-6 py-3 animate-pulse text-gray-300">
            Host is choosing games...
          </div>
        )}
      </div>
    </div>
  );
}
