import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../../lib/api';
import { getEcho } from '../../../lib/echo';
import { useAuth } from '../../../context/AuthContext';
import { colors, spacing, radius, shadows } from '../../../theme';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Load History
  useEffect(() => {
    api.getMessages(Number(id))
      .then((res) => setMessages(res))
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Listen to Echo
  useEffect(() => {
    let echo: any;
    let channel: any;

    const setup = async () => {
      echo = await getEcho();
      channel = echo.private(`trip.${id}`);

      channel.listen('.MessageSent', (data: any) => {
        if (data.message.sender_id === user.id) return; // Ignore own messages (handled optimistically)
        setMessages((prev) => [...prev, data.message]);
        flatListRef.current?.scrollToEnd({ animated: true });
      });
    };
    setup();

    return () => { if (echo) echo.disconnect(); };
  }, [id, user?.id]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const text = newMessage;
    setNewMessage('');
    setSending(true);

    const optimisticMsg = {
      id: Date.now(),
      sender_id: user?.id,
      body: text,
      created_at: new Date().toISOString(),
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    flatListRef.current?.scrollToEnd({ animated: true });

    try {
      await api.sendMessage(Number(id), text);
    } catch (e: any) {
      Alert.alert('Failed to send', e.message);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.slate50 }}>
        <ActivityIndicator size="large" color={colors.umuv} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.slate50 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: colors.slate200 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={{ fontSize: 18, color: colors.umuv, fontWeight: '700' }}>←</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginLeft: 8 }}>Trip Chat</Text>
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isMine = item.sender_id === user?.id;
            return (
              <View style={{
                alignSelf: isMine ? 'flex-end' : 'flex-start',
                backgroundColor: isMine ? colors.umuv : 'white',
                padding: 12, borderRadius: radius.lg, maxWidth: '75%', marginBottom: 8,
                borderBottomRightRadius: isMine ? 2 : radius.lg,
                borderBottomLeftRadius: isMine ? radius.lg : 2,
                ...shadows.card, opacity: item.optimistic ? 0.7 : 1,
              }}>
                {!isMine && <Text style={{ fontSize: 11, fontWeight: '700', color: colors.umuv, marginBottom: 4 }}>{item.sender?.name ?? 'Driver'}</Text>}
                <Text style={{ fontSize: 15, color: isMine ? 'white' : colors.ink, fontWeight: '500' }}>{item.body}</Text>
                <Text style={{ fontSize: 10, marginTop: 4, textAlign: 'right', color: isMine ? 'rgba(255,255,255,0.7)' : colors.slate400 }}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={<View style={{ alignItems: 'center', paddingVertical: 40 }}><Text style={{ fontSize: 14, color: colors.slate400 }}>No messages yet. Say hello!</Text></View>}
        />

        <View style={{ flexDirection: 'row', padding: spacing.md, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: colors.slate200, alignItems: 'center', gap: 8 }}>
          <TextInput
            value={newMessage} onChangeText={setNewMessage} placeholder="Type a message..." placeholderTextColor={colors.slate400}
            style={{ flex: 1, backgroundColor: colors.slate100, borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.ink }} multiline
          />
          <TouchableOpacity onPress={sendMessage} disabled={!newMessage.trim() || sending}
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: newMessage.trim() ? colors.umuv : colors.slate300, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: 'white', fontSize: 20, fontWeight: '800' }}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}