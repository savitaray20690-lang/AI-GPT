export enum Personality {
  CREATIVE = 'Creative',
  PROFESSIONAL = 'Professional',
  MYSTIC = 'Mystic',
  FRIENDLY = 'Friendly',
  GENIUS = 'Genius'
}

export enum MotionMode {
  LOW = 'Low',
  MEDIUM = 'Medium',
  CINEMATIC = 'Cinematic'
}

export enum AppMode {
  CHAT = 'Chat',
  IMAGE_GEN = 'Image Creation',
  VIDEO_GEN = 'Video Studio',
  LIVE = 'Live Connection'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  imageUrl?: string; // For generated or uploaded images
  videoUrl?: string; // For generated videos
  groundingUrls?: Array<{ title: string; uri: string }>;
  isError?: boolean;
}

export interface HistorySession {
  id: string;
  title: string;
  timestamp: Date;
  preview: string;
  mode: AppMode;
}

export interface UserSettings {
  motion: MotionMode;
  personality: Personality;
  isLightTheme: boolean;
}