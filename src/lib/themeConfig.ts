import { MapTheme, TileNodeType } from './types';

export interface ThemeConfig {
  id: MapTheme;
  name: string;
  icon: string;
  bgGradient: string;
  roadColor: string;
  roadStroke: string;
  landmarkBg: string;
  landmarks: {
    trees: string;
    water: string;
    hills: string;
    special: string;
  };
  nodeColors: Record<TileNodeType, { bg: string; border: string; glow: string; icon: string }>;
}

export const THEMES: Record<MapTheme, ThemeConfig> = {
  forest: {
    id: 'forest',
    name: 'Magic Forest',
    icon: '🌲',
    bgGradient: 'from-emerald-950 via-slate-950 to-teal-950',
    roadColor: '#2D5A46',
    roadStroke: '#10B981',
    landmarkBg: '#132E27',
    landmarks: { trees: '🌲', water: '🌊', hills: '⛰️', special: '🍄' },
    nodeColors: {
      normal: { bg: 'bg-emerald-900/60', border: 'border-emerald-400/40', glow: 'glow-emerald', icon: '🍃' },
      buff: { bg: 'bg-emerald-500/80', border: 'border-emerald-300', glow: 'glow-emerald', icon: '🚀' },
      debuff: { bg: 'bg-rose-500/80', border: 'border-rose-300', glow: 'glow-terracotta', icon: '💥' },
      dare: { bg: 'bg-purple-600/80', border: 'border-purple-300', glow: 'glow-purple', icon: '🎤' },
      mystery: { bg: 'bg-amber-500/80', border: 'border-amber-300', glow: 'glow-yellow', icon: '❓' },
      bonus: { bg: 'bg-cyan-500/80', border: 'border-cyan-300', glow: 'glow-cyan', icon: '⭐' },
      trap: { bg: 'bg-red-600/80', border: 'border-red-400', glow: 'glow-terracotta', icon: '💣' },
    },
  },
  village: {
    id: 'village',
    name: 'Naija Village',
    icon: '🌾',
    bgGradient: 'from-amber-950 via-slate-950 to-orange-950',
    roadColor: '#5C3A21',
    roadStroke: '#FFD000',
    landmarkBg: '#2D1B0F',
    landmarks: { trees: '🌴', water: '🏞️', hills: '🛖', special: '👑' },
    nodeColors: {
      normal: { bg: 'bg-amber-900/60', border: 'border-amber-400/40', glow: 'glow-yellow', icon: '🛖' },
      buff: { bg: 'bg-emerald-500/80', border: 'border-emerald-300', glow: 'glow-emerald', icon: '⚡' },
      debuff: { bg: 'bg-rose-500/80', border: 'border-rose-300', glow: 'glow-terracotta', icon: '🍂' },
      dare: { bg: 'bg-purple-600/80', border: 'border-purple-300', glow: 'glow-purple', icon: '🎭' },
      mystery: { bg: 'bg-amber-500/80', border: 'border-amber-300', glow: 'glow-yellow', icon: '✨' },
      bonus: { bg: 'bg-cyan-500/80', border: 'border-cyan-300', glow: 'glow-cyan', icon: '💎' },
      trap: { bg: 'bg-red-600/80', border: 'border-red-400', glow: 'glow-terracotta', icon: '🔥' },
    },
  },
  desert: {
    id: 'desert',
    name: 'Sahara Desert',
    icon: '🏜️',
    bgGradient: 'from-orange-950 via-slate-950 to-amber-950',
    roadColor: '#6E4522',
    roadStroke: '#F97316',
    landmarkBg: '#3B210F',
    landmarks: { trees: '🌵', water: '🐪', hills: '🏜️', special: '☀️' },
    nodeColors: {
      normal: { bg: 'bg-orange-900/60', border: 'border-orange-400/40', glow: 'glow-terracotta', icon: '🏜️' },
      buff: { bg: 'bg-emerald-500/80', border: 'border-emerald-300', glow: 'glow-emerald', icon: '🚀' },
      debuff: { bg: 'bg-rose-500/80', border: 'border-rose-300', glow: 'glow-terracotta', icon: '🦂' },
      dare: { bg: 'bg-purple-600/80', border: 'border-purple-300', glow: 'glow-purple', icon: '🎤' },
      mystery: { bg: 'bg-amber-500/80', border: 'border-amber-300', glow: 'glow-yellow', icon: '🏺' },
      bonus: { bg: 'bg-cyan-500/80', border: 'border-cyan-300', glow: 'glow-cyan', icon: '⭐' },
      trap: { bg: 'bg-red-600/80', border: 'border-red-400', glow: 'glow-terracotta', icon: '🌪️' },
    },
  },
  snow: {
    id: 'snow',
    name: 'Arctic Snow',
    icon: '❄️',
    bgGradient: 'from-cyan-950 via-slate-950 to-blue-950',
    roadColor: '#1E3A5F',
    roadStroke: '#38BDF8',
    landmarkBg: '#0F2338',
    landmarks: { trees: '🌲', water: '🧊', hills: '🏔️', special: '☃️' },
    nodeColors: {
      normal: { bg: 'bg-sky-900/60', border: 'border-sky-400/40', glow: 'glow-cyan', icon: '❄️' },
      buff: { bg: 'bg-emerald-500/80', border: 'border-emerald-300', glow: 'glow-emerald', icon: '🚀' },
      debuff: { bg: 'bg-rose-500/80', border: 'border-rose-300', glow: 'glow-terracotta', icon: '🥶' },
      dare: { bg: 'bg-purple-600/80', border: 'border-purple-300', glow: 'glow-purple', icon: '🎤' },
      mystery: { bg: 'bg-amber-500/80', border: 'border-amber-300', glow: 'glow-yellow', icon: '🎁' },
      bonus: { bg: 'bg-cyan-500/80', border: 'border-cyan-300', glow: 'glow-cyan', icon: '⭐' },
      trap: { bg: 'bg-red-600/80', border: 'border-red-400', glow: 'glow-terracotta', icon: '💣' },
    },
  },
  volcano: {
    id: 'volcano',
    name: 'Volcano Lava',
    icon: '🌋',
    bgGradient: 'from-red-950 via-slate-950 to-rose-950',
    roadColor: '#4A151B',
    roadStroke: '#EF4444',
    landmarkBg: '#2A080C',
    landmarks: { trees: '🌋', water: '🔥', hills: '🪨', special: '💥' },
    nodeColors: {
      normal: { bg: 'bg-red-900/60', border: 'border-red-400/40', glow: 'glow-terracotta', icon: '🔥' },
      buff: { bg: 'bg-emerald-500/80', border: 'border-emerald-300', glow: 'glow-emerald', icon: '⚡' },
      debuff: { bg: 'bg-rose-500/80', border: 'border-rose-300', glow: 'glow-terracotta', icon: '💥' },
      dare: { bg: 'bg-purple-600/80', border: 'border-purple-300', glow: 'glow-purple', icon: '🎤' },
      mystery: { bg: 'bg-amber-500/80', border: 'border-amber-300', glow: 'glow-yellow', icon: '❓' },
      bonus: { bg: 'bg-cyan-500/80', border: 'border-cyan-300', glow: 'glow-cyan', icon: '💎' },
      trap: { bg: 'bg-red-600/80', border: 'border-red-400', glow: 'glow-terracotta', icon: '💣' },
    },
  },
  space: {
    id: 'space',
    name: 'Cosmic Space',
    icon: '🌌',
    bgGradient: 'from-indigo-950 via-slate-950 to-purple-950',
    roadColor: '#2E1A47',
    roadStroke: '#A855F7',
    landmarkBg: '#150A26',
    landmarks: { trees: '🪐', water: '☄️', hills: '🌌', special: '🛸' },
    nodeColors: {
      normal: { bg: 'bg-indigo-900/60', border: 'border-indigo-400/40', glow: 'glow-purple', icon: '✨' },
      buff: { bg: 'bg-emerald-500/80', border: 'border-emerald-300', glow: 'glow-emerald', icon: '🚀' },
      debuff: { bg: 'bg-rose-500/80', border: 'border-rose-300', glow: 'glow-terracotta', icon: '☄️' },
      dare: { bg: 'bg-purple-600/80', border: 'border-purple-300', glow: 'glow-purple', icon: '🎤' },
      mystery: { bg: 'bg-amber-500/80', border: 'border-amber-300', glow: 'glow-yellow', icon: '❓' },
      bonus: { bg: 'bg-cyan-500/80', border: 'border-cyan-300', glow: 'glow-cyan', icon: '⭐' },
      trap: { bg: 'bg-red-600/80', border: 'border-red-400', glow: 'glow-terracotta', icon: '💣' },
    },
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Neon Cyberpunk',
    icon: '🌆',
    bgGradient: 'from-fuchsia-950 via-slate-950 to-cyan-950',
    roadColor: '#3B0764',
    roadStroke: '#EC4899',
    landmarkBg: '#1E0533',
    landmarks: { trees: '🏙️', water: '⚡', hills: '🌆', special: '🤖' },
    nodeColors: {
      normal: { bg: 'bg-fuchsia-900/60', border: 'border-fuchsia-400/40', glow: 'glow-purple', icon: '⚡' },
      buff: { bg: 'bg-emerald-500/80', border: 'border-emerald-300', glow: 'glow-emerald', icon: '🚀' },
      debuff: { bg: 'bg-rose-500/80', border: 'border-rose-300', glow: 'glow-terracotta', icon: '👾' },
      dare: { bg: 'bg-purple-600/80', border: 'border-purple-300', glow: 'glow-purple', icon: '🎤' },
      mystery: { bg: 'bg-amber-500/80', border: 'border-amber-300', glow: 'glow-yellow', icon: '💾' },
      bonus: { bg: 'bg-cyan-500/80', border: 'border-cyan-300', glow: 'glow-cyan', icon: '💎' },
      trap: { bg: 'bg-red-600/80', border: 'border-red-400', glow: 'glow-terracotta', icon: '💣' },
    },
  },
};
