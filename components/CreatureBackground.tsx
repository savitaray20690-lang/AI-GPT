import React, { useEffect, useState } from 'react';
import { Personality, MotionMode } from '../types';
import { PERSONALITY_CONFIGS } from '../constants';

interface CreatureBackgroundProps {
  personality: Personality;
  motionMode: MotionMode;
  isActive: boolean; // True when AI is generating/thinking
}

const CreatureBackground: React.FC<CreatureBackgroundProps> = ({ personality, motionMode, isActive }) => {
  const [elements, setElements] = useState<number[]>([]);

  useEffect(() => {
    // Generate random IDs for background elements
    setElements(Array.from({ length: 6 }, (_, i) => i));
  }, []);

  const config = PERSONALITY_CONFIGS[personality];
  
  // Determine animation speed based on motion mode
  const getDuration = () => {
    switch (motionMode) {
      case MotionMode.LOW: return '20s';
      case MotionMode.MEDIUM: return '10s';
      case MotionMode.CINEMATIC: return '5s';
      default: return '10s';
    }
  };

  const getActiveDuration = () => {
     switch (motionMode) {
      case MotionMode.LOW: return '5s';
      case MotionMode.MEDIUM: return '2s';
      case MotionMode.CINEMATIC: return '1s';
      default: return '2s';
    }
  }

  const duration = isActive ? getActiveDuration() : getDuration();
  
  // Map personality to base color classes
  const getColor = (index: number) => {
    const baseColors = {
      [Personality.CREATIVE]: ['bg-fuchsia-500', 'bg-pink-600', 'bg-purple-500'],
      [Personality.PROFESSIONAL]: ['bg-slate-500', 'bg-gray-400', 'bg-zinc-600'],
      [Personality.MYSTIC]: ['bg-violet-600', 'bg-indigo-500', 'bg-fuchsia-800'],
      [Personality.FRIENDLY]: ['bg-emerald-400', 'bg-teal-500', 'bg-green-400'],
      [Personality.GENIUS]: ['bg-cyan-500', 'bg-blue-600', 'bg-sky-400'],
    };
    const palette = baseColors[personality];
    return palette[index % palette.length];
  };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10 bg-black">
      {/* Cinematic Fog */}
      <div className={`absolute inset-0 opacity-20 bg-gradient-to-br from-black via-transparent to-${config.color.split('-')[1]}-900`} />
      
      {elements.map((id) => (
        <div
          key={id}
          className={`absolute rounded-full blur-[80px] opacity-30 mix-blend-screen transition-all ease-in-out ${getColor(id)}`}
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            width: `${Math.random() * 400 + 200}px`,
            height: `${Math.random() * 400 + 200}px`,
            animation: `float-${id} ${duration} infinite alternate`,
            willChange: 'transform, opacity' // Hardware Acceleration hint
          }}
        />
      ))}

      {/* Grid Overlay for Sci-Fi feel */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-150 contrast-150" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,27,0)_0%,rgba(18,18,27,1)_100%)]" />
      
      {/* Keyframes injected via style tag for simplicity in this format */}
      <style>{`
        @keyframes float-0 { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(50px, -50px) scale(1.1); } }
        @keyframes float-1 { 0% { transform: translate(0, 0) rotate(0deg); } 100% { transform: translate(-30px, 40px) rotate(10deg); } }
        @keyframes float-2 { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.2); opacity: 0.5; } }
        @keyframes float-3 { 0% { transform: translate(-20px, 20px); } 100% { transform: translate(20px, -20px); } }
        @keyframes float-4 { 0% { transform: rotate(0deg) scale(0.8); } 100% { transform: rotate(15deg) scale(1); } }
        @keyframes float-5 { 0% { transform: translate(0, 0); } 100% { transform: translate(100px, 0); } }
      `}</style>
    </div>
  );
};

export default CreatureBackground;