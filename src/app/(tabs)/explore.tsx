// umuv-rider/src/app/(tabs)/explore.tsx

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { t } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, shadows } from '../../theme';
import { RoutePreviewMap } from '../../components/RoutePreviewMap';

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    pickupLat?: string; pickupLng?: string;
    destLat?: string; destLng?: string;
    pickupAddress?: string; destAddress?: string;
  }>();

  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [polyline, setPolyline] = useState<string | null>(null);
  const [routeMeta, setRouteMeta] = useState<{ distance_km: number; duration_minutes: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);

  // Seed from params if passed (e.g. from home screen), otherwise use user location
  useEffect(() => {
    (async () => {
      const pLat = Number(params.pickupLat);
      const pLng = Number(params.pickupLng);
      const dLat = Number(params.destLat);
      const dLng = Number(params.destLng);

      if (Number.isFinite(pLat) && Number.isFinite(pLng)) {
        setPickup({ lat: pLat, lng: pLng });
      } else {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setPickup({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
        } catch {}
      }

      if (Number.isFinite(dLat) && Number.isFinite(dLng)) {
        setDropoff({ lat: dLat, lng: dLng });
      }

      setLoading(false);
    })();
  }, []);

  // Fetch the route whenever both endpoints exist and change
  useEffect(() => {
    if (!pickup || !dropoff) {
      setPolyline(null);
      setRouteMeta(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setRouteLoading(true);
      try {
        const route = await api.previewRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
        if (!cancelled) {
          setPolyline(route.polyline ?? null);
          setRouteMeta({
            distance_km: Number(route.distance_km) || 0,
            duration_minutes: Number(route.duration_minutes) || 0,
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          setPolyline(null);
          setRouteMeta(null);
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]);

  const clearDestination = () => {
    setDropoff(null);
    setPolyline(null);
    setRouteMeta(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.slate50 }}>
      {/* HEADER */}
      <View style={{ backgroundColor: colors.ink, paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Text style={{ color: 'white', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>{t('explore_title')}</Text>
        <Text style={{ color: colors.slate400, fontSize: 13, marginTop: 2 }}>{t('explore_sub')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator color={colors.umuv} size="large" />
          </View>
        ) : (
          <>
            {/* MAP CARD */}
            <View style={{ backgroundColor: 'white', borderRadius: radius.xxl, padding: spacing.md, ...shadows.card }}>
              <RoutePreviewMap
                pickup={pickup}
                dropoff={dropoff}
                polyline={polyline}
                height={280}
                edgePadding={{ top: 60, right: 60, bottom: 60, left: 60 }}
              />

              {/* ROUTE META */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm, paddingTop: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: colors.slate500, letterSpacing: 0.6 }}>{t('pickup').toUpperCase()}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 2 }} numberOfLines={1}>
                    {pickup ? `${pickup.lat.toFixed(5)}, ${pickup.lng.toFixed(5)}` : t('getting_address')}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: colors.slate500, letterSpacing: 0.6, marginTop: 8 }}>{t('destination').toUpperCase()}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 2 }} numberOfLines={1}>
                    {dropoff ? `${dropoff.lat.toFixed(5)}, ${dropoff.lng.toFixed(5)}` : t('where_to')}
                  </Text>
                </View>

                {routeLoading && (
                  <ActivityIndicator size="small" color={colors.umuv} />
                )}
                {!routeLoading && routeMeta && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>{routeMeta.distance_km.toFixed(1)} km</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.slate500, marginTop: 2 }}>~{routeMeta.duration_minutes} min</Text>
                  </View>
                )}
              </View>
            </View>

            {/* ACTIONS */}
            <View style={{ marginTop: spacing.lg, gap: 10 }}>
              <TouchableOpacity
                onPress={() => router.push('/pick-location?field=destination')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.slate200, ...shadows.card }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.umuvLight, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="navigate" size={20} color={colors.umuv} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{t('explore_set_dest')}</Text>
                  <Text style={{ fontSize: 12, color: colors.slate500, marginTop: 1 }}>{t('explore_set_dest_sub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.slate400} />
              </TouchableOpacity>

              {dropoff && (
                <TouchableOpacity
                  onPress={clearDestination}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.slate200, ...shadows.card }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="close-circle" size={20} color="#991B1B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{t('explore_clear')}</Text>
                    <Text style={{ fontSize: 12, color: colors.slate500, marginTop: 1 }}>{t('explore_clear_sub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.slate400} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => router.push('/(tabs)/home')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.slate200, ...shadows.card }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.amberLight, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="car-sport" size={20} color={colors.amberDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{t('explore_book')}</Text>
                  <Text style={{ fontSize: 12, color: colors.slate500, marginTop: 1 }}>{t('explore_book_sub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.slate400} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}