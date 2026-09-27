import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export type AgentId = 'irfan' | 'elena';
export type ConversationMode = AgentId | 'together';

export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  agent?: AgentId;
  createdAt: number;
};

export type ConversationState = {
  messages: Message[];
  activeMode: ConversationMode;
};

const HISTORY_KEY = '@irfan-elena/history-v1';

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export async function loadConversation(): Promise<ConversationState> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return { messages: [], activeMode: 'irfan' };
  try {
    const parsed = JSON.parse(raw) as ConversationState;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      activeMode: parsed.activeMode === 'elena' || parsed.activeMode === 'together' ? parsed.activeMode : 'irfan',
    };
  } catch {
    return { messages: [], activeMode: 'irfan' };
  }
}

export async function saveConversation(state: ConversationState): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(state));
}

function personaPrompt(agent: AgentId): string {
  if (agent === 'elena') {
    return 'You are Elena, a perceptive and warm female voice companion. Be emotionally intelligent, concise, curious, and gently direct. Use natural spoken language.';
  }
  return 'You are Irfan, the primary voice companion. Be grounded, clear, capable, and calm. Use natural spoken language with confident next steps.';
}

function emotionHint(text: string): string {
  const lower = text.toLowerCase();
  const anxious = ['worried', 'stress', 'stressed', 'afraid', 'panic', 'sad', 'angry', 'overwhelmed'];
  if (anxious.some((word) => lower.includes(word))) {
    return 'The user may be under emotional pressure. Acknowledge the feeling briefly before solving the request, without sounding clinical.';
  }
  return 'Match the user’s energy. Stay human and avoid unnecessary disclaimers.';
}

function activeAgents(mode: ConversationMode): AgentId[] {
  return mode === 'together' ? ['irfan', 'elena'] : [mode];
}

export async function askGemini(
  input: string,
  state: ConversationState,
): Promise<{ text: string; agent: AgentId; collaboration?: boolean }> {
  const agents = activeAgents(state.activeMode);
  const selectedAgent = agents[0];
  const history = state.messages.slice(-12).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    text: message.text,
  }));

  const apiBase = Platform.OS === 'web'
    ? ''
    : `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ''}`;
  const response = await fetch(`${apiBase}/api/gemini/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: input,
      mode: state.activeMode,
      agents,
      history,
      systemInstruction: `${agents.map(personaPrompt).join('\n\n')}\n\n${emotionHint(input)}`,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `The Gemini connection returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as { text?: string; agent?: AgentId; collaboration?: boolean };
  if (!payload.text) throw new Error('Gemini returned an empty response.');
  return {
    text: payload.text,
    agent: payload.agent === 'elena' ? 'elena' : selectedAgent,
    collaboration: payload.collaboration,
  };
}

export function makeMessage(role: Message['role'], text: string, agent?: AgentId): Message {
  return { id: makeId(), role, text, agent, createdAt: Date.now() };
}

export function speak(text: string, agent: AgentId): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const speech = window.speechSynthesis;
    if (!speech) return;
    speech.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = agent === 'elena' ? 0.96 : 1.02;
    utterance.pitch = agent === 'elena' ? 1.14 : 0.82;
    speech.speak(utterance);
    return;
  }
  // Expo's native speech module is loaded dynamically so web preview remains safe.
  void import('expo-speech').then(({ speak: nativeSpeak }) => {
    nativeSpeak(text, {
      rate: agent === 'elena' ? 0.96 : 1.02,
      pitch: agent === 'elena' ? 1.14 : 0.82,
      voice: undefined,
    });
  }).catch(() => undefined);
}

export function stopSpeaking(): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.speechSynthesis?.cancel();
    return;
  }
  void import('expo-speech').then(({ stop }) => stop()).catch(() => undefined);
}

export async function startListening(
  onResult: (text: string) => void,
  onEnd: () => void,
  onError: (message: string) => void,
): Promise<(() => void) | null> {
  if (Platform.OS === 'web') {
    return startWebListening(onResult, onEnd, onError);
  }

  try {
    const permissions = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permissions.granted) {
      onError(permissions.canAskAgain === false
        ? 'Microphone access is blocked. Open your device settings to enable it.'
        : 'Microphone access is needed to listen.');
      return null;
    }

    const resultSubscription = ExpoSpeechRecognitionModule.addListener('result', (event) => {
      const transcript = event.results[0]?.transcript?.trim();
      if (transcript && event.isFinal) onResult(transcript);
    });
    const endSubscription = ExpoSpeechRecognitionModule.addListener('end', onEnd);
    const errorSubscription = ExpoSpeechRecognitionModule.addListener('error', (event) => {
      onError(event.message || `Speech recognition error: ${event.error}`);
    });
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
      addsPunctuation: true,
    });

    return () => {
      resultSubscription.remove();
      endSubscription.remove();
      errorSubscription.remove();
      ExpoSpeechRecognitionModule.stop();
    };
  } catch {
    onError('Native speech recognition is unavailable in this build.');
    return null;
  }
}

export function startWebListening(
  onResult: (text: string) => void,
  onEnd: () => void,
  onError?: (message: string) => void,
): (() => void) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const SpeechRecognitionCtor =
    (window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
    (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) return null;
  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) onResult(transcript);
  };
  recognition.onend = onEnd;
  recognition.onerror = () => {
    onError?.('Voice input could not hear a clear result.');
    onEnd();
  };
  recognition.start();
  return () => recognition.stop();
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  results?: ArrayLike<ArrayLike<{ transcript: string }>>;
  onresult: (event: { results?: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};