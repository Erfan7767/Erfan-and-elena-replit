import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  askGemini,
  type AgentId,
  type ConversationMode,
  type ConversationState,
  loadConversation,
  makeMessage,
  saveConversation,
  speak,
  startListening,
  stopSpeaking,
} from '@/lib/assistant';

const agentDetails: Record<AgentId, { name: string; label: string; color: 'primary' | 'accent'; icon: keyof typeof Ionicons.glyphMap }> = {
  irfan: { name: 'Irfan', label: 'Clear and grounded', color: 'primary', icon: 'radio-outline' },
  elena: { name: 'Elena', label: 'Warm and perceptive', color: 'accent', icon: 'sparkles-outline' },
};

function AgentOrb({ agent, size = 54 }: { agent: AgentId; size?: number }) {
  const colors = useColors();
  const detail = agentDetails[agent];
  const fill = detail.color === 'primary' ? colors.primary : colors.accent;
  return (
    <LinearGradient
      colors={detail.color === 'primary' ? [colors.primary, '#2DD4BF'] : [colors.accent, '#FDBA74']}
      style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Ionicons name={detail.icon} size={size * 0.43} color={detail.color === 'primary' ? colors.primaryForeground : colors.accentForeground} />
      <View style={[styles.orbDot, { backgroundColor: fill }]} />
    </LinearGradient>
  );
}

