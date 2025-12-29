import React, { useState, useEffect, useRef } from 'react';
import { 
  History as HistoryIcon, 
  Settings, 
  Mic, 
  Send, 
  Image as ImageIcon, 
  Film,
  Sparkles,
  X,
  Menu,
  MoreVertical,
  Search,
  Wand2,
  Download,
  Code,
  Volume2,
  StopCircle,
  Eye,
  Mic as MicIcon
} from 'lucide-react';
import { 
  AppMode, 
  ChatMessage, 
  HistorySession, 
  MotionMode, 
  Personality, 
  UserSettings 
} from './types';
import { PERSONALITY_CONFIGS } from './constants';
import * as Gemini from './services/geminiService';
import CreatureBackground from './components/CreatureBackground';
import LiveSession from './components/LiveSession';

function App() {
  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAmplifying, setIsAmplifying] = useState(false);
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  
  // Feature States
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null); // For Holo-Deck

  // Settings
  const [settings, setSettings] = useState<UserSettings>({
    motion: MotionMode.MEDIUM,
    personality: Personality.GENIUS,
    isLightTheme: false
  });
  
  const [activeMode, setActiveMode] = useState<AppMode>(AppMode.CHAT);
  const [showLiveSession, setShowLiveSession] = useState(false);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Constants
  const personalityConfig = PERSONALITY_CONFIGS[settings.personality];

  // Effects
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating, isAmplifying]);

  // Mobile responsiveness: Auto-close sidebar on mobile init
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    
    const handleResize = () => {
       if (window.innerWidth >= 768) {
         setIsSidebarOpen(true);
       }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handlers
  const handleSendMessage = async () => {
    if ((!input.trim() && attachments.length === 0) || isGenerating) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date(),
      imageUrl: attachments.length > 0 && attachments[0].type.startsWith('image/') ? URL.createObjectURL(attachments[0]) : undefined
    };

    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setIsGenerating(true);

    try {
      let responseText = '';
      let responseImage = '';
      let responseVideo = '';
      let groundingData = undefined;

      // Dispatch based on mode
      if (activeMode === AppMode.IMAGE_GEN) {
        // We use the first attachment as a base image if available (Edit Mode)
        responseImage = await Gemini.generateImage(newMessage.text, '1K', '1:1', attachments[0]);
        responseText = "Image generated successfully.";
      } 
      else if (activeMode === AppMode.VIDEO_GEN) {
        // Video Generation
        responseVideo = await Gemini.generateVideo(newMessage.text);
        responseText = "Video generated successfully.";
      }
      else {
        // Chat / Text Mode (Grounding enabled by default for 'Search' feel)
        // Use Thinking for complex queries implicitly if text is long or contains "solve", "reason"
        const useThinking = newMessage.text.toLowerCase().includes('solve') || newMessage.text.toLowerCase().includes('reason');
        const useGrounding = true;
        
        const result = await Gemini.sendMessage(
            newMessage.text, 
            settings.personality, 
            [], // TODO: Pass conversation history
            attachments,
            useGrounding,
            useThinking
        );
        responseText = result.text;
        groundingData = result.groundingChunks;
      }

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date(),
        imageUrl: responseImage || undefined,
        videoUrl: responseVideo || undefined,
        groundingUrls: groundingData?.map((c: any) => ({ 
            title: c.web?.title || 'Source', 
            uri: c.web?.uri || '#' 
        }))
      };

      setMessages(prev => [...prev, aiMessage]);
      
      // Update history
      if (!activeSessionId) {
        const newSessionId = Date.now().toString();
        setActiveSessionId(newSessionId);
        setHistory(prev => [{
            id: newSessionId,
            title: newMessage.text.slice(0, 30) + '...',
            timestamp: new Date(),
            preview: responseText.slice(0, 50),
            mode: activeMode
        }, ...prev]);
      }

    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: `Error: ${error.message || 'Something went wrong.'}`,
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setIsGenerating(false);
      setAttachments([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(Array.from(e.target.files));
    }
  };

  // --- Feature 1: Sonic Input ---
  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput(prev => prev ? prev + ' ' + transcript : transcript);
          setIsListening(false);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.start();
        recognitionRef.current = recognition;
        setIsListening(true);
      } else {
        alert("Speech recognition not supported in this browser.");
      }
    }
  };

  // --- Feature 2: Prompt Amplifier ---
  const handleAmplify = async () => {
    if (!input.trim()) return;
    setIsAmplifying(true);
    try {
      const enhanced = await Gemini.enhancePrompt(input);
      setInput(enhanced.trim());
    } catch (e) {
      console.error("Amplification failed", e);
    } finally {
      setIsAmplifying(false);
    }
  };

  // --- Feature 4: Vox Synthesizer ---
  const speakText = (text: string, id: string) => {
    if (speakingMessageId === id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
    } else {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setSpeakingMessageId(null);
      setSpeakingMessageId(id);
      window.speechSynthesis.speak(utterance);
    }
  };

  // --- Feature 5: Data Extract ---
  const exportSession = () => {
    const data = JSON.stringify({
      session: activeSessionId || 'new',
      date: new Date().toISOString(),
      messages
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI-GPT-Session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Helper for Feature 3 (Holo-Deck)
  const extractCode = (text: string) => {
    const match = text.match(/```html([\s\S]*?)```/);
    return match ? match[1] : null;
  };

  // --- Components ---

  const Sidebar = () => (
    <>
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] md:hidden transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <div className={`fixed inset-y-0 left-0 z-[70] w-72 transform transition-transform duration-300 ease-in-out glass-panel border-r border-white/10 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:relative`}>
        <div className="p-6 h-full flex flex-col">
          <div className="flex items-center gap-3 mb-8">
              {/* Custom Chip Logo */}
              <div className="relative w-12 h-12 flex-shrink-0 group">
                  <div className="absolute inset-0 bg-blue-500/40 blur-xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity"></div>
                  <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M50 0 V15 M50 100 V85 M0 50 H15 M100 50 H85" className="stroke-blue-500/50" strokeWidth="2" />
                      <path d="M20 0 V15 M80 0 V15 M20 100 V85 M80 100 V85" className="stroke-cyan-500/30" strokeWidth="1" />
                      <path d="M0 20 H15 M0 80 H15 M100 20 H85 M100 80 H85" className="stroke-cyan-500/30" strokeWidth="1" />
                      <rect x="18" y="18" width="64" height="64" rx="12" className="fill-slate-900 stroke-cyan-500" strokeWidth="2" />
                      <rect x="24" y="24" width="52" height="52" rx="6" className="stroke-blue-500/50" strokeWidth="1" />
                      <path d="M50 18 V24 M50 76 V82 M18 50 H24 M76 50 H82" className="stroke-cyan-400" strokeWidth="2" />
                      <text x="50" y="63" textAnchor="middle" className="fill-white" style={{ fontFamily: 'Orbitron', fontWeight: '900', fontSize: '32px' }}>AI</text>
                  </svg>
              </div>
              <h1 className="text-2xl font-bold tracking-wider brand-font bg-clip-text text-transparent bg-gradient-to-r from-white to-cyan-400">
                  AI GPT
              </h1>
              {/* Close button on mobile sidebar */}
              <button onClick={() => setIsSidebarOpen(false)} className="ml-auto md:hidden text-gray-400 hover:text-white active:scale-95 transition-transform">
                <X size={20} />
              </button>
          </div>

          <button 
              onClick={() => { setMessages([]); setActiveSessionId(null); setActiveMode(AppMode.CHAT); if(window.innerWidth < 768) setIsSidebarOpen(false); }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-white/10 to-transparent border border-white/10 hover:border-white/30 transition flex items-center gap-3 mb-6 group active:scale-[0.98]"
          >
              <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition">
                  <Sparkles size={18} />
              </div>
              <span className="font-medium text-sm">New Session</span>
          </button>

          <div className="flex-1 overflow-y-auto pr-2 space-y-2 no-scrollbar">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Memory Logs</h3>
              {history.map(session => (
                  <div key={session.id} onClick={() => { setActiveSessionId(session.id); if(window.innerWidth < 768) setIsSidebarOpen(false); }} className="p-3 rounded-lg hover:bg-white/5 cursor-pointer transition group border border-transparent hover:border-white/5 active:bg-white/10">
                      <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${session.mode === AppMode.CHAT ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}`}>
                              {session.mode}
                          </span>
                          <span className="text-[10px] text-gray-500">{session.timestamp.toLocaleDateString()}</span>
                      </div>
                      <div className="text-sm text-gray-300 truncate font-medium group-hover:text-white transition">{session.title}</div>
                  </div>
              ))}
          </div>

          <button 
              onClick={exportSession}
              disabled={messages.length === 0}
              className="mb-4 w-full py-2 px-3 rounded-lg border border-white/10 text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
          >
              <Download size={14} /> EXPORT DATA
          </button>

          <div className="pt-4 border-t border-white/10 mt-2">
              <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400 uppercase">Personality Matrix</span>
                  <Settings size={14} className="text-gray-500 cursor-pointer hover:text-white" />
              </div>
              <div className="grid grid-cols-5 gap-1">
                  {Object.values(Personality).map((p) => (
                      <button
                          key={p}
                          onClick={() => setSettings(s => ({...s, personality: p}))}
                          title={p}
                          className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${settings.personality === p ? `border-${PERSONALITY_CONFIGS[p].color.split('-')[1]}-400 bg-white/10 scale-110 shadow-[0_0_10px_rgba(255,255,255,0.3)]` : 'border-transparent bg-white/5 hover:bg-white/10'} active:scale-90`}
                      >
                          <div className={`w-3 h-3 rounded-full bg-${PERSONALITY_CONFIGS[p].color.split('-')[1]}-400`} />
                      </button>
                  ))}
              </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className={`flex h-[100dvh] w-screen overflow-hidden ${settings.isLightTheme ? 'bg-gray-100 text-slate-900' : 'bg-slate-950 text-white'}`}>
        
        {/* Background Layer */}
        <CreatureBackground 
            personality={settings.personality} 
            motionMode={settings.motion} 
            isActive={isGenerating} 
        />

        {/* Live Interface Overlay */}
        {showLiveSession && (
            <LiveSession personality={settings.personality} onClose={() => setShowLiveSession(false)} />
        )}

        {/* Holo-Deck Preview Modal */}
        {previewCode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                <div className="w-full max-w-5xl h-[80vh] bg-[#0f172a] rounded-xl border border-white/10 flex flex-col overflow-hidden shadow-2xl">
                    <div className="h-12 border-b border-white/10 flex items-center justify-between px-4 bg-black/40">
                        <div className="flex items-center gap-2 text-cyan-400 font-mono text-sm">
                            <Code size={16} /> HOLO-DECK PREVIEW
                        </div>
                        <button onClick={() => setPreviewCode(null)} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white active:scale-95">
                            <X size={18} />
                        </button>
                    </div>
                    <iframe 
                        className="flex-1 w-full bg-white" 
                        srcDoc={previewCode} 
                        title="Preview" 
                        sandbox="allow-scripts"
                    />
                </div>
            </div>
        )}

        {/* Mobile Sidebar Toggle - Visible only when sidebar is closed on mobile */}
        {!isSidebarOpen && (
          <button 
              onClick={() => setIsSidebarOpen(true)}
              className="fixed top-4 left-4 z-50 md:hidden p-3 rounded-full glass-panel text-white hover:bg-white/10 shadow-lg active:scale-95 transition-transform"
          >
              <Menu size={20} />
          </button>
        )}

        {Sidebar()}

        {/* Main Content */}
        <div className="flex-1 flex flex-col relative z-0 h-full">
            
            {/* Header / Mode Switcher */}
            <header className="h-16 md:h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 backdrop-blur-sm shrink-0 relative z-20">
                {/* Spacer for mobile menu button */}
                <div className="w-8 md:hidden"></div>
                
                <div className="flex-1 flex justify-center md:justify-start overflow-hidden">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 px-2 mask-fade-sides">
                      {[
                          { id: AppMode.CHAT, icon: <Send size={16} /> },
                          { id: AppMode.IMAGE_GEN, icon: <ImageIcon size={16} /> },
                          { id: AppMode.VIDEO_GEN, icon: <Film size={16} /> },
                      ].map((mode) => (
                          <button
                              key={mode.id}
                              onClick={() => setActiveMode(mode.id)}
                              className={`px-3 md:px-4 py-1.5 rounded-full border text-xs md:text-sm font-medium flex items-center gap-2 transition-all whitespace-nowrap active:scale-95 ${activeMode === mode.id ? `bg-white/10 border-${personalityConfig.color.split('-')[1]}-400 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]` : 'border-transparent hover:bg-white/5 text-gray-400'}`}
                          >
                              {mode.icon}
                              {mode.id}
                          </button>
                      ))}
                      
                      {/* Live Button Special */}
                      <button
                          onClick={() => setShowLiveSession(true)}
                          className="px-3 md:px-4 py-1.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 text-xs md:text-sm font-medium flex items-center gap-2 hover:bg-red-500 hover:text-white transition-all animate-pulse active:scale-95"
                      >
                          <Mic size={16} /> LIVE
                      </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4 pl-2">
                     <button onClick={() => setSettings(s => ({...s, isLightTheme: !s.isLightTheme}))} className="p-2 rounded-full hover:bg-white/10 transition text-gray-400 hover:text-white active:scale-95">
                        <div className="w-5 h-5 rounded-full border border-current flex overflow-hidden">
                            <div className="w-1/2 h-full bg-current"></div>
                        </div>
                     </button>
                </div>
            </header>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-3 md:p-6 scroll-smooth relative">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-60 px-4">
                         {/* MAIN LOGO - Responsive sizing */}
                         <div className="relative w-20 h-20 md:w-24 md:h-24 mb-4">
                             <div className="absolute inset-0 bg-blue-500/40 blur-xl rounded-full animate-pulse"></div>
                             <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(6,182,212,0.8)]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                                 <rect x="18" y="18" width="64" height="64" rx="12" className="fill-slate-900 stroke-cyan-500" strokeWidth="2" />
                                 <rect x="24" y="24" width="52" height="52" rx="6" className="stroke-blue-500/50" strokeWidth="1" />
                                 <path d="M50 0 V15 M50 100 V85 M0 50 H15 M100 50 H85" className="stroke-cyan-500" strokeWidth="2" />
                                 <text x="50" y="63" textAnchor="middle" className="fill-white" style={{ fontFamily: 'Orbitron', fontWeight: '900', fontSize: '32px' }}>AI</text>
                             </svg>
                         </div>
                         <h2 className="text-2xl md:text-3xl font-bold mb-2 brand-font">How can I help you?</h2>
                         <p className="max-w-md text-sm md:text-base text-gray-400">Advanced Neural Interface Ready.</p>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6 pb-2">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[90%] md:max-w-[85%] rounded-2xl p-4 md:p-5 backdrop-blur-md border ${msg.role === 'user' ? 'bg-blue-600/20 border-blue-500/30 text-white rounded-tr-sm' : 'glass-panel text-gray-200 rounded-tl-sm'}`}>
                                    {/* Text Content */}
                                    <div className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">{msg.text}</div>
                                    
                                    {/* Feature 3: Holo-Deck Button */}
                                    {msg.role === 'model' && extractCode(msg.text) && (
                                        <button 
                                            onClick={() => setPreviewCode(extractCode(msg.text))}
                                            className="mt-3 w-full py-2 bg-black/40 border border-white/10 rounded-lg flex items-center justify-center gap-2 text-cyan-400 text-[10px] md:text-xs font-bold tracking-widest hover:bg-black/60 transition active:scale-95"
                                        >
                                            <Eye size={14} /> OPEN HOLO-DECK PREVIEW
                                        </button>
                                    )}

                                    {/* Images */}
                                    {msg.imageUrl && (
                                        <div className="mt-4 rounded-xl overflow-hidden border border-white/10 shadow-lg">
                                            <img src={msg.imageUrl} alt="Generated or Uploaded" className="w-full h-auto max-h-96 object-cover" />
                                        </div>
                                    )}

                                    {/* Video */}
                                    {msg.videoUrl && (
                                        <div className="mt-4 rounded-xl overflow-hidden border border-white/10 shadow-lg">
                                            <video src={msg.videoUrl} controls className="w-full h-auto" />
                                        </div>
                                    )}

                                    {/* Grounding */}
                                    {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
                                            {msg.groundingUrls.map((url, i) => (
                                                <a key={i} href={url.uri} target="_blank" rel="noopener noreferrer" className="text-[10px] md:text-xs bg-white/5 px-2 py-1 rounded hover:bg-white/10 text-cyan-400 flex items-center gap-1 transition">
                                                    <Search size={10} /> {url.title}
                                                </a>
                                            ))}
                                        </div>
                                    )}

                                    {/* Feature 4: Vox Synthesizer */}
                                    {msg.role === 'model' && (
                                        <div className="mt-2 flex justify-end">
                                            <button 
                                                onClick={() => speakText(msg.text, msg.id)}
                                                className="text-gray-500 hover:text-white transition p-1 active:scale-90"
                                                title="Vox Synthesize"
                                            >
                                                {speakingMessageId === msg.id ? <StopCircle size={14} className="animate-pulse text-green-400"/> : <Volume2 size={14} />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                        
                        {(isGenerating || isAmplifying) && (
                            <div className="flex justify-start">
                                <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full bg-${personalityConfig.color.split('-')[1]}-400 animate-bounce`} style={{ animationDelay: '0ms' }}></div>
                                    <div className={`w-2 h-2 rounded-full bg-${personalityConfig.color.split('-')[1]}-400 animate-bounce`} style={{ animationDelay: '150ms' }}></div>
                                    <div className={`w-2 h-2 rounded-full bg-${personalityConfig.color.split('-')[1]}-400 animate-bounce`} style={{ animationDelay: '300ms' }}></div>
                                    <span className="text-xs text-gray-400 ml-2 animate-pulse">{isAmplifying ? 'Amplifying Prompt...' : 'Computing...'}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Smart Command Bar */}
            <div className="p-3 md:p-6 pt-0 shrink-0">
                <div className={`max-w-4xl mx-auto rounded-2xl glass-panel p-2 flex items-end gap-1 md:gap-2 transition-all duration-300 ${isGenerating ? 'opacity-50 pointer-events-none' : 'opacity-100'} ${personalityConfig.accent}`}>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={handleFileUpload}
                        accept="image/*,video/*"
                    />
                    <button onClick={() => fileInputRef.current?.click()} className="p-2 md:p-3 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition relative active:scale-95">
                        <MoreVertical size={18} className="md:w-5 md:h-5" />
                        {attachments.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full"></span>}
                    </button>
                    
                    {/* Feature 2: Prompt Amplifier */}
                     <button onClick={handleAmplify} className="p-2 md:p-3 rounded-xl hover:bg-fuchsia-500/20 text-fuchsia-400 hover:text-fuchsia-300 transition active:scale-95" title="Amplify Prompt">
                        <Wand2 size={18} className="md:w-5 md:h-5" />
                    </button>

                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}}
                        placeholder={activeMode === AppMode.IMAGE_GEN ? "Describe..." : isListening ? "Listening..." : "Command..."}
                        className={`flex-1 bg-transparent border-0 text-white placeholder-gray-500 focus:ring-0 resize-none py-3 max-h-32 text-base md:text-base ${isListening ? 'animate-pulse' : ''}`}
                        rows={1}
                        style={{ minHeight: '44px' }}
                    />

                    {/* Feature 1: Sonic Input */}
                    <button onClick={toggleListening} className={`p-2 md:p-3 rounded-xl transition active:scale-95 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-white/10 text-gray-400 hover:text-white'}`}>
                        <MicIcon size={18} className="md:w-5 md:h-5" />
                    </button>
                    
                    <button 
                        onClick={handleSendMessage}
                        disabled={!input && attachments.length === 0}
                        className={`p-2 md:p-3 rounded-xl transition-all duration-300 active:scale-95 ${input || attachments.length > 0 ? `bg-${personalityConfig.color.split('-')[1]}-500 text-white shadow-lg` : 'bg-white/5 text-gray-600'}`}
                    >
                        <Send size={18} className="md:w-5 md:h-5" />
                    </button>
                </div>
                <div className="text-center mt-2 hidden md:block">
                     <p className="text-[10px] text-gray-500 tracking-widest uppercase">AI GPT System Online • Latency: {isGenerating ? 'Calculating' : 'Low'} • Mode: {settings.motion}</p>
                </div>
            </div>

        </div>
    </div>
  );
}

export default App;