'use client';

import React, { useState, useEffect } from 'react';
import { RoomState, Player, StoryBuilderState } from '@/lib/types';
import { aiGameMaster } from '@/lib/aiGameMaster';
import { speechEngine } from '@/lib/speechService';
import { roomStore } from '@/lib/roomStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Send, Sparkles, CheckCircle2 } from 'lucide-react';
import { micStream } from '@/lib/micStream';
import MicContentionNotice from './MicContentionNotice';

interface StoryBuilderGameProps {
  room: RoomState;
  activePlayer: Player;
  myPlayer: Player;
  isMyTurn: boolean;
  roomId: string;
}

export default function StoryBuilderGame({
  room,
  activePlayer,
  myPlayer,
  isMyTurn,
  roomId
}: StoryBuilderGameProps) {
  const storyBuilderState = room.storyBuilderState as StoryBuilderState | undefined | null;
  const serverPhase = storyBuilderState?.phase;
  
  const [localPhase, setLocalPhase] = useState<'prompting' | 'speaking' | 'voting' | 'reveal'>(
    serverPhase || 'prompting'
  );
  
  const [promptText, setPromptText] = useState(storyBuilderState?.prompt || '');
  const [sentence, setSentence] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  
  useEffect(() => {
    if (serverPhase) {
      setLocalPhase(serverPhase);
    }
  }, [serverPhase]);

  useEffect(() => {
    if (isMyTurn && localPhase === 'prompting' && !promptText) {
      // The active player generates the prompt
      const prompt = aiGameMaster.getRandomChallenge('story_builder');
      setPromptText(prompt.text);
      // Wait for user to trigger start, or just start it automatically on server
    }
  }, [isMyTurn, localPhase, promptText]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (localPhase === 'voting') {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            if (isMyTurn) handleReveal();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [localPhase, isMyTurn]);

  const handleReveal = async () => {
    try {
      await roomStore.send(roomId, { action: 'story_builder_reveal', playerId: myPlayer.id });
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartGame = async () => {
    try {
      await roomStore.send(roomId, { action: 'story_builder_start', playerId: myPlayer.id, prompt: promptText });
    } catch (e) {
      console.error(e);
    }
  };

  const recordSpeech = async () => {
    if (isRecording) {
      speechEngine.stopListening();
      setIsRecording(false);
      return;
    }
    await beginRecording();
  };

  /** The actual session start, unconditional — recordSpeech's toggle guard lives above it. */
  const beginRecording = async () => {
    setIsRecording(true);
    try {
      const accessError = await speechEngine.probeMicPermission();
      if (accessError) {
        setIsRecording(false);
        return;
      }
      let session: any = null;
      session = speechEngine.listenForSpeech({
        targetWord: '',
        language: 'en-US',
        onResult: (result: any) => {
          if (result && result.transcript) {
            setSentence(result.transcript);
          }
          if (result.isFinal && session) {
            session.stop();
            setIsRecording(false);
          }
        },
        onError: (err) => {
          console.error(err);
          setIsRecording(false);
        }
      });
      setTimeout(() => {
        speechEngine.stopListening();
        setIsRecording(false);
      }, 15000);
    } catch (error) {
      console.error(error);
      setIsRecording(false);
    }
  };

  /** Restarts recording with the mic taken off the call. */
  const restartWithMicPriority = () => {
    micStream.setSpeechPriority(true);
    speechEngine.stopListening();
    void beginRecording();
  };

  const handleSubmitSentence = async () => {
    if (!sentence) return;
    try {
      await roomStore.send(roomId, {
          action: 'story_builder_submit_sentence',
          playerId: myPlayer.id,
          sentence
        });
      setSentence('');
    } catch (e) {
      console.error(e);
    }
  };

  const handleVote = async (votePlayerId: string) => {
    try {
      await roomStore.send(roomId, {
          action: 'story_builder_vote',
          playerId: myPlayer.id,
          votePlayerId
        });
    } catch (e) {
      console.error(e);
    }
  };

  const players = room.players || [];
  const currentPlayer = storyBuilderState ? players[storyBuilderState.currentPlayerIndex] : null;
  const isMySpeakingTurn = currentPlayer?.id === myPlayer.id;

  const renderPhase1 = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col items-center p-8 bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl text-center shadow-xl w-full max-w-2xl mx-auto"
    >
      <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-partyYellow to-partyPink mb-6 uppercase tracking-wider flex items-center gap-3">
        <Sparkles className="w-8 h-8 text-partyYellow" />
        STORY BUILDER
        <Sparkles className="w-8 h-8 text-partyPink" />
      </h2>
      
      {isMyTurn ? (
        <>
          <p className="text-xl text-white/90 font-medium mb-8 bg-white/5 p-6 rounded-2xl border border-white/10 shadow-inner">
            {promptText || 'Generating starting prompt...'}
          </p>
          <button
            onClick={handleStartGame}
            className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/20 transform hover:scale-105 active:scale-95 transition-all text-lg flex items-center gap-2"
          >
            START STORY
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center py-8">
          <p className="text-2xl text-partyCyan font-bold mb-4 animate-pulse">
            {activePlayer?.name || 'Player'} is generating the starting prompt...
          </p>
        </div>
      )}
    </motion.div>
  );

  const renderPhase2 = () => {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col gap-6 mx-auto"
      >
        <h3 className="text-2xl font-bold text-center text-white mb-2">Build the Story</h3>
        
        <div className="bg-white/5 p-4 rounded-xl border border-white/10 max-h-64 overflow-y-auto">
          <p className="text-partyYellow font-medium mb-2 italic">"{storyBuilderState?.prompt}"</p>
          {storyBuilderState?.story.map((entry, idx) => {
            const player = players.find(p => p.id === entry.playerId);
            return (
              <div key={idx} className="mb-2">
                <span className="text-partyCyan font-bold mr-2">{player?.name || 'Unknown'}:</span>
                <span className="text-white/90">{entry.sentence}</span>
              </div>
            );
          })}
        </div>

        {isMySpeakingTurn ? (
          <div className="flex flex-col gap-2 mt-4">
            <label className="text-partyCyan font-bold tracking-wider text-sm">YOUR SENTENCE</label>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
                placeholder={`${currentPlayer?.name || 'Unknown'} is continuing the story...`}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-partyCyan/50 transition-colors"
              />
              <button
                onClick={recordSpeech}
                className={`p-3 rounded-xl flex items-center justify-center transition-all ${
                  isRecording 
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse' 
                    : 'bg-partyCyan/10 text-partyCyan hover:bg-partyCyan/20 border border-partyCyan/30'
                }`}
              >
                <Mic className="w-6 h-6" />
              </button>
            </div>
            <button
              onClick={handleSubmitSentence}
              disabled={!sentence}
              className="mt-2 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl"
            >
              <Send className="w-5 h-5 inline mr-2" /> SUBMIT
            </button>
            <MicContentionNotice active={isRecording} onClaimPriority={restartWithMicPriority} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 mt-4 border border-white/10 rounded-xl bg-white/5">
            <div className="w-12 h-12 rounded-full bg-partyCyan/20 flex items-center justify-center mb-4 animate-pulse">
              <Mic className="w-6 h-6 text-partyCyan" />
            </div>
            <p className="text-xl text-white font-bold">{currentPlayer?.name} is speaking...</p>
          </div>
        )}
      </motion.div>
    );
  };

  const renderPhase3 = () => {
    const votes = storyBuilderState?.votes || {};
    
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="w-full max-w-4xl flex flex-col items-center gap-8 mx-auto"
      >
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-3xl font-black text-white text-center">Who was the funniest? 😂</h2>
          <div className="text-4xl font-bold text-partyYellow my-4">{timeLeft}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {players.map((p) => {
            if (p.id === myPlayer.id) return null; // Can't vote for yourself
            
            const hasVoted = storyBuilderState?.votes?.[myPlayer.id] !== undefined;
            const isSelected = storyBuilderState?.votes?.[myPlayer.id] === p.id;
            
            return (
              <motion.button
                key={p.id}
                whileHover={!hasVoted ? { scale: 1.05 } : {}}
                whileTap={!hasVoted ? { scale: 0.95 } : {}}
                onClick={() => !hasVoted && handleVote(p.id)}
                disabled={hasVoted}
                className={`p-6 rounded-2xl border text-left transition-all ${
                  isSelected
                    ? 'bg-partyYellow/20 border-partyYellow'
                    : 'bg-white/10 border-white/20'
                }`}
              >
                <span className="font-bold text-white group-hover:text-partyCyan transition-colors">{p.name || 'Unknown'}</span>
              </motion.button>
            );
          })}
        </div>

        {storyBuilderState?.votes?.[myPlayer.id] !== undefined && (
          <p className="text-xl text-partyYellow font-bold mt-4 animate-pulse">Waiting for others to vote...</p>
        )}
      </motion.div>
    );
  };

  const renderPhase4 = () => {
    const votes = storyBuilderState?.votes || {};
    const voteCounts: Record<string, number> = {};
    Object.values(votes).forEach(votePlayerId => {
      voteCounts[votePlayerId] = (voteCounts[votePlayerId] || 0) + 1;
    });

    let winnerId = '';
    let maxVotes = 0;
    Object.entries(voteCounts).forEach(([pid, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        winnerId = pid;
      }
    });
    
    const winner = players.find(p => p.id === winnerId);

    const handleContinue = () => {
      if (isMyTurn) {
        roomStore.completeMiniGame(roomId, 'story_builder', 100);
      }
    };

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-4xl flex flex-col items-center gap-8 mx-auto"
      >
        <h2 className="text-4xl font-black text-white text-center tracking-widest uppercase">
          RESULTS
        </h2>

        <div className="p-8 rounded-2xl border-4 border-partyYellow bg-partyYellow/10 text-center w-full max-w-lg">
          <h3 className="text-2xl text-white mb-4">Funniest Contributor</h3>
          {winner ? (
            <p className="text-5xl font-black text-partyYellow flex items-center justify-center gap-4">
              <Sparkles /> {winner.name} <Sparkles />
            </p>
          ) : (
            <p className="text-3xl font-bold text-white/50">It's a tie (or no votes)!</p>
          )}
        </div>

        {isMyTurn && (
          <motion.button
            onClick={handleContinue}
            className="mt-4 px-12 py-4 bg-gradient-to-r from-partyPink to-purple-600 text-white font-black rounded-full text-xl"
          >
            CONTINUE
          </motion.button>
        )}
      </motion.div>
    );
  };

  return (
    <div className="w-full min-h-[60vh] flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {localPhase === 'prompting' && <motion.div key="p1" className="w-full">{renderPhase1()}</motion.div>}
        {localPhase === 'speaking' && <motion.div key="p2" className="w-full">{renderPhase2()}</motion.div>}
        {localPhase === 'voting' && <motion.div key="p3" className="w-full">{renderPhase3()}</motion.div>}
        {localPhase === 'reveal' && <motion.div key="p4" className="w-full">{renderPhase4()}</motion.div>}
      </AnimatePresence>
    </div>
  );
}