function MessageBubble({ message }: { message: ReturnType<typeof makeMessage> }) {
  const colors = useColors();
  const isUser = message.role === 'user';
  const agent = message.agent ?? 'irfan';
  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      {!isUser && <AgentOrb agent={agent} size={30} />}
      <View
        style={[
          styles.bubble,
          isUser ? { backgroundColor: colors.primary, borderBottomRightRadius: 6 } : { backgroundColor: colors.card, borderBottomLeftRadius: 6 },
        ]}
      >
        {!isUser && (
          <Text style={[styles.bubbleAgent, { color: agent === 'elena' ? colors.accent : colors.primary }]}>
            {agentDetails[agent].name}
          </Text>
        )}
        <Text style={[styles.bubbleText, { color: isUser ? colors.primaryForeground : colors.cardForeground }]}>{message.text}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [conversation, setConversation] = useState<ConversationState>({ messages: [], activeMode: 'irfan' });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    void loadConversation().then(setConversation);
    return () => {
      stopListeningRef.current?.();
      stopSpeaking();
    };
  }, []);

  const activeAgents = useMemo<AgentId[]>(() => {
    if (conversation.activeMode === 'together') return ['irfan', 'elena'];
    return [conversation.activeMode];
  }, [conversation.activeMode]);

  const updateConversation = useCallback((next: ConversationState) => {
    setConversation(next);
    void saveConversation(next);
  }, []);

  const send = useCallback(async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || isLoading) return;
    Keyboard.dismiss();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userMessage = makeMessage('user', text);
    const withUser = { ...conversation, messages: [...conversation.messages, userMessage] };
    updateConversation(withUser);
    setInput('');
    setNotice(null);
    setIsLoading(true);
    try {
      const result = await askGemini(text, withUser);
      const assistantMessage = makeMessage('assistant', result.text, result.agent);
      const completed = { ...withUser, messages: [...withUser.messages, assistantMessage] };
      updateConversation(completed);
      speak(result.text, result.agent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The voice connection could not be reached.';
      setNotice(message);
      speak(message, activeAgents[0]);
    } finally {
      setIsLoading(false);
    }
  }, [activeAgents, conversation, input, isLoading, updateConversation]);

  const chooseMode = useCallback((mode: ConversationMode) => {
    if (mode === conversation.activeMode) return;
    void Haptics.selectionAsync();
    updateConversation({ ...conversation, activeMode: mode });
    setNotice(mode === 'together' ? 'Irfan and Elena are listening together.' : `${agentDetails[mode].name} is now listening.`);
  }, [conversation, updateConversation]);

  const toggleListening = useCallback(async () => {
    if (isListening) {
      stopListeningRef.current?.();
      stopListeningRef.current = null;
      setIsListening(false);
      return;
    }
    const stop = await startListening(
      (transcript) => {
        setIsListening(false);
        stopListeningRef.current = null;
        void send(transcript);
      },
      () => {
        setIsListening(false);
        stopListeningRef.current = null;
      },
      (message) => {
        setIsListening(false);
        stopListeningRef.current = null;
        setNotice(message);
      },
    );
    if (!stop) {
      inputRef.current?.focus();
      if (Platform.OS === 'web') setNotice('Voice input is not supported in this browser.');
      return;
    }
    stopListeningRef.current = stop;
    setIsListening(true);
    setNotice('Listening…');
  }, [isListening, send]);

  const clearHistory = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateConversation({ ...conversation, messages: [] });
    setNotice('Conversation cleared.');
  }, [conversation, updateConversation]);

  return (
    <LinearGradient colors={[colors.background, '#0B1A2E', colors.background]} style={styles.screen}>
      <KeyboardAvoidingView style={styles.keyboard} behavior="padding" keyboardVerticalOffset={0}>
        <View style={[styles.safeTop, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>VOICE COMPANIONS</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>Your room to think.</Text>
            </View>
            <Pressable testID="clear-conversation" onPress={clearHistory} style={styles.iconButton}>
              <Ionicons name="trash-outline" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={[styles.agentsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.agentsTop}>
              <View>
                <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>NOW LISTENING</Text>
                <Text style={[styles.listeningText, { color: colors.foreground }]}>
                  {conversation.activeMode === 'together' ? 'Irfan + Elena' : agentDetails[conversation.activeMode].name}
                </Text>
              </View>
              <View style={styles.orbStack}>
                {activeAgents.map((agent, index) => (
                  <View key={agent} style={{ marginLeft: index === 0 ? 0 : -12 }}>
                    <AgentOrb agent={agent} size={48} />
                  </View>
                ))}
              </View>
            </View>
            <View style={[styles.modePills, { backgroundColor: colors.muted }]}>
              {(['irfan', 'elena', 'together'] as ConversationMode[]).map((mode) => (
                <Pressable
                  testID={`mode-${mode}`}
                  key={mode}
                  onPress={() => chooseMode(mode)}
                  style={[styles.modePill, conversation.activeMode === mode && { backgroundColor: colors.secondary }]}
                >
                  <Text style={[styles.modeText, { color: conversation.activeMode === mode ? colors.foreground : colors.mutedForeground }]}>
                    {mode === 'together' ? 'Together' : agentDetails[mode].name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <FlatList
          data={conversation.messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={[
            styles.messages,
            conversation.messages.length === 0 && styles.messagesEmpty,
            { paddingBottom: 12 },
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyRing, { borderColor: colors.border }]}>
                <AgentOrb agent={conversation.activeMode === 'elena' ? 'elena' : 'irfan'} size={76} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Start with what’s on your mind.</Text>
              <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
                Ask for a plan, talk through a decision, or bring both voices into the room.
              </Text>
              <View style={styles.suggestions}>
                {['Help me untangle a decision', 'Plan my next two hours', 'I need a fresh perspective'].map((suggestion) => (
                  <Pressable key={suggestion} onPress={() => void send(suggestion)} style={[styles.suggestion, { borderColor: colors.border }]}>
                    <Text style={[styles.suggestionText, { color: colors.secondaryForeground }]}>{suggestion}</Text>
                    <Ionicons name="arrow-up-outline" size={16} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            isLoading ? (
              <View style={styles.typingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.typingText, { color: colors.mutedForeground }]}>
                  {conversation.activeMode === 'together' ? 'Both companions are thinking…' : `${agentDetails[conversation.activeMode].name} is thinking…`}
                </Text>
              </View>
            ) : null
          }
        />

        <View style={[styles.composerArea, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 14) }]}>
          {notice && (
            <Pressable onPress={() => setNotice(null)} style={[styles.notice, { backgroundColor: colors.muted }]}>
              <Ionicons name={notice.includes('Listening') ? 'mic-outline' : 'information-circle-outline'} size={16} color={colors.primary} />
              <Text style={[styles.noticeText, { color: colors.secondaryForeground }]} numberOfLines={1}>{notice}</Text>
            </Pressable>
          )}
          <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              testID="message-input"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => void send()}
              placeholder={conversation.activeMode === 'together' ? 'Speak to both companions…' : `Message ${agentDetails[conversation.activeMode].name}…`}
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground }]}
              multiline
              maxLength={2000}
              returnKeyType="send"
            />
            <Pressable testID="voice-button" onPress={toggleListening} style={[styles.composerIcon, isListening && { backgroundColor: colors.accent }]}>
              <Ionicons name={isListening ? 'stop' : 'mic'} size={20} color={isListening ? colors.accentForeground : colors.primary} />
            </Pressable>
            <Pressable testID="send-button" onPress={() => void send()} disabled={!input.trim() || isLoading} style={[styles.sendButton, { backgroundColor: input.trim() && !isLoading ? colors.primary : colors.muted }]}>
              <Ionicons name="arrow-up" size={20} color={input.trim() && !isLoading ? colors.primaryForeground : colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={[styles.footerHint, { color: colors.mutedForeground }]}>Tap the microphone to speak · {conversation.messages.length} messages saved locally</Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboard: { flex: 1 },
  safeTop: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.8, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.8 },
  iconButton: { padding: 10, marginTop: -4 },
  agentsCard: { borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 18 },
  agentsTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 5 },
  listeningText: { fontSize: 20, fontWeight: '600' },
  orbStack: { flexDirection: 'row', alignItems: 'center' },
  orb: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  orbDot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, bottom: 3, right: 3, borderWidth: 1.5, borderColor: '#08111F' },
  modePills: { flexDirection: 'row', borderRadius: 13, padding: 3 },
  modePill: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  modeText: { fontSize: 12, fontWeight: '600' },
  messages: { paddingHorizontal: 20, gap: 13 },
  messagesEmpty: { flexGrow: 1, justifyContent: 'center' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, maxWidth: '92%' },
  messageRowUser: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 18, paddingHorizontal: 15, paddingVertical: 12, maxWidth: '88%' },
  bubbleAgent: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  emptyState: { alignItems: 'center', paddingHorizontal: 8 },
  emptyRing: { width: 98, height: 98, borderRadius: 49, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  emptyTitle: { fontSize: 21, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  emptyCopy: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 320, marginBottom: 22 },
  suggestions: { width: '100%', gap: 8 },
  suggestion: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestionText: { fontSize: 13, flex: 1 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 38 },
  typingText: { fontSize: 13 },
  composerArea: { paddingHorizontal: 16, paddingTop: 10 },
  notice: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7 },
  noticeText: { fontSize: 12, flex: 1 },
  composer: { minHeight: 58, borderWidth: 1, borderRadius: 20, paddingLeft: 15, paddingRight: 7, paddingVertical: 7, flexDirection: 'row', alignItems: 'flex-end' },
  input: { flex: 1, maxHeight: 100, minHeight: 40, fontSize: 15, lineHeight: 21, paddingTop: 9, paddingBottom: 8 },
  composerIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  footerHint: { textAlign: 'center', fontSize: 10, paddingTop: 8 },
});