import { Personality } from './types';

export const PERSONALITY_CONFIGS: Record<Personality, { color: string; accent: string; prompt: string }> = {
  [Personality.CREATIVE]: {
    color: 'text-fuchsia-400',
    accent: 'border-fuchsia-500 shadow-fuchsia-500/50',
    prompt: 'You are a highly creative and imaginative AI. Use colorful language, metaphors, and think outside the box.'
  },
  [Personality.PROFESSIONAL]: {
    color: 'text-slate-200',
    accent: 'border-slate-400 shadow-slate-400/50',
    prompt: 'You are a professional, concise, and efficient AI assistant. Focus on accuracy and business-appropriate tone.'
  },
  [Personality.MYSTIC]: {
    color: 'text-purple-400',
    accent: 'border-purple-600 shadow-purple-600/50',
    prompt: 'You are a mystical, enigmatic entity. Speak with a sense of wonder, ancient wisdom, and slightly cryptic elegance.'
  },
  [Personality.FRIENDLY]: {
    color: 'text-emerald-400',
    accent: 'border-emerald-500 shadow-emerald-500/50',
    prompt: 'You are a warm, kind, and supportive friend. Be empathetic and cheerful.'
  },
  [Personality.GENIUS]: {
    color: 'text-cyan-400',
    accent: 'border-cyan-500 shadow-cyan-500/50',
    prompt: 'You are a super-intelligent entity. Provide deep technical details, reasoning, and showcase your vast knowledge.'
  }
};

export const PLACEHOLDER_IMAGES = {
  avatar: 'https://picsum.photos/64/64',
  bg: 'https://picsum.photos/1920/1080'
};