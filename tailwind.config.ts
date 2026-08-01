import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        partyYellow: "#FFD000",
        partyPink: "#FF2A85",
        partyCyan: "#00F0FF",
        partyPurple: "#8A2BE2",
        partyGreen: "#00FF66",
        partyDark: "#0D0F1D",
        partyCard: "#161B33",
        // Used all over the gradients and borders but was never defined here, so
        // every `*-terracotta` class silently rendered as nothing.
        terracotta: "#FF5722",
      },
      scale: {
        '102': '1.02',
      },
      animation: {
        'pulse-fast': 'pulse 0.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shake': 'shake 0.4s ease-in-out infinite',
        'bounce-slow': 'bounce 2s infinite',
        'spin-slow': 'spin 12s linear infinite',
        'fadeIn': 'fadeIn 0.3s ease-out',
        // Reaction emoji rising off the laugh meter. Needs a real keyframe:
        // `animate-bounce` plus a static `bottom` just bounces in place.
        'floatUp': 'floatUp 2s ease-out forwards',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-6px) rotate(-2deg)' },
          '75%': { transform: 'translateX(6px) rotate(2deg)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        floatUp: {
          '0%':   { opacity: '0', transform: 'translateY(0) scale(0.6) rotate(-8deg)' },
          '15%':  { opacity: '1', transform: 'translateY(-20px) scale(1.25) rotate(4deg)' },
          '100%': { opacity: '0', transform: 'translateY(-190px) scale(0.9) rotate(-6deg)' },
        },
      }
    },
  },
  plugins: [],
};
export default config;
