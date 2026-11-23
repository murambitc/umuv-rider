// umuv-rider/src/app/trip/[id]/call.tsx

import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../../../lib/i18n';
import { useAuth } from '../../../context/AuthContext';
import { colors, spacing, radius } from '../../../theme';

export default function CallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useAuth();

  const callViaPhone = () => { Linking.openURL('tel:+26770000000'); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
        <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: colors.umuvLight, alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 4, borderColor: 'white' }}>
          <Ionicons name="call" size={64} color={colors.umuv} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '900', color: 'white', textAlign: 'center', marginBottom: 8 }}>{t('call_title')}</Text>
        <Text style={{ fontSize: 15, color: colors.slate400, textAlign: 'center', marginBottom: 4 }}>{t('call_requires_build')}</Text>
        <Text style={{ fontSize: 13, color: colors.slate500, textAlign: 'center' }}>{t('call_requires_build_sub')}</Text>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: 12 }}>
        <TouchableOpacity onPress={callViaPhone} style={{ backgroundColor: colors.market, borderRadius: radius.xl, paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
          <Ionicons name="call" size={20} color="white" />
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>{t('call_via_phone')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.xl, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '800' }}>{t('call_cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}