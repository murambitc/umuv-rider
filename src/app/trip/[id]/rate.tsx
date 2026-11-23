// umuv-rider/src/app/trip/[id]/rate.tsx

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../lib/api';
import { t } from '../../../lib/i18n';
import { useAuth } from '../../../context/AuthContext';
import { colors, spacing, radius } from '../../../theme';

const TAG_KEYS = ['rate_tag_safe', 'rate_tag_clean', 'rate_tag_friendly', 'rate_tag_ontime'];

export default function RateDriverScreen() {
  const { id, driverName } = useLocalSearchParams<{ id: string; driverName?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useAuth();

  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleTag = (tag: string) => setSelectedTags((prev) => prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]);

  const submit = async () => {
    setLoading(true);
    try {
      const fullComment = [comment, ...selectedTags.map((k) => t(k))].filter(Boolean).join(' ');
      await api.rateTrip(Number(id), score, fullComment || undefined);
      Alert.alert(t('rate_thank_you'), t('rate_thank_you_msg'), [{ text: t('reg_ok'), onPress: () => router.replace('/(tabs)/home') }]);
    } catch (e: any) { Alert.alert(t('error'), e.message); setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.slate50 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.umuv, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 32, fontWeight: '900', color: 'white' }}>{driverName?.charAt(0).toUpperCase() ?? 'D'}</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>{t('rate_title', { name: driverName ?? t('driver') })}</Text>
            <Text style={{ fontSize: 14, color: colors.slate500, marginTop: 4 }}>{t('rate_driver_sub')}</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: spacing.xl }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => setScore(star)}>
                <Ionicons name={star <= score ? 'star' : 'star-outline'} size={40} color={star <= score ? colors.amber : colors.slate300} />
              </TouchableOpacity>
            ))}
          </View>

          {score >= 4 && (
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.slate500, letterSpacing: 0.5, marginBottom: 10 }}>{t('rate_well')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TAG_KEYS.map((tagKey) => {
                  const active = selectedTags.includes(tagKey);
                  return (
                    <TouchableOpacity key={tagKey} onPress={() => toggleTag(tagKey)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: active ? colors.marketLight : 'white', borderWidth: 1, borderColor: active ? colors.market : colors.slate200 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? colors.marketDark : colors.slate600 }}>{t(tagKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <Text style={{ fontSize: 11, fontWeight: '800', color: colors.slate500, letterSpacing: 0.5, marginBottom: 8 }}>{t('rate_comment_label')}</Text>
          <TextInput value={comment} onChangeText={setComment} placeholder={t('rate_comment_ph')} placeholderTextColor={colors.slate400} multiline numberOfLines={4} style={{ backgroundColor: 'white', borderRadius: radius.lg, padding: 16, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.slate200, minHeight: 100, textAlignVertical: 'top', marginBottom: spacing.xl }} />

          <TouchableOpacity onPress={submit} disabled={loading} style={{ backgroundColor: colors.umuv, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center' }}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: '900', fontSize: 16 }}>{t('rate_submit')}</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(tabs)/home')} style={{ alignItems: 'center', paddingVertical: 16, marginTop: 8 }}>
            <Text style={{ color: colors.slate500, fontSize: 14, fontWeight: '600' }}>{t('rate_skip')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}