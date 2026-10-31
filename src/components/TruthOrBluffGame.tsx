'use client';

import React, { useState, useEffect } from 'react';
import { RoomState, Player, TruthBluffState } from '@/lib/types';
import { aiGameMaster } from '@/lib/aiGameMaster';
import { speechEngine } from '@/lib/speechService';
import { audioSFX } from '@/lib/audioFeedback';
import { roomStore } from '@/lib/roomStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, Vote, Eye, Sparkles, Clock, CheckCircle2, XCircle, Volume2, Radio } from 'lucide-react';
import { micStream } from '@/lib/micStream';
import MicContentionNotice from './MicContentionNotice';

interface TruthOrBluffGameProps {
  room: RoomState;
  activePlayer: Player;
  myPlayer: Player;
  isMyTurn: boolean;
  roomId: string;
}

export default function TruthOrBluffGame({
  room,
  activePlayer,
  myPlayer,
  isMyTurn,
  roomId
}: TruthOrBluffGameProps) {
  const truthBluffState = room.truthBluffState as TruthBluffState | undefined | null;
  const serverPhase = truthBluffState?.phase;
  
  // Local state
  const [localPhase, setLocalPhase] = useState<'prompting' | 'speaking' | 'voting' | 'reveal'>(
    serverPhase || 'prompting'
  );
  const [promptText, setPromptText] = useState('');
  
  // Phase 2 state
  const [claim1, setClaim1] = useState('');
  const [claim2, setClaim2] = useState('');
  const [isRecording1, setIsRecording1] = useState(false);
  const [isRecording2, setIsRecording2] = useState(false);
  const [hasRecorded1, setHasRecorded1] = useState(false);
  const [hasRecorded2, setHasRecorded2] = useState(false);
  /** Which claim is currently being recorded, so a mic-priority claim can restart it. */
  const activeClaimRef = React.useRef<1 | 2 | null>(null);
  const [selectedLieIndex, setSelectedLieIndex] = useState<0 | 1 | null>(null);
  
  // Phase 3 state
  const [timeLeft, setTimeLeft] = useState(15);
  
  // Sync server phase to local phase
  useEffect(() => {
    if (serverPhase) {
      setLocalPhase(serverPhase as any);
    }
  }, [serverPhase]);

  // Initial setup for Phase 1
  useEffect(() => {
    if (isMyTurn && localPhase === 'prompting' && !promptText) {
      const prompt = aiGameMaster.getRandomChallenge('truth_bluff');
      setPromptText(prompt.text);
      aiGameMaster.speak("Truth or Bluff! Tell us two things — one true, one false!");
    }
  }, [isMyTurn, localPhase, promptText]);

  // Countdown timer for Phase 3 (Voting)
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (localPhase === 'voting') {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            if (isMyTurn) {
              handleReveal();
            }
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
      await roomStore.send(roomId, { action: 'truth_bluff_reveal', playerId: myPlayer.id });
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartSpeaking = () => {
    setLocalPhase('speaking');
  };

  const recordSpeech = async (claimNum: 1 | 2) => {
    const isRec = claimNum === 1 ? isRecording1 : isRecording2;
    if (isRec) {
      speechEngine.stopListening();
      if (claimNum === 1) {
        setIsRecording1(false);
        setHasRecorded1(true);
      } else {
        setIsRecording2(false);
        setHasRecorded2(true);
      }
      return;
    }
    await beginRecording(claimNum);
  };

  /** The actual session start, unconditional — recordSpeech's toggle guard lives above it. */
  const beginRecording = async (claimNum: 1 | 2) => {
    if (claimNum === 1) {
      setIsRecording1(true);
      setHasRecorded1(true);
      if (isRecording2) {
        speechEngine.stopListening();
        setIsRecording2(false);
      }
    } else {
      setIsRecording2(true);
      setHasRecorded2(true);
      if (isRecording1) {
        speechEngine.stopListening();
        setIsRecording1(false);
      }
    }
    activeClaimRef.current = claimNum;

    try {
      const accessError = await speechEngine.probeMicPermission();
      if (accessError) {
        if (claimNum === 1) setIsRecording1(false);
        else setIsRecording2(false);
        return;
      }

      let session: any = null;
      session = speechEngine.listen({
        roomId: roomId,
        mode: 'dictation',
        targetWord: '',
        language: 'en-US',
        onResult: (result: any) => {
          if (result && result.transcript) {
            if (claimNum === 1) setClaim1(result.transcript);
            else setClaim2(result.transcript);
          }
          if (result.isFinal && session) {
            session.stop();
            if (claimNum === 1) setIsRecording1(false);
            else setIsRecording2(false);
          }
        },
        onError: (err) => {
          console.error('Speech recognition error', err);
          if (claimNum === 1) setIsRecording1(false);
          else setIsRecording2(false);
        }
      });

      // Stop automatically after 20s if still open
      setTimeout(() => {
        speechEngine.stopListening();
        if (claimNum === 1) setIsRecording1(false);
        else setIsRecording2(false);
      }, 20000);

    } catch (error) {
      console.error('Speech recognition error', error);
      if (claimNum === 1) setIsRecording1(false);
      else setIsRecording2(false);
    }
  };

  /** Restarts the active claim's recording with the mic taken off the call. */
  const restartWithMicPriority = () => {
    micStream.setSpeechPriority(true);
    const claimNum = activeClaimRef.current;
    if (!claimNum) return;
    speechEngine.stopListening();
    void beginRecording(claimNum);
  };

  const handleSubmitClaims = async () => {
    if (selectedLieIndex === null) return;
    const finalClaim1 = claim1.trim() || 'Statement 1 (Spoken live)';
    const finalClaim2 = claim2.trim() || 'Statement 2 (Spoken live)';
    try {
      await roomStore.send(roomId, {
          action: 'truth_bluff_submit_claims',
          playerId: myPlayer.id,
          claims: [finalClaim1, finalClaim2],
          lieIndex: selectedLieIndex,
          // Sent because the round reads it back out of room state to show the
          // whole room. It never was, so every round displayed the literal
          // words "Truth or Bluff" instead of the prompt just drawn.
          prompt: promptText,
        });
    } catch (e) {
      console.error(e);
    }
  };

  const handleVote = async (index: number) => {
    try {
      await roomStore.send(roomId, {
          action: 'truth_bluff_vote',
          playerId: myPlayer.id,
          voteIndex: index
        });
    } catch (e) {
      console.error(e);
    }
  };

  const renderPhase1 = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col items-center p-8 bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl text-center shadow-xl w-full max-w-2xl mx-auto"
    >
      <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-partyYellow to-partyPink mb-6 uppercase tracking-wider flex items-center gap-3">
        <Sparkles className="w-8 h-8 text-partyYellow" />
        🎭 TRUTH OR BLUFF
        <Sparkles className="w-8 h-8 text-partyPink" />
      </h2>
      
      {isMyTurn ? (
        <>
          <p className="text-xl text-white/90 font-medium mb-8 bg-white/5 p-6 rounded-2xl border border-white/10 shadow-inner">
            {promptText || 'Generating challenge...'}
          </p>
          <button
            onClick={handleStartSpeaking}
            className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/20 transform hover:scale-105 active:scale-95 transition-all text-lg flex items-center gap-2"
          >
            <Mic className="w-6 h-6" />
            I'M READY TO SPEAK
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center py-8">
          <p className="text-2xl text-partyCyan font-bold mb-4 animate-pulse">
            {activePlayer?.name || 'Player'} is thinking about their claims...
          </p>
          <div className="flex gap-2 mb-6">
            <span className="w-3 h-3 bg-partyPink rounded-full animate-bounce delay-100"></span>
            <span className="w-3 h-3 bg-partyCyan rounded-full animate-bounce delay-200"></span>
            <span className="w-3 h-3 bg-partyYellow rounded-full animate-bounce delay-300"></span>
          </div>
          {truthBluffState?.prompt && (
             <p className="text-lg text-white/70 italic bg-white/5 p-4 rounded-xl border border-white/10">
               {truthBluffState.prompt}
             </p>
          )}
        </div>
      )}
    </motion.div>
  );

  const renderPhase2 = () => {
    if (!isMyTurn) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex flex-col items-center justify-center p-12 bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl w-full max-w-2xl text-center mx-auto"
        >
          <div className="w-16 h-16 rounded-full bg-partyCyan/20 border-2 border-partyCyan/50 flex items-center justify-center mb-6 animate-pulse">
            <Mic className="w-8 h-8 text-partyCyan" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">{activePlayer?.name} is speaking...</h3>
          <p className="text-white/60">They are preparing their claims.</p>
        </motion.div>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-black/30 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col gap-6 mx-auto shadow-2xl"
      >
        <div className="text-center">
          <span className="px-3 py-1 bg-partyYellow/20 text-partyYellow rounded-full text-xs font-bold tracking-widest uppercase border border-partyYellow/30">
            Voice Mode
          </span>
          <h3 className="text-2xl font-black text-white mt-2">Speak Your 2 Statements</h3>
          <p className="text-white/60 text-sm mt-1">
            Say one truth and one bluff out loud. Tap each statement button while you speak.
          </p>
        </div>

        <MicContentionNotice active={isRecording1 || isRecording2} onClaimPriority={restartWithMicPriority} />

        {/* Secret Choice: Which one is the lie? */}
        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
          <p className="text-center font-bold text-partyYellow text-sm tracking-wide uppercase mb-3 flex items-center justify-center gap-2">
            <Eye className="w-4 h-4" /> Secret: Which statement is your BLUFF?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSelectedLieIndex(0)}
              className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                selectedLieIndex === 0 
                  ? 'bg-partyYellow text-black border-partyYellow font-bold shadow-lg shadow-partyYellow/20' 
                  : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
              }`}
            >
              <span className="text-xs uppercase font-extrabold tracking-wider">Statement 1</span>
              <span className="text-sm font-black">Is the BLUFF 🤥</span>
            </button>
            <button
              onClick={() => setSelectedLieIndex(1)}
              className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                selectedLieIndex === 1 
                  ? 'bg-partyYellow text-black border-partyYellow font-bold shadow-lg shadow-partyYellow/20' 
                  : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
              }`}
            >
              <span className="text-xs uppercase font-extrabold tracking-wider">Statement 2</span>
              <span className="text-sm font-black">Is the BLUFF 🤥</span>
            </button>
          </div>
        </div>

        {/* Spoken Statement 1 */}
        <div className="flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-partyCyan font-black tracking-wider text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-partyCyan/20 text-partyCyan flex items-center justify-center text-xs">1</span>
              STATEMENT #1
            </span>
            {hasRecorded1 && !isRecording1 && (
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Spoken
              </span>
            )}
          </div>

          {/* Real-time transcribed text display */}
          <div className="min-h-[56px] p-3 rounded-xl bg-black/40 border border-white/10 text-white/90 text-sm flex items-center">
            {isRecording1 ? (
              <div className="flex items-center gap-2 text-partyCyan">
                <Radio className="w-4 h-4 animate-pulse text-red-400 shrink-0" />
                <span className="italic">{claim1 || 'Listening... speak Statement 1 now!'}</span>
              </div>
            ) : claim1 ? (
              <span>"{claim1}"</span>
            ) : (
              <span className="text-white/40 italic">Tap button below and speak Statement 1...</span>
            )}
          </div>

          <button
            onClick={() => recordSpeech(1)}
            className={`w-full py-3.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md ${
              isRecording1
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-red-500/30'
                : hasRecorded1
                  ? 'bg-partyCyan/15 hover:bg-partyCyan/25 text-partyCyan border border-partyCyan/40'
                  : 'bg-gradient-to-r from-partyCyan to-blue-500 hover:opacity-95 text-black'
            }`}
          >
            <Mic className="w-5 h-5" />
            {isRecording1 ? 'Done Speaking Statement 1 (Tap to Stop)' : hasRecorded1 ? 'Re-record Statement 1' : 'Speak Statement 1'}
          </button>
        </div>

        {/* Spoken Statement 2 */}
        <div className="flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-partyPink font-black tracking-wider text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-partyPink/20 text-partyPink flex items-center justify-center text-xs">2</span>
              STATEMENT #2
            </span>
            {hasRecorded2 && !isRecording2 && (
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Spoken
              </span>
            )}
          </div>

          {/* Real-time transcribed text display */}
          <div className="min-h-[56px] p-3 rounded-xl bg-black/40 border border-white/10 text-white/90 text-sm flex items-center">
            {isRecording2 ? (
              <div className="flex items-center gap-2 text-partyPink">
                <Radio className="w-4 h-4 animate-pulse text-red-400 shrink-0" />
                <span className="italic">{claim2 || 'Listening... speak Statement 2 now!'}</span>
              </div>
            ) : claim2 ? (
              <span>"{claim2}"</span>
            ) : (
              <span className="text-white/40 italic">Tap button below and speak Statement 2...</span>
            )}
          </div>

          <button
            onClick={() => recordSpeech(2)}
            className={`w-full py-3.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md ${
              isRecording2
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-red-500/30'
                : hasRecorded2
                  ? 'bg-partyPink/15 hover:bg-partyPink/25 text-partyPink border border-partyPink/40'
                  : 'bg-gradient-to-r from-partyPink to-rose-500 hover:opacity-95 text-white'
            }`}
          >
            <Mic className="w-5 h-5" />
            {isRecording2 ? 'Done Speaking Statement 2 (Tap to Stop)' : hasRecorded2 ? 'Re-record Statement 2' : 'Speak Statement 2'}
          </button>
        </div>

        {/* Submit to Open Voting */}
        <button
          onClick={handleSubmitClaims}
          disabled={selectedLieIndex === null || (!hasRecorded1 && !claim1) || (!hasRecorded2 && !claim2)}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-2xl shadow-lg shadow-emerald-500/20 transform hover:scale-[1.01] active:scale-98 transition-all text-lg flex justify-center items-center gap-2"
        >
          <Send className="w-5 h-5" />
          {selectedLieIndex === null ? 'Select Which Is Your Bluff First' : 'Done Speaking — Open Voting'}
        </button>
      </motion.div>
    );
  };

  const renderPhase3 = () => {
    const votes = truthBluffState?.votes || {};
    // Calculate total players depending on if it's an array or object
    const totalPlayers = Array.isArray(room.players) 
      ? room.players.length - 1 
      : Object.keys(room.players || {}).length - 1; 
      
    const voteCount = Object.keys(votes).length;
    const hasVoted = myPlayer.id in votes;
    const claims = truthBluffState?.claims || [claim1, claim2];

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="w-full max-w-4xl flex flex-col items-center gap-8 mx-auto"
      >
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-3xl font-black text-white text-center">Which one is the LIE? 🤔</h2>
          
          <div className="relative w-24 h-24 flex items-center justify-center mt-4">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
              <circle 
                cx="50" 
                cy="50" 
                r="45" 
                fill="none" 
                stroke="#FFD000" 
                strokeWidth="8" 
                strokeDasharray="283" 
                strokeDashoffset={283 - (283 * timeLeft) / 15}
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            <span className="absolute text-3xl font-bold text-white">{timeLeft}</span>
          </div>
          
          <p className="text-white/70 font-medium">
            {voteCount} / {totalPlayers > 0 ? totalPlayers : 0} players voted
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 w-full">
          {claims.map((claim, idx) => (
            <motion.button
              key={idx}
              whileHover={!isMyTurn && !hasVoted ? { scale: 1.05 } : {}}
              whileTap={!isMyTurn && !hasVoted ? { scale: 0.95 } : {}}
              onClick={() => !isMyTurn && !hasVoted && handleVote(idx)}
              disabled={isMyTurn || hasVoted}
              className={`relative flex-1 p-8 rounded-2xl border text-left transition-all overflow-hidden group flex gap-6 items-center ${
                hasVoted && votes[myPlayer.id] === idx
                  ? 'bg-partyYellow/20 border-partyYellow shadow-[0_0_30px_rgba(255,208,0,0.3)]'
                  : 'bg-gradient-to-r from-purple-500/20 to-fuchsia-500/20 border-fuchsia-400/30'
              }`}
            >
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className={`w-16 h-16 shrink-0 rounded-full flex items-center justify-center text-3xl font-black ${
                hasVoted && votes[myPlayer.id] === idx ? 'bg-partyYellow text-black' : 'bg-white/10 text-white'
              }`}>
                {idx === 0 ? '🅰️' : '🅱️'}
              </div>
              <p className="text-xl font-medium text-white/90">{claim}</p>
            </motion.button>
          ))}
        </div>

        {isMyTurn && (
          <p className="text-xl text-partyCyan animate-pulse mt-4 font-medium">Waiting for votes...</p>
        )}
        {!isMyTurn && hasVoted && (
          <p className="text-xl text-partyYellow font-bold mt-4 animate-pulse">You voted! Waiting for results...</p>
        )}
      </motion.div>
    );
  };

  const renderPhase4 = () => {
    const claims = truthBluffState?.claims || [claim1, claim2];
    const lieIndex = truthBluffState?.lieIndex ?? selectedLieIndex;
    const votes = truthBluffState?.votes || {};
    
    let correctGuessers: string[] = [];
    let fooledGuessers: string[] = [];

    // Safely extract names from room.players based on structure
    Object.entries(votes).forEach(([voterId, voteIdx]) => {
      let voterName = 'Unknown';
      if (Array.isArray(room.players)) {
        const p = room.players.find(p => p.id === voterId);
        if (p) voterName = p.name;
      } else {
        const p = (room.players as Record<string, Player>)[voterId];
        if (p) voterName = p.name;
      }

      if (voteIdx === lieIndex) {
        correctGuessers.push(voterName);
      } else {
        fooledGuessers.push(voterName);
      }
    });

    // Only the performer ends the round. Everyone else waits for the phase to
    // change — the server now rejects a turn completion from anyone but the
    // active player, so a spectator pressing this would just raise an error.
    const handleContinue = () => {
      if (!isMyTurn) return;
      let pointsEarned = 100;
      if (correctGuessers.length === 0) pointsEarned += 80;
      roomStore.completeMiniGame(roomId, 'truth_or_bluff', pointsEarned);
    };

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-4xl flex flex-col items-center gap-8 mx-auto"
      >
        <motion.h2 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-4xl font-black text-white text-center tracking-widest uppercase"
        >
          THE REVEAL
        </motion.h2>

        <div className="flex flex-col md:flex-row gap-6 w-full">
          {claims.map((claim, idx) => {
            const isLie = idx === lieIndex;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: idx === 0 ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + (idx * 0.2) }}
                className={`relative flex-1 p-8 rounded-2xl border-4 flex flex-col gap-4 bg-black/40 backdrop-blur-md ${
                  isLie 
                    ? 'border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] animate-pulse' 
                    : 'border-green-500/50'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className={`px-4 py-1 rounded-full font-black text-sm tracking-widest ${
                    isLie ? 'bg-red-500 text-white' : 'bg-green-500/20 text-green-400'
                  }`}>
                    {isLie ? 'LIE!' : 'TRUTH'}
                  </div>
                  {isLie ? <XCircle className="w-8 h-8 text-red-500" /> : <CheckCircle2 className="w-8 h-8 text-green-500" />}
                </div>
                
                <p className="text-xl font-medium text-white">{claim}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.5 }}
          className="flex flex-col md:flex-row gap-8 w-full mt-4 p-6 bg-white/5 rounded-2xl border border-white/10"
        >
          <div className="flex-1">
            <h4 className="text-green-400 font-bold mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> GUESSED RIGHT
            </h4>
            {correctGuessers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {correctGuessers.map((name, i) => (
                  <span key={i} className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-sm border border-green-500/30">
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-white/40 italic">Nobody guessed right!</p>
            )}
          </div>
          <div className="w-px bg-white/10 hidden md:block" />
          <div className="flex-1">
            <h4 className="text-red-400 font-bold mb-3 flex items-center gap-2">
              <XCircle className="w-5 h-5" /> FOOLED
            </h4>
            {fooledGuessers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {fooledGuessers.map((name, i) => (
                  <span key={i} className="px-3 py-1 bg-red-500/20 text-red-300 rounded-full text-sm border border-red-500/30">
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-white/40 italic">Nobody was fooled!</p>
            )}
          </div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 4 }}
          onClick={handleContinue}
          className="mt-4 px-12 py-4 bg-gradient-to-r from-partyPink to-purple-600 hover:from-partyPink/90 hover:to-purple-500 text-white font-black rounded-full shadow-xl shadow-partyPink/20 transform hover:scale-105 active:scale-95 transition-all text-xl uppercase tracking-widest"
        >
          CONTINUE
        </motion.button>
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


