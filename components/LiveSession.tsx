import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Personality } from '../types';

interface LiveSessionProps {
  personality: Personality;
  onClose: () => void;
}

const LiveSession: React.FC<LiveSessionProps> = ({ personality, onClose }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
  const [logs, setLogs] = useState<string[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Audio Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null); // To hold the active session

  // Canvas visualizer
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);

  // Constants
  const SAMPLE_RATE_IN = 16000;
  const SAMPLE_RATE_OUT = 24000;

  // --- Audio Helpers ---
  function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async function decodeAudioData(data: Uint8Array, ctx: AudioContext) {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, SAMPLE_RATE_OUT);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  }

  function createBlob(data: Float32Array) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  }

  useEffect(() => {
    let cleanup = () => {};

    const startSession = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
        
        // Setup Audio
        inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE_IN });
        outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE_OUT });

        // Get User Media
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        // Connect Gemini
        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              setStatus('connected');
              setLogs(prev => [...prev, "Connected to Live Uplink."]);
              
              // Input Audio Processing
              const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
              const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
              
              scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                drawVisualizer(inputData); // Visualize input
              };

              source.connect(scriptProcessor);
              scriptProcessor.connect(inputAudioContextRef.current!.destination);
            },
            onmessage: async (msg: LiveServerMessage) => {
              // Handle Output Audio
              const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64Audio && outputAudioContextRef.current) {
                const ctx = outputAudioContextRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx);
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
              }
            },
            onclose: () => {
              setStatus('disconnected');
            },
            onerror: (err) => {
              console.error(err);
              setStatus('error');
            }
          },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
            },
            systemInstruction: `You are a ${personality} AI assistant. Engage visually and vocally.`,
          }
        });

        // Store active session for cleanup
        sessionRef.current = await sessionPromise;

        // Video Streaming Loop
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const video = videoRef.current;

        const intervalId = window.setInterval(() => {
          if (video && canvas && ctx) {
             canvas.width = video.videoWidth * 0.2; // Scale down for bandwidth
             canvas.height = video.videoHeight * 0.2;
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
             
             const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
             sessionPromise.then(session => {
                session.sendRealtimeInput({
                  media: { data: base64, mimeType: 'image/jpeg' }
                });
             });
          }
        }, 1000); // 1 FPS for demo stability

        cleanup = () => {
            clearInterval(intervalId);
            stream.getTracks().forEach(t => t.stop());
            inputAudioContextRef.current?.close();
            outputAudioContextRef.current?.close();
            // Note: actual session close might vary by SDK version, 
            // usually just stopping stream is enough for client side.
        };

      } catch (e) {
        console.error("Live session failed", e);
        setStatus('error');
      }
    };

    startSession();

    return () => {
      cleanup();
    }
  }, [personality]);

  const drawVisualizer = (data: Float32Array) => {
      if (!visualizerCanvasRef.current) return;
      const canvas = visualizerCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if(!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00ffcc'; // Neon Cyan
      ctx.beginPath();
      
      const sliceWidth = width / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i+=10) { // skip for performance
        const v = data[i] * 5; // amplify
        const y = (height / 2) + (v * height / 2);
        if (i===0) ctx.moveTo(x,y);
        else ctx.lineTo(x,y);
        x += sliceWidth * 10;
      }
      ctx.stroke();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 md:p-8 backdrop-blur-xl">
      <div className="max-w-4xl w-full h-full flex flex-col relative glass-panel rounded-2xl overflow-hidden border border-cyan-500/30">
        
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
            <h2 className="text-xl md:text-2xl font-bold text-cyan-400 brand-font flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                LIVE UPLINK
            </h2>
            <button onClick={onClose} className="px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm bg-red-500/20 text-red-400 border border-red-500/50 rounded hover:bg-red-500 hover:text-white transition">
                TERMINATE
            </button>
        </div>

        {/* Video Area */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
            <video ref={videoRef} className="w-full h-full object-cover opacity-50" muted playsInline />
            
            {/* Holographic Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                 <div className="w-[200px] h-[200px] md:w-[300px] md:h-[300px] border-2 border-cyan-500/30 rounded-full animate-[spin_10s_linear_infinite] absolute"></div>
                 <div className="w-[180px] h-[180px] md:w-[280px] md:h-[280px] border border-purple-500/30 rounded-full animate-[spin_15s_linear_infinite_reverse] absolute"></div>
                 <h3 className="text-2xl md:text-4xl text-white font-bold tracking-widest brand-font animate-pulse">
                     {status === 'connecting' ? 'ESTABLISHING...' : 'AI ACTIVE'}
                 </h3>
            </div>
            
            {/* Hidden canvas for processing */}
            <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Audio Visualizer Footer */}
        <div className="h-24 md:h-32 bg-black/50 border-t border-white/10 relative shrink-0">
            <canvas ref={visualizerCanvasRef} width={800} height={128} className="w-full h-full opacity-80" />
        </div>

      </div>
    </div>
  );
};

export default LiveSession;