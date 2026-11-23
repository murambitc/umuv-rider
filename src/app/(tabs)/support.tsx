// umuv-rider/src/app/(tabs)/support.tsx

import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, shadows } from '../../theme';

const SUPPORT_CHANNELS = [
  { icon: 'call', color: '#10B981', labelKey: 'support_call', value: '+267 7000 0000', action: 'tel:+26770000000' },
  { icon: 'logo-whatsapp', color: '#25D366', labelKey: 'support_whatsapp', value: '+267 7000 0000', action: 'https://wa.me/26770000000' },
  { icon: 'mail', color: '#0B5FFF', labelKey: 'support_email', value: 'support@umuv.co.bw', action: 'mailto:support@umuv.co.bw' },
];

const RIDER_FAQ_KEYS = [
  { q: 'faq_rider_q1', a: 'faq_rider_a1' },
  { q: 'faq_rider_q2', a: 'faq_rider_a2' },
  { q: 'faq_rider_q3', a: 'faq_rider_a3' },
  { q: 'faq_rider_q4', a: 'faq_rider_a4' },
];

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.slate50 }}>
      <View style={{ backgroundColor: colors.ink, paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Text style={{ color: 'white', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>{t('support_title')}</Text>
        <Text style={{ color: colors.slate400, fontSize: 13, marginTop: 2 }}>{t('support_sub')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 4 }}>{t('contact_support')}</Text>
        <Text style={{ fontSize: 13, color: colors.slate500, marginBottom: spacing.lg }}>{t('support_sub')}</Text>

        {SUPPORT_CHANNELS.map((c) => (
          <TouchableOpacity key={c.labelKey} onPress={() => Linking.openURL(c.action)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.xl, backgroundColor: 'white', borderWidth: 1, borderColor: colors.slate200, marginBottom: 10, ...shadows.card }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.color + '15', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={c.icon as any} size={22} color={c.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{t(c.labelKey)}</Text>
              <Text style={{ fontSize: 13, color: colors.slate500, marginTop: 2 }}>{c.value}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.slate400} />
          </TouchableOpacity>
        ))}

        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: spacing.xl, marginBottom: 12 }}>{t('faq_title')}</Text>

        {RIDER_FAQ_KEYS.map((faq, i) => (
          <View key={i} style={{ backgroundColor: 'white', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.slate200, padding: 16, marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink, marginBottom: 6 }}>{t(faq.q)}</Text>
            <Text style={{ fontSize: 13, color: colors.slate600, lineHeight: 20 }}>{t(faq.a)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}