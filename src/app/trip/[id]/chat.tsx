// umuv-rider/src/app/trip/[id]/chat.tsx

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../lib/api';
import { getEcho } from '../../../lib/echo';
import { t } from '../../../lib/i18n';
import { useAuth } from '../../../context/AuthContext';
import { colors, spacing, radius } from '../../../theme';

const HEADER_HEIGHT = 56;

const QUICK_REPLIES = ['On my way', 'I am here', '2 min'];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const listRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.getMessages(Number(id))
      .then((res: any) => setMessages(res?.data ?? res ?? []))
      .catch((e: any) => Alert.alert(t('error'), e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    api.markChatRead(Number(id)).catch(() => {});
  }, [id]);

  useEffect(() => {
    let channel: any = null;
    let mounted = true;

    const setup = async () => {
      try {
        const echo = await getEcho();
        if (!echo || !mounted) {
          console.warn('[CHAT] getEcho returned null');
          return;
        }

        const channelName = `trip.${id}`;
        console.log('[CHAT] subscribing to', channelName);

        channel = echo.private(channelName);

        channel
          .subscribed(() => console.log('[CHAT] ✓ subscribed to', channelName))
          .error((err: any) => console.warn('[CHAT] ✗ subscription error', channelName, err))
          .listen('.MessageSent', (data: any) => {
            const m = data?.message;
            console.log('[CHAT] ✓ MessageSent received', m?.body);
            if (!m) return;
            if (Number(m.sender_id) === Number(user?.id)) return;
            setMessages((prev) => {
              if (prev.some((x) => Number(x.id) === Number(m.id))) return prev;
              return [...prev, m];
            });
            api.markChatRead(Number(id)).catch(() => {});
          });
      } catch (err) {
        console.warn('[CHAT] setup failed', err);
      }
    };

    setup();

    return () => {
      mounted = false;
      try { if (channel) channel.stopListening('.MessageSent'); } catch {}
    };
  }, [id, user?.id]);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const send = async (text?: string) => {
    const body = (text ?? newMessage).trim();
    if (!body) return;

    setNewMessage('');
    setSending(true);

    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      sender_id: user?.id,
      body,
      created_at: new Date().toISOString(),
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const saved = await api.sendMessage(Number(id), body);
      setMessages((prev) => prev.map((m) => m.id === optimisticId ? { ...(saved as any), optimistic: false } : m));
    } catch (e: any) {
      Alert.alert(t('chat_failed'), e?.message ?? String(e));
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.slate50 }} edges={['top']}>
      <View style={{ height: HEADER_HEIGHT, backgroundColor: colors.ink, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: 'white', fontSize: 16, fontWeight: '800' }}>{t('chat_title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? HEADER_HEIGHT + insets.top : 0}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.umuv} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            extraData={messages.length}
            contentContainerStyle={{ padding: spacing.lg, gap: 8, paddingBottom: spacing.md }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const mine = Number(item.sender_id) === Number(user?.id);
              return (
                <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  <View style={{
                    maxWidth: '80%',
                    backgroundColor: mine ? colors.umuv : 'white',
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18,
                    borderTopRightRadius: mine ? 6 : 18,
                    borderTopLeftRadius: mine ? 18 : 6,
                    borderWidth: 1, borderColor: mine ? colors.umuv : colors.slate200,
                    opacity: item.optimistic ? 0.7 : 1,
                  }}>
                    <Text style={{ fontSize: 14, color: mine ? 'white' : colors.ink, fontWeight: '500', lineHeight: 20 }}>{item.body}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Text style={{ fontSize: 10, color: colors.slate400, fontWeight: '600' }}>
                      {new Date(item.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {mine && !item.optimistic && (
                      <Ionicons
                        name={item.read_at ? 'checkmark-done' : 'checkmark'}
                        size={12}
                        color={item.read_at ? colors.umuv : colors.slate400}
                      />
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Ionicons name="chatbubbles-outline" size={40} color={colors.slate300} />
                <Text style={{ fontSize: 14, color: colors.slate500, marginTop: 12, fontWeight: '600' }}>{t('chat_no_messages')}</Text>
              </View>
            }
          />
        )}

        {/* Quick replies */}
        {messages.length < 3 && (
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: 8, flexDirection: 'row', gap: 8 }}>
            {QUICK_REPLIES.map((text) => (
              <TouchableOpacity
                key={text}
                onPress={() => send(text)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: colors.umuvLight, borderWidth: 1, borderColor: colors.umuv }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.umuvDark }}>{text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ backgroundColor: 'white', borderTopWidth: 1, borderTopColor: colors.slate200, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.md), flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TextInput
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder={t('chat_placeholder')}
            placeholderTextColor={colors.slate400}
            multiline
            maxLength={1000}
            style={{ flex: 1, maxHeight: 100, backgroundColor: colors.slate50, borderRadius: radius.xl, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.slate200 }}
          />
          <TouchableOpacity onPress={() => send()} disabled={!newMessage.trim() || sending} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: newMessage.trim() ? colors.umuv : colors.slate200, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="send" size={20} color={newMessage.trim() ? 'white' : colors.slate400} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}