'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RoomState, Player, GuessTheVoiceState } from '@/lib/types';
import { aiGameMaster } from '@/lib/aiGameMaster';
import { roomStore } from '@/lib/roomStore';
import { motion } from 'framer-motion';
import { Mic, Square, Play, Eye, User } from 'lucide-react';

interface GuessTheVoiceGameProps {
  room: RoomState;
  activePlayer: Player;
  myPlayer: Player;
  isMyTurn: boolean;
  roomId: string;
}

export default function GuessTheVoiceGame({
  room,
  activePlayer,
  myPlayer,
  isMyTurn,
  roomId
}: GuessTheVoiceGameProps) {
  const state = room.guessTheVoiceState as GuessTheVoiceState | undefined | null;
  const serverPhase = state?.phase;
  
  const [localPhase, setLocalPhase] = useState<'prompting' | 'recording' | 'playback' | 'voting' | 'reveal'>(
    serverPhase || 'prompting'
  );
  const [isRecording, setIsRecording] = useState(false);
  const [selectedVotedId, setSelectedVotedId] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const isPerformer = state?.performerId === myPlayer.id;

  // Sync server phase to local phase
  useEffect(() => {
    if (serverPhase) {
      setLocalPhase(serverPhase);
    }
  }, [serverPhase]);

  useEffect(() => {
    if (isPerformer && localPhase === 'prompting' && state?.prompt) {
      aiGameMaster.speak("You are the secret voice! Get ready to read the prompt...");
    } else if (!isPerformer && localPhase === 'prompting') {
      aiGameMaster.speak("Someone's voice is disguised — get ready to guess who it is!");
    }
  }, [isPerformer, localPhase, state?.prompt]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          // Send to server
          await roomStore.send(roomId, { 
              action: 'guess_voice_submit', 
              playerId: myPlayer.id,
              audioBlobUrl: base64Audio
            });
        };
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied or failed", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setLocalPhase('playback');
    }
  };

  const playDisguisedAudio = () => {
    if (state?.audioBlobUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio(state.audioBlobUrl);
        // Distort the audio using standard HTML5 Audio attributes
        audioRef.current.preservesPitch = false;
        audioRef.current.playbackRate = 0.6; // Deep voice distortion
      }
      audioRef.current.play();
    }
  };

  const submitVote = async (guessedPlayerId: string) => {
    if (selectedVotedId) return;
    setSelectedVotedId(guessedPlayerId);
    
    await roomStore.send(roomId, { 
        action: 'guess_voice_vote', 
        playerId: myPlayer.id,
        vote: guessedPlayerId
      });
  };

  const completeGame = async () => {
    if (!isMyTurn) return;
    // Calculate rewards
    let correctCount = 0;
    Object.values(state?.votes || {}).forEach(vote => {
      if (vote === state?.performerId) correctCount++;
    });
    const reward = correctCount === 0 ? 150 : correctCount * 50;
    roomStore.completeMiniGame(roomId, 'guess_the_voice', reward);
  };

  if (!state) return null;

  return (
    <div className="flex flex-col h-full bg-slate-900/50 backdrop-blur-md text-white rounded-3xl p-4 sm:p-6 shadow-2xl relative overflow-hidden border border-white/5">
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-amber-500 opacity-50" />
      
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-black italic uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2 drop-shadow-md">
          Guess the Voice 🕵️
        </h2>
        <p className="text-white/60 text-sm">
          {localPhase === 'prompting' && "Get ready..."}
          {localPhase === 'recording' && (isPerformer ? "Record your voice!" : "Someone is recording...")}
          {localPhase === 'playback' && "Listen to the disguised voice!"}
          {localPhase === 'voting' && "Who was it?"}
          {localPhase === 'reveal' && "The reveal!"}
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Performer View (Prompting/Recording) */}
        {isPerformer && (localPhase === 'prompting' || localPhase === 'recording') && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6">
            <div className="bg-white/10 p-6 rounded-2xl border border-white/20">
              <h3 className="text-lg font-bold text-white/80 mb-4">You are the mystery voice! Read this:</h3>
              <p className="text-2xl font-medium text-white">"{state.prompt}"</p>
            </div>
            
            {localPhase === 'prompting' ? (
              <button
                onClick={() => setLocalPhase('recording')}
                className="px-8 py-4 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full font-bold text-xl shadow-lg hover:shadow-pink-500/50 transition-all flex items-center justify-center gap-3 mx-auto"
              >
                Ready to Record
              </button>
            ) : (
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={`w-32 h-32 rounded-full flex flex-col items-center justify-center gap-2 mx-auto transition-all ${
                  isRecording 
                    ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.6)] animate-pulse' 
                    : 'bg-white/10 border-2 border-white/30 hover:bg-white/20'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-10 h-10 text-white fill-white" />
                    <span className="font-bold">Release to Stop</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-10 h-10 text-white" />
                    <span className="font-bold">Hold to Record</span>
                  </>
                )}
              </button>
            )}
          </motion.div>
        )}

        {/* Audience View (Waiting for recording) */}
        {!isPerformer && (localPhase === 'prompting' || localPhase === 'recording') && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6 animate-pulse">
              <Mic className="w-10 h-10 text-white/40" />
            </div>
            <h3 className="text-xl font-bold text-white/80">
              Waiting for the mystery voice to record...
            </h3>
          </motion.div>
        )}

        {/* Playback & Voting */}
        {(localPhase === 'playback' || localPhase === 'voting') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mx-auto space-y-6 text-center">
            {state.audioBlobUrl ? (
              <button 
                onClick={playDisguisedAudio}
                className="w-24 h-24 mx-auto bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:scale-105 transition-transform"
              >
                <Play className="w-10 h-10 text-white fill-white ml-1" />
              </button>
            ) : (
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                Processing audio...
              </div>
            )}
            
            {localPhase === 'voting' && !isPerformer && (
              <div className="bg-white/5 p-4 sm:p-6 rounded-2xl border border-white/10 mt-6">
                <h3 className="text-lg font-bold mb-4">Who do you think it is?</h3>
                <div className="grid grid-cols-2 gap-3">
                  {room.players.map(p => (
                    <button
                      key={p.id}
                      onClick={() => submitVote(p.id)}
                      disabled={!!selectedVotedId || p.id === myPlayer.id}
                      className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                        selectedVotedId === p.id 
                          ? 'bg-purple-500/30 border-purple-400 text-purple-200' 
                          : selectedVotedId || p.id === myPlayer.id
                            ? 'bg-white/5 border-white/5 text-white/30 cursor-not-allowed'
                            : 'bg-white/10 border-white/20 hover:bg-white/20'
                      }`}
                    >
                      <User className="w-4 h-4" />
                      <span className="font-medium truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {localPhase === 'voting' && isPerformer && (
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
                <Eye className="w-8 h-8 text-white/40 mx-auto mb-3" />
                <div className="text-4xl">{myPlayer?.avatar?.emoji || '👤'}</div><p className="text-white/60">Watch them try to guess your voice!</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Reveal Phase */}
        {localPhase === 'reveal' && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full text-center space-y-6">
            <h3 className="text-2xl font-bold text-white">The voice was...</h3>
            
            <div className="inline-flex flex-col items-center justify-center p-6 bg-gradient-to-b from-purple-500/20 to-transparent border border-purple-500/30 rounded-3xl">
              <div className="w-20 h-20 bg-purple-600 rounded-full flex items-center justify-center mb-4 text-3xl shadow-[0_0_40px_rgba(147,51,234,0.5)]">
                {room.players.find(p => p.id === state.performerId)?.avatar?.emoji || '👤'}
              </div>
              <h2 className="text-3xl font-black">{room.players.find(p => p.id === state.performerId)?.name}</h2>
            </div>
            
            <div className="bg-white/5 p-4 rounded-xl max-w-sm mx-auto">
              <h4 className="font-bold text-white/80 mb-2">Guesses</h4>
              <div className="space-y-2 text-sm text-left">
                {Object.entries(state.votes || {}).map(([voterId, guessedId]) => {
                  const voter = room.players.find(p => p.id === voterId)?.name;
                  const guessed = room.players.find(p => p.id === guessedId)?.name;
                  const correct = guessedId === state.performerId;
                  return (
                    <div key={voterId} className="flex justify-between items-center border-b border-white/5 pb-1">
                      <span className="text-white/70">{voter}</span>
                      <span className={correct ? 'text-emerald-400 font-bold' : 'text-red-400'}>
                        {guessed} {correct ? '✅' : '❌'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {isMyTurn && (
              <button
                onClick={completeGame}
                className="mt-6 px-8 py-4 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 rounded-xl font-bold transition-all shadow-lg mx-auto block"
              >
                Finish Round
              </button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

