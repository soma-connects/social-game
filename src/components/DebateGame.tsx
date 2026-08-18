'use client';

import React, { useState, useEffect } from 'react';
import { RoomState, Player, DebateState } from '@/lib/types';
import { aiGameMaster } from '@/lib/aiGameMaster';
import { speechEngine } from '@/lib/speechService';
import { roomStore } from '@/lib/roomStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Send, Sparkles } from 'lucide-react';

interface DebateGameProps {
  room: RoomState;
  activePlayer: Player;
  myPlayer: Player;
  isMyTurn: boolean;
  roomId: string;
}

export default function DebateGame({
  room,
  activePlayer,
  myPlayer,
  isMyTurn,
  roomId
}: DebateGameProps) {
  const debateState = room.debateState as DebateState | undefined | null;
  const serverPhase = debateState?.phase;
  
  const [localPhase, setLocalPhase] = useState<'intro' | 'p1_speaking' | 'p2_speaking' | 'voting' | 'reveal'>(
    serverPhase || 'intro'
  );
  
  const [topic, setTopic] = useState(debateState?.topic || '');
  const [side1, setSide1] = useState(debateState?.side1 || '');
  const [side2, setSide2] = useState(debateState?.side2 || '');
  
  const [argument, setArgument] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  
  useEffect(() => {
    if (serverPhase) setLocalPhase(serverPhase);
  }, [serverPhase]);

  useEffect(() => {
    if (isMyTurn && localPhase === 'intro' && !topic) {
      const prompt = aiGameMaster.getRandomChallenge('debate');
      setTopic(prompt.text);
      // Determine players for side1 and side2. 
      // Typically the backend sets this, but for now we'll just show the generated challenge if it has sides
      setSide1('Pro');
      setSide2('Against');
    }
  }, [isMyTurn, localPhase, topic]);

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
      await roomStore.send(roomId, { action: 'debate_reveal', playerId: myPlayer.id });
    } catch (e) {}
  };

  const handleStartGame = async () => {
    try {
      await roomStore.send(roomId, { action: 'debate_start', playerId: myPlayer.id, topic, side1, side2 });
    } catch (e) {}
  };

  const recordSpeech = async () => {
    if (isRecording) {
      speechEngine.stopListening();
      setIsRecording(false);
      return;
    }
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
            setArgument(result.transcript);
          }
          if (result.isFinal && session) {
            session.stop();
            setIsRecording(false);
          }
        },
        onError: () => setIsRecording(false)
      });
      setTimeout(() => {
        speechEngine.stopListening();
        setIsRecording(false);
      }, 15000);
    } catch (error) {
      setIsRecording(false);
    }
  };

  const handleSubmitArgument = async () => {
    if (!argument) return;
    try {
      await roomStore.send(roomId, {
          action: 'debate_submit_argument',
          playerId: myPlayer.id,
          argument
        });
      setArgument('');
    } catch (e) {}
  };

  const handleVote = async (votePlayerId: 1 | 2) => {
    try {
      await roomStore.send(roomId, {
          action: 'debate_vote',
          playerId: myPlayer.id,
          vote: votePlayerId
        });
    } catch (e) {}
  };

  const players = room.players || [];
  const player1 = players.find(p => p.id === debateState?.player1Id);
  const player2 = players.find(p => p.id === debateState?.player2Id);

  const amIPlayer1 = myPlayer.id === debateState?.player1Id;
  const amIPlayer2 = myPlayer.id === debateState?.player2Id;
  const isMyDebateTurn = (localPhase === 'p1_speaking' && amIPlayer1) || (localPhase === 'p2_speaking' && amIPlayer2);

  const renderIntro = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col items-center p-8 bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl text-center shadow-xl w-full max-w-2xl mx-auto"
    >
      <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mb-6 uppercase tracking-wider flex items-center gap-3">
        <Sparkles className="w-8 h-8 text-red-500" />
        MASTER DEBATE
        <Sparkles className="w-8 h-8 text-orange-500" />
      </h2>
      
      {isMyTurn ? (
        <>
          <p className="text-xl text-white/90 font-medium mb-8 bg-white/5 p-6 rounded-2xl border border-white/10 shadow-inner">
            {topic || 'Generating debate topic...'}
          </p>
          <button
            onClick={handleStartGame}
            className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold rounded-2xl shadow-lg transform hover:scale-105 active:scale-95 transition-all text-lg"
          >
            START DEBATE
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center py-8">
          <p className="text-2xl text-partyCyan font-bold mb-4 animate-pulse">
            {activePlayer?.name || 'Player'} is explaining the topic...reparing the debate...
          </p>
        </div>
      )}
    </motion.div>
  );

  const renderSpeaking = () => {
    const isP1 = localPhase === 'p1_speaking';
    const activeDebater = isP1 ? player1 : player2;
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col gap-6 mx-auto"
      >
        <h3 className="text-2xl font-bold text-center text-white mb-2">Topic: {debateState?.topic}</h3>
        
        <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl">
          <div className={`text-center flex-1 ${isP1 ? 'text-partyYellow font-bold scale-110 transition-transform' : 'text-white/50'}`}>
            <p>{player1?.name}</p>
            <p className="text-sm">({debateState?.side1})</p>
          </div>
          <div className="text-2xl font-black text-red-500 mx-4">VS</div>
          <div className={`text-center flex-1 ${!isP1 ? 'text-partyCyan font-bold scale-110 transition-transform' : 'text-white/50'}`}>
            <p>{player2?.name}</p>
            <p className="text-sm">({debateState?.side2})</p>
          </div>
        </div>

        {isMyDebateTurn ? (
          <div className="flex flex-col gap-2 mt-4">
            <label className="text-partyCyan font-bold tracking-wider text-sm">YOUR ARGUMENT</label>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                value={argument}
                onChange={(e) => setArgument(e.target.value)}
                placeholder="State your case..."
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
              onClick={handleSubmitArgument}
              disabled={!argument}
              className="mt-2 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl"
            >
              <Send className="w-5 h-5 inline mr-2" /> SUBMIT ARGUMENT
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 mt-4 border border-white/10 rounded-xl bg-white/5">
            <div className="w-12 h-12 rounded-full bg-partyCyan/20 flex items-center justify-center mb-4 animate-pulse">
              <Mic className="w-6 h-6 text-partyCyan" />
            </div>
            <p className="text-xl text-white font-bold">{activeDebater?.name} is speaking...</p>
          </div>
        )}
      </motion.div>
    );
  };

  const renderVoting = () => {
    const votes = debateState?.votes || {};
    const hasVoted = myPlayer.id in votes;
    const canVote = !amIPlayer1 && !amIPlayer2; // Debaters don't vote
    
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="w-full max-w-4xl flex flex-col items-center gap-8 mx-auto"
      >
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-3xl font-black text-white text-center">Who won the debate? ðŸŽ¤</h2>
          <div className="text-4xl font-bold text-partyYellow my-4">{timeLeft}</div>
        </div>

        <div className="flex flex-col md:flex-row gap-6 w-full">
          {[1, 2].map((side) => {
            const debater = side === 1 ? player1 : player2;
            const sideLabel = side === 1 ? debateState?.side1 : debateState?.side2;
            return (
              <motion.button
                key={side}
                whileHover={canVote && !hasVoted ? { scale: 1.05 } : {}}
                whileTap={canVote && !hasVoted ? { scale: 0.95 } : {}}
                onClick={() => canVote && !hasVoted && handleVote(side as 1 | 2)}
                disabled={!canVote || hasVoted}
                className={`relative flex-1 p-8 rounded-2xl border text-center transition-all ${
                  hasVoted && votes[myPlayer.id] === side
                    ? 'bg-partyYellow/20 border-partyYellow shadow-[0_0_30px_rgba(255,208,0,0.3)]'
                    : 'bg-gradient-to-r from-blue-900/40 to-purple-900/40 border-white/20'
                }`}
              >
                <p className="text-2xl font-bold text-white mb-2">{debater?.name}</p>
                <p className="text-lg text-white/70 italic">{sideLabel}</p>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    );
  };

  const renderReveal = () => {
    const votes = debateState?.votes || {};
    let votes1 = 0;
    let votes2 = 0;
    Object.values(votes).forEach(v => {
      if (v === 1) votes1++;
      if (v === 2) votes2++;
    });

    const winnerId = votes1 > votes2 ? 1 : votes2 > votes1 ? 2 : null;
    const winnerName = winnerId === 1 ? (player1?.name || 'Player 1') : (player2?.name || 'Player 2');

    const handleContinue = async () => {
      if (isMyTurn) {
        if (room.roomType === 'board_game') {
          // The setback for losing a sudden-death trap is applied server-side at
          // debate_reveal, from the stored votes. This only closes the phase out.
          try {
            await roomStore.send(roomId, { action: 'complete_trap', coinsLost: 0 });
          } catch (e) {}
        } else if (room.roomType === 'team_battle') {
          try {
            await roomStore.send(roomId, { action: 'complete_team_battle' });
          } catch (e) {}
        } else {
          roomStore.completeMiniGame(roomId, 'debate', 100);
        }
      }
    };

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-4xl flex flex-col items-center gap-8 mx-auto"
      >
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-3xl font-black mb-2">
            {winnerId === null ? "It's a draw!" : `${winnerName} Wins!`}
          </h2>
          <div className="text-4xl font-bold text-partyYellow my-4">{timeLeft}</div>
        </div>

        <div className="flex gap-8 items-end">
          <div className="flex flex-col items-center">
            <div className="text-4xl font-black text-partyYellow mb-2">{votes1}</div>
            <div className="p-4 bg-white/10 rounded-xl w-32 text-center border-t-4 border-partyYellow">
              {player1?.name}
            </div>
          </div>

          <div className="text-2xl font-black text-white mb-8">VS</div>

          <div className="flex flex-col items-center">
            <div className="text-4xl font-black text-partyCyan mb-2">{votes2}</div>
            <div className="p-4 bg-white/10 rounded-xl w-32 text-center border-t-4 border-partyCyan">
              {player2?.name}
            </div>
          </div>
        </div>

        <div className="text-3xl font-bold text-white mt-4 bg-white/10 p-6 rounded-2xl">
          {winnerId === null ? (
            <>NO WINNER — <span className="text-blue-300 font-bold">the room was split</span></>
          ) : (
            <>WINNER: <span className="text-blue-300 font-bold">{winnerName}</span>!</>
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
        {localPhase === 'intro' && <motion.div key="p1" className="w-full">{renderIntro()}</motion.div>}
        {(localPhase === 'p1_speaking' || localPhase === 'p2_speaking') && <motion.div key="p2" className="w-full">{renderSpeaking()}</motion.div>}
        {localPhase === 'voting' && <motion.div key="p3" className="w-full">{renderVoting()}</motion.div>}
        {localPhase === 'reveal' && <motion.div key="p4" className="w-full">{renderReveal()}</motion.div>}
      </AnimatePresence>
    </div>
  );
}


