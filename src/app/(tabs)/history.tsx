// umuv-rider/src/app/(tabs)/history.tsx

import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, ActivityIndicator, Alert, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { t } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, shadows } from '../../theme';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language } = useAuth();
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.history()
      .then((res) => setTrips(res.data ?? res))
      .catch((e: any) => Alert.alert(t('error'), e.message))
      .finally(() => setLoading(false));
  }, []);

  const rebook = (trip: any) => {
    // Pre-fill the home screen with the same pickup/destination and service.
    router.push({
      pathname: '/(tabs)/home',
      params: {
        rebookLat:        String(trip.pickup_lat),
        rebookLng:        String(trip.pickup_lng),
        rebookAddress:    String(trip.pickup_address),
        rebookDestLat:    String(trip.dropoff_lat),
        rebookDestLng:    String(trip.dropoff_lng),
        rebookDestAddress:String(trip.dropoff_address),
        rebookService:    String(trip.service_type ?? 'ride'),
        rebookVehicle:    String(trip.vehicle_class ?? 'sedan'),
        rebookAt:         String(Date.now()), // forces param change even if same trip is tapped twice
      },
    });
  };

  const onTripPress = (trip: any) => {
    // Only completed trips can be re-booked; anything else opens the live trip screen.
    if (trip.status !== 'completed') {
      router.push(`/trip/${trip.id}`);
      return;
    }

    Alert.alert(
      trip.trip_code,
      `${trip.pickup_address}\n→ ${trip.dropoff_address}`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('history_rebook'),
          onPress: () => rebook(trip),
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.slate50 }}>
      {/* HEADER */}
      <View style={{ backgroundColor: colors.ink, paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Text style={{ color: 'white', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>{t('history_title')}</Text>
        <Text style={{ color: colors.slate400, fontSize: 13, marginTop: 2 }}>{t('history_sub')}</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.umuv} />
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(it) => String(it.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Ionicons name="time-outline" size={40} color={colors.slate400} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 12 }}>{t('no_history_yet')}</Text>
              <Text style={{ fontSize: 13, color: colors.slate500, marginTop: 4, textAlign: 'center', paddingHorizontal: 40 }}>{t('no_history_sub')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => onTripPress(item)}
              activeOpacity={0.7}
              style={{ backgroundColor: 'white', borderRadius: radius.xl, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.slate200, ...shadows.card }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 11, color: colors.slate500, fontFamily: 'monospace', fontWeight: '700' }}>{item.trip_code}</Text>
                <View style={{ backgroundColor: item.status === 'completed' ? colors.marketLight : item.status === 'cancelled' ? '#FEE2E2' : colors.amberLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: item.status === 'completed' ? colors.marketDark : item.status === 'cancelled' ? colors.red : colors.amberDark, textTransform: 'uppercase' }}>{t(`trip_status_${item.status}`)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ alignItems: 'center', paddingTop: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.market }} />
                  <View style={{ width: 2, height: 24, backgroundColor: colors.slate200, marginVertical: 3 }} />
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{item.pickup_address}</Text>
                  <View style={{ height: 12 }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{item.dropoff_address}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: colors.ink, letterSpacing: -0.4 }}>P {Number(item.total_fare ?? 0).toFixed(2)}</Text>
                  <Text style={{ fontSize: 11, color: colors.slate500, marginTop: 2 }}>{new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
                </View>
              </View>

              {item.status === 'completed' && (
                <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.slate200, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="repeat" size={16} color={colors.umuv} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.umuv }}>{t('history_rebook')}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}