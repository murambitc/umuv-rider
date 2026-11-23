// umuv-rider/src/app/(tabs)/profile.tsx

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, ScrollView, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { t } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, shadows } from '../../theme';
import { Button } from '../../components/Button';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut, language } = useAuth();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [phone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [profilePhoto] = useState(user?.profile_photo ?? null);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('permission_needed'), t('permission_photo')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled) return;
    Alert.alert(t('photo_upload_coming'));
  };

  const save = async () => {
    if (!name.trim()) { Alert.alert(t('error'), t('name_empty_error')); return; }
    setLoading(true);
    try {
      await api.updateProfile({ name, email: email || undefined });
      Alert.alert(t('saved'), t('profile_updated'));
    } catch (e: any) { Alert.alert(t('error'), e.message); }
    finally { setLoading(false); }
  };

  const handleSignOut = () => {
    Alert.alert(t('sign_out_confirm_title'), t('sign_out_confirm_msg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('sign_out'), style: 'destructive', onPress: async () => { await signOut(); router.replace('/'); } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.slate50 }}>
      <View style={{ backgroundColor: colors.ink, paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Text style={{ color: 'white', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>{t('profile_title')}</Text>
        <Text style={{ color: colors.slate400, fontSize: 13, marginTop: 2 }}>{t('profile_sub')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <TouchableOpacity onPress={pickPhoto}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 4, borderColor: 'white', ...shadows.card }}>
              {profilePhoto ? <Image source={{ uri: profilePhoto }} style={{ width: 96, height: 96 }} /> : (
                <Text style={{ fontSize: 32, fontWeight: '900', color: colors.ink }}>{name?.charAt(0).toUpperCase() ?? 'R'}</Text>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickPhoto} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.umuv, fontSize: 13, fontWeight: '700' }}>{t('change_photo')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>{t('full_name').toUpperCase()}</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} />

        <Text style={styles.label}>{t('phone_number_locked').toUpperCase()}</Text>
        <TextInput value={phone} editable={false} style={[styles.input, { backgroundColor: colors.slate100, color: colors.slate500 }]} />

        <Text style={styles.label}>{t('email_optional').toUpperCase()}</Text>
        <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder={t('email_placeholder')} placeholderTextColor={colors.slate400} style={styles.input} />

        <Button title={loading ? t('saving') : t('save_changes')} onPress={save} loading={loading} style={{ marginTop: spacing.lg }} />

        <TouchableOpacity onPress={() => router.push('/(tabs)/support')} style={{ marginTop: spacing.xl, paddingVertical: 16, paddingHorizontal: 18, borderRadius: radius.xl, backgroundColor: 'white', borderWidth: 1, borderColor: colors.slate200, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...shadows.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.umuvLight, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="help-circle" size={20} color={colors.umuv} />
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{t('contact_support')}</Text>
              <Text style={{ fontSize: 12, color: colors.slate500, marginTop: 1 }}>{t('contact_support_sub')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.slate400} />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSignOut} style={{ marginTop: spacing.md, paddingVertical: 16, borderRadius: radius.lg, backgroundColor: '#FEE2E2', alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A5' }}>
          <Text style={{ color: '#991B1B', fontSize: 15, fontWeight: '800' }}>{t('sign_out')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = {
  label: { color: colors.slate500, fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: 'white', borderRadius: radius.lg, padding: 16, fontSize: 15, fontWeight: '600' as const, color: colors.ink, borderWidth: 1, borderColor: colors.slate200 },
};