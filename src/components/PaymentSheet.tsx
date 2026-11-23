// umuv-rider/src/components/PaymentSheet.tsx

import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { colors, spacing, radius, shadows } from '../theme';

type ProviderId = 'card' | 'orange_money' | 'myzaka' | 'smega' | 'paypal';

type Props = {
  visible: boolean;
  tripId: number;
  amount: number;
  onClose: () => void;
  onPaid: () => void;
};

const PROVIDERS: Array<{ id: ProviderId; labelKey: string; icon: string; color: string; hintKey: string }> = [
  { id: 'card',         labelKey: 'pay_card',         icon: 'card',           color: '#0B5FFF', hintKey: 'pay_card_hint' },
  { id: 'orange_money', labelKey: 'pay_orange',       icon: 'phone-portrait', color: '#FF7900', hintKey: 'pay_prompt_hint' },
  { id: 'myzaka',       labelKey: 'pay_myzaka',       icon: 'phone-portrait', color: '#8B1A1A', hintKey: 'pay_prompt_hint' },
  { id: 'smega',        labelKey: 'pay_smega',        icon: 'phone-portrait', color: '#0084C7', hintKey: 'pay_prompt_hint' },
  { id: 'paypal',       labelKey: 'pay_paypal',       icon: 'logo-paypal',    color: '#003087', hintKey: 'pay_redirect_hint' },
];

export function PaymentSheet({ visible, tripId, amount, onClose, onPaid }: Props) {
  const [selected, setSelected] = useState<ProviderId>('card');
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    try {
      const res = await api.initiateTripPayment(tripId, selected);

      // DPO / Orange / PayPal: open the provider's page in a secure in-app browser
      if (res.redirect_url) {
        await WebBrowser.openBrowserAsync(res.redirect_url);
        // After the browser closes, poll for the final status
        await pollUntilPaid();
        return;
      }

      // MyZaka / Smega: prompt already sent to the phone
      Alert.alert(t('pay_prompt_title'), t('pay_prompt_msg'));
      await pollUntilPaid();
    } catch (e: any) {
      Alert.alert(t('error'), e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const pollUntilPaid = async (maxTries = 30, intervalMs = 3000) => {
    for (let i = 0; i < maxTries; i++) {
      try {
        const status = await api.getTripPaymentStatus(tripId);
        if (status.payment_status === 'paid') {
          onPaid();
          onClose();
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    Alert.alert(t('pay_pending_title'), t('pay_pending_msg'));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, ...shadows.card }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.ink }}>{t('pay_title')}</Text>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <Ionicons name="close" size={24} color={colors.slate500} />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 13, color: colors.slate500, marginBottom: 12 }}>
            {t('pay_amount')}: <Text style={{ fontWeight: '900', color: colors.ink }}>P {amount.toFixed(2)}</Text>
          </Text>

          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {PROVIDERS.map((p) => {
              const active = selected === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setSelected(p.id)}
                  disabled={loading}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: 14, borderRadius: radius.lg, marginBottom: 8,
                    borderWidth: 2, borderColor: active ? colors.umuv : colors.slate200,
                    backgroundColor: active ? colors.umuvLight : 'white',
                  }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: p.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={p.icon as any} size={20} color={p.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink }}>{t(p.labelKey)}</Text>
                    <Text style={{ fontSize: 11, color: colors.slate500, marginTop: 2 }}>{t(p.hintKey)}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={22} color={colors.umuv} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            onPress={start}
            disabled={loading}
            style={{
              marginTop: spacing.md,
              backgroundColor: colors.umuv,
              paddingVertical: 16,
              borderRadius: radius.lg,
              alignItems: 'center',
            }}
          >
            {loading ? <ActivityIndicator color="white" /> : (
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '900' }}>{t('pay_now')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}