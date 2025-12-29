import { GoogleGenAI, GenerateContentResponse, Type, FunctionDeclaration } from "@google/genai";
import { AppMode, Personality } from "../types";
import { PERSONALITY_CONFIGS } from "../constants";

// Helper to get fresh client (important for Veo key selection)
const getClient = () => {
  const apiKey = process.env.API_KEY || ''; 
  // Note: In a real Veo implementation, we might need to wait for aistudio selection
  // but for the prompt requirements, we initialize normally or re-initialize.
  return new GoogleGenAI({ apiKey });
};

// --- Utils ---

export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix
      const base64Data = base64String.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// --- Utilities for Features ---

export const enhancePrompt = async (input: string): Promise<string> => {
  const ai = getClient();
  const model = 'gemini-3-flash-preview';
  
  const response = await ai.models.generateContent({
    model,
    contents: { 
      parts: [{ 
        text: `Rewrite the following user prompt to be more detailed, creative, and optimized for an LLM to get the best possible result. Keep the intent identical but expand on the description. Output ONLY the rewritten prompt. Input: "${input}"` 
      }] 
    }
  });

  return response.text || input;
};

// --- Text & General Chat ---

export const sendMessage = async (
  prompt: string,
  personality: Personality,
  history: any[], // Simplified history handling for this demo
  attachments: File[],
  useGrounding: boolean = false,
  useThinking: boolean = false
): Promise<{ text: string; groundingChunks?: any[] }> => {
  const ai = getClient();
  
  // Decide model based on complexity requests
  let model = 'gemini-3-flash-preview'; // Default fast
  if (useThinking) model = 'gemini-3-pro-preview';

  const parts: any[] = [];
  
  // Add attachments
  for (const file of attachments) {
    const part = await fileToGenerativePart(file);
    parts.push(part);
  }
  
  parts.push({ text: prompt });

  const config: any = {
    systemInstruction: PERSONALITY_CONFIGS[personality].prompt,
  };

  if (useGrounding) {
    config.tools = [{ googleSearch: {} }];
  }

  if (useThinking) {
    config.thinkingConfig = { thinkingBudget: 32768 }; // Max for Pro
    // Do not set maxOutputTokens when using thinking
  } 

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: { parts },
    config
  });

  return {
    text: response.text || "I couldn't generate a text response.",
    groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks
  };
};

// --- Image Generation & Editing ---

export const generateImage = async (
  prompt: string, 
  size: '1K' | '2K' | '4K' = '1K',
  aspectRatio: string = '1:1',
  baseImage?: File
): Promise<string> => {
  const ai = getClient();
  
  // If baseImage exists, we are editing/varying
  if (baseImage) {
    const imagePart = await fileToGenerativePart(baseImage);
    const model = 'gemini-2.5-flash-image'; // Editing model
    
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [imagePart, { text: prompt }]
      }
    });

    // Extract image from response
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated in edit mode.");
  } else {
    // Generation mode
    const model = 'gemini-3-pro-image-preview';
    
    // We check for key selection for Pro Image if needed, similar to Veo
    if (window.aistudio && await window.aistudio.hasSelectedApiKey && !(await window.aistudio.hasSelectedApiKey())) {
       await window.aistudio.openSelectKey();
       // Re-instantiate generic client after selection if needed, 
       // but here we just proceed assuming env or injection worked.
    }

    const response = await ai.models.generateContent({
      model,
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
          imageSize: size,
          aspectRatio: aspectRatio
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated.");
  }
};

// --- Video Generation (Veo) ---

export const generateVideo = async (
  prompt: string,
  aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<string> => {
  
  // Veo Check
  if (window.aistudio) {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await window.aistudio.openSelectKey();
    }
  }

  // Re-create AI to ensure key is picked up
  const ai = getClient();
  const model = 'veo-3.1-fast-generate-preview';

  let operation = await ai.models.generateVideos({
    model,
    prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio
    }
  });

  // Polling
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Video generation failed.");

  // Fetch with key
  const finalUrl = `${videoUri}&key=${process.env.API_KEY}`;
  return finalUrl;
};

// --- Types for global objects ---
declare global {
  interface Window {
    // aistudio: any; // Removed to avoid conflict with existing AIStudio type
    webkitAudioContext: typeof AudioContext;
  }
}