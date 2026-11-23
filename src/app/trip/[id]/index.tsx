// umuv-rider/src/app/trip/[id]/index.tsx

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Alert, Vibration, ActivityIndicator, Share, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import polyline from '@mapbox/polyline';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../lib/api';
import { getEcho } from '../../../lib/echo';
import { t } from '../../../lib/i18n';
import { useAuth } from '../../../context/AuthContext';
import { colors, spacing, radius, shadows } from '../../../theme';
import { vehicleIcon, vehicleClassLabel } from '../../../lib/vehicleIcon';

const AUTO_CANCEL_MINUTES = 3;

const SEARCH_RADIUS_STEPS: Array<{ afterSeconds: number; radiusKm: number }> = [
  { afterSeconds: 0,  radiusKm: 5 },
  { afterSeconds: 20, radiusKm: 10 },
  { afterSeconds: 45, radiusKm: 15 },
];

function searchRadiusFor(seconds: number): number {
  let radius = SEARCH_RADIUS_STEPS[0].radiusKm;
  for (const step of SEARCH_RADIUS_STEPS) {
    if (seconds >= step.afterSeconds) radius = step.radiusKm;
  }
  return radius;
}

function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatEta(minutes: number | null): string {
  if (minutes === null || minutes < 0) return '';
  if (minutes < 1) return 'Arriving now';
  if (minutes === 1) return '1 min away';
  return `${minutes} min away`;
}

export default function ActiveTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const mapRef = useRef<MapView>(null);

  const [trip, setTrip] = useState<any>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [routeCoords, setRouteCoords] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [connected, setConnected] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [driverEtaMinutes, setDriverEtaMinutes] = useState<number | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const cancelledRedirectRef = useRef(false);
  const hasFitInitially = useRef(false);

  // Load trip + route
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.trackTrip(Number(id));

        setTrip(data.trip);
        setDriverPos(data.driver_position ?? null);

        const fallbackCoords = [
          { latitude: Number(data.trip.pickup_lat), longitude: Number(data.trip.pickup_lng) },
          { latitude: Number(data.trip.dropoff_lat), longitude: Number(data.trip.dropoff_lng) },
        ];

        try {
          const route = await api.previewRoute(
            Number(data.trip.pickup_lat), Number(data.trip.pickup_lng),
            Number(data.trip.dropoff_lat), Number(data.trip.dropoff_lng),
          );
          if (route?.polyline) {
            try {
              const decoded = polyline
                .decode(route.polyline)
                .map(([lat, lng]: [number, number]) => ({ latitude: lat, longitude: lng }));
              setRouteCoords(decoded.length > 1 ? decoded : fallbackCoords);
            } catch {
              setRouteCoords(fallbackCoords);
            }
          } else {
            setRouteCoords(fallbackCoords);
          }
        } catch {
          setRouteCoords(fallbackCoords);
        }
      } catch (e: any) {
        Alert.alert(t('error'), e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // Realtime
  useEffect(() => {
    let channel: any = null;
    let mounted = true;

    const setup = async () => {
      try {
        const echo = await getEcho();
        if (!echo || !mounted) return;

        channel = echo.private(`trip.${id}`);

        channel.listen('.TripStatusChanged', (data: any) => {
          if (!data?.trip) return;
          setTrip((prev: any) => {
            const next = { ...prev, ...data.trip };
            if (!next.driver && prev?.driver) next.driver = prev.driver;
            if (!next.vehicle && prev?.vehicle) next.vehicle = prev.vehicle;
            return next;
          });
        });

        channel.listen('.TripDriverLocationUpdated', (e: any) => {
          if (e?.lat && e?.lng) setDriverPos({ lat: e.lat, lng: e.lng });
        });

        channel.listen('.MessageSent', (data: any) => {
          if (!data?.message) return;
          if (Number(data.message.sender_id) === Number(user?.id)) return;
          setUnreadCount((c) => c + 1);
        });
      } catch (err) {
        console.warn('[trip] echo setup failed:', err);
      }
    };

    setup();

    return () => {
      mounted = false;
      try {
        if (channel) {
          channel.stopListening('.TripStatusChanged');
          channel.stopListening('.TripDriverLocationUpdated');
          channel.stopListening('.MessageSent');
        }
      } catch {}
    };
  }, [id, user?.id]);

  // Refresh unread count on focus
  useFocusEffect(
    useCallback(() => {
      api.getUnreadCount(Number(id))
        .then((res: any) => setUnreadCount(Number(res?.unread ?? 0)))
        .catch(() => {});
    }, [id])
  );

  // Compute driver ETA based on distance from driver to pickup
  useEffect(() => {
    if (!trip || !driverPos) { setDriverEtaMinutes(null); return; }
    if (!['accepted', 'arrived'].includes(trip.status)) { setDriverEtaMinutes(null); return; }

    const R = 6371;
    const dLat = ((Number(trip.pickup_lat) - driverPos.lat) * Math.PI) / 180;
    const dLng = ((Number(trip.pickup_lng) - driverPos.lng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos((driverPos.lat * Math.PI) / 180) *
              Math.cos((Number(trip.pickup_lat) * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
    const distKm = 2 * R * Math.asin(Math.sqrt(a));

    // Assume 30 km/h average → 2 min per km
    const eta = Math.max(1, Math.round(distKm * 2));
    setDriverEtaMinutes(eta);
  }, [driverPos, trip?.status, trip?.pickup_lat, trip?.pickup_lng]);

  // Connection state
  useEffect(() => {
    let pusher: any = null;
    const attach = async () => {
      try {
        const echo = await getEcho();
        pusher = echo?.connector?.pusher;
        if (!pusher?.connection) return;

        const onConnected = () => setConnected(true);
        const onDisconnected = () => setConnected(false);

        pusher.connection.bind('connected', onConnected);
        pusher.connection.bind('disconnected', onDisconnected);
        pusher.connection.bind('unavailable', onDisconnected);
        pusher.connection.bind('failed', onDisconnected);

        setConnected(pusher.connection.state === 'connected');

        pusher.__attachCleanup = () => {
          try {
            pusher.connection.unbind('connected', onConnected);
            pusher.connection.unbind('disconnected', onDisconnected);
            pusher.connection.unbind('unavailable', onDisconnected);
            pusher.connection.unbind('failed', onDisconnected);
          } catch {}
        };
      } catch {}
    };
    attach();
    return () => { try { if (pusher?.__attachCleanup) { pusher.__attachCleanup(); delete pusher.__attachCleanup; } } catch {} };
  }, []);

  // Search timer
  useEffect(() => {
    if (trip?.status !== 'pending') { setSearchSeconds(0); return; }
    const createdAt = trip?.created_at ? new Date(trip.created_at).getTime() : Date.now();
    const initialElapsed = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
    setSearchSeconds(initialElapsed);
    const iv = setInterval(() => setSearchSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [trip?.status, trip?.created_at]);

  // Auto-cancel redirect with retry dialog
  useEffect(() => {
    if (trip?.status !== 'pending') return;
    const limit = AUTO_CANCEL_MINUTES * 60;
    if (searchSeconds >= limit && !cancelledRedirectRef.current) {
      cancelledRedirectRef.current = true;
      // If trip was auto-cancelled, the backend will set status=cancelled shortly.
      // This is a fallback — the real UI shows when status becomes cancelled.
    }
  }, [searchSeconds, trip?.status]);

  // Vibration + haptics on arrival
  useEffect(() => {
    if (!trip) return;
    const prev = prevStatusRef.current;
    if (prev !== null && prev !== trip.status) {
      if (trip.status === 'accepted') {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
      if (trip.status === 'arrived') {
        try { Vibration.vibrate([0, 300, 200, 300]); } catch {}
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
    }
    prevStatusRef.current = trip.status;
  }, [trip?.status]);

  // Fit map only ONCE, not on every location update
  useEffect(() => {
    if (!mapRef.current || !trip) return;
    if (hasFitInitially.current && trip.status !== 'accepted') return;

    const pts: Array<{ latitude: number; longitude: number }> = [
      { latitude: Number(trip.pickup_lat), longitude: Number(trip.pickup_lng) },
      { latitude: Number(trip.dropoff_lat), longitude: Number(trip.dropoff_lng) },
    ];
    if (driverPos) pts.push({ latitude: driverPos.lat, longitude: driverPos.lng });

    setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates(pts, {
          edgePadding: { top: insets.top + 60, right: 60, bottom: insets.bottom + 340, left: 60 },
          animated: true,
        });
        hasFitInitially.current = true;
      } catch {}
    }, 300);
  }, [trip?.status]);

  const shareTrip = async () => {
    if (!trip) return;
    try {
      const url = `https://umuv.co.bw/track/${trip.trip_code}`;
      await Share.share({
        message: `I'm on an uMuv trip. Track me live: ${url}`,
        url,
        title: 'Share trip',
      });
    } catch (e: any) {
      console.warn('Share failed', e);
    }
  };

  const cancel = () => {
    const isAfterAccept = ['accepted', 'arrived'].includes(trip?.status);
    Alert.alert(
      t('cancel_trip'),
      isAfterAccept ? t('cancel_fee_warning') : t('cancel_free_warning'),
      [
        { text: t('keep_trip'), style: 'cancel' },
        {
          text: t('cancel_trip'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.cancelTrip(Number(id), 'Changed mind');
              router.replace('/(tabs)/home');
            } catch (e: any) {
              Alert.alert(t('error'), e?.message ?? String(e));
            }
          },
        },
      ],
    );
  };

  const retryTrip = () => {
    if (!trip) return;
    router.replace({
      pathname: '/(tabs)/home',
      params: {
        rebookLat: String(trip.pickup_lat),
        rebookLng: String(trip.pickup_lng),
        rebookAddress: trip.pickup_address,
        rebookDestLat: String(trip.dropoff_lat),
        rebookDestLng: String(trip.dropoff_lng),
        rebookDestAddress: trip.dropoff_address,
        rebookService: trip.service_type,
        rebookVehicle: trip.vehicle_class ?? 'sedan',
        rebookAt: String(Date.now()),
      },
    });
  };

  if (loading || !trip) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.slate50, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.umuv} size="large" />
      </SafeAreaView>
    );
  }

  const statusInfo = (() => {
    switch (trip.status) {
      case 'pending':     return { label: t('trip_status_pending'),     dot: colors.amberDark };
      case 'accepted':    return { label: t('trip_status_accepted'),    dot: colors.umuvDark };
      case 'arrived':     return { label: t('trip_status_arrived'),     dot: colors.marketDark };
      case 'in_progress': return { label: t('trip_status_in_progress'), dot: colors.umuvDark };
      case 'completed':   return { label: t('trip_status_completed'),   dot: colors.marketDark };
      case 'cancelled':   return { label: t('trip_status_cancelled'),   dot: colors.red };
      default:            return { label: trip.status,                   dot: colors.slate500 };
    }
  })();

  const driverName = trip.driver?.name ?? null;
  const driverInitial = driverName?.charAt(0).toUpperCase() ?? 'D';
  const isSearching = trip.status === 'pending';
  const isArrived = trip.status === 'arrived';
  const searchRadiusKm = isSearching ? searchRadiusFor(searchSeconds) : 0;
  const remainingSeconds = Math.max(0, AUTO_CANCEL_MINUTES * 60 - searchSeconds);

  const paymentLabel = {
    cash: 'Cash',
    orange_money: 'Orange Money',
    myzaka: 'MyZaka',
    smega: 'Smega',
    card: 'Card',
    wallet: 'Wallet',
  }[trip.payment_method] ?? trip.payment_method;

  return (
    <View style={{ flex: 1, backgroundColor: colors.slate50 }}>
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: Number(trip.pickup_lat),
            longitude: Number(trip.pickup_lng),
            latitudeDelta: 0.03, longitudeDelta: 0.03,
          }}
          showsUserLocation
        >
          {routeCoords.length > 1 && <Polyline coordinates={routeCoords} strokeColor={colors.umuv} strokeWidth={5} />}

          {isSearching && (
            <Circle
              center={{ latitude: Number(trip.pickup_lat), longitude: Number(trip.pickup_lng) }}
              radius={searchRadiusKm * 1000}
              strokeColor="rgba(11, 95, 255, 0.6)"
              fillColor="rgba(11, 95, 255, 0.12)"
              strokeWidth={2}
            />
          )}

          <Marker coordinate={{ latitude: Number(trip.pickup_lat), longitude: Number(trip.pickup_lng) }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.market, borderWidth: 3, borderColor: 'white' }} />
          </Marker>

          <Marker coordinate={{ latitude: Number(trip.dropoff_lat), longitude: Number(trip.dropoff_lng) }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.red, borderWidth: 3, borderColor: 'white' }} />
          </Marker>

          {driverPos && (
            <Marker coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }} tracksViewChanges={false}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.umuv, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }}>
                <Ionicons name={vehicleIcon(trip.vehicle?.vehicle_class) as any} size={20} color="white" />
              </View>
            </Marker>
          )}
        </MapView>

        <TouchableOpacity onPress={() => router.replace('/(tabs)/home')} style={{ position: 'absolute', top: insets.top + 12, left: spacing.lg, width: 44, height: 44, borderRadius: 22, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', ...shadows.card }}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>

        <TouchableOpacity onPress={shareTrip} style={{ position: 'absolute', top: insets.top + 12, right: spacing.lg, width: 44, height: 44, borderRadius: 22, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', ...shadows.card }}>
          <Ionicons name="share-outline" size={22} color={colors.ink} />
        </TouchableOpacity>

        <View style={{ position: 'absolute', top: insets.top + 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, ...shadows.card }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusInfo.dot }} />
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.ink, letterSpacing: 0.2 }}>{statusInfo.label}</Text>
        </View>

        {isSearching && (
          <View style={{ position: 'absolute', top: insets.top + 12 + 56, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'white', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, ...shadows.card }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.umuv, backgroundColor: 'rgba(11,95,255,0.15)' }} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink }}>
              {t('searching_within', { km: String(searchRadiusKm) })}
            </Text>
          </View>
        )}
      </View>

      <View style={{
        backgroundColor: 'white',
        borderTopLeftRadius: 32, borderTopRightRadius: 32,
        paddingHorizontal: spacing.xl, paddingTop: spacing.lg,
        paddingBottom: insets.bottom + spacing.lg,
        ...shadows.card, shadowOpacity: 0.15, shadowRadius: 20,
        borderTopWidth: isArrived ? 4 : 0,
        borderTopColor: isArrived ? colors.market : 'transparent',
      }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.slate200, marginBottom: 16 }} />

        {!connected && (
          <View style={{ backgroundColor: colors.amberLight, padding: 10, borderRadius: radius.lg, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={colors.amberDark} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.amberDark }}>{t('reconnecting')}</Text>
          </View>
        )}

        {/* Arrived banner */}
        {isArrived && (
          <View style={{ backgroundColor: colors.marketLight, padding: 14, borderRadius: radius.lg, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.market }}>
            <Ionicons name="checkmark-circle" size={22} color={colors.marketDark} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.marketDark }}>Driver has arrived</Text>
              <Text style={{ fontSize: 12, color: colors.marketDark, marginTop: 2, opacity: 0.85 }}>They're waiting at your pickup point</Text>
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ backgroundColor: colors.amberLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: colors.amberDark, letterSpacing: 0.4 }}>{String(trip.service_type ?? 'ride').toUpperCase()}</Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.slate500, fontFamily: 'monospace', fontWeight: '700' }}>{trip.trip_code}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink, letterSpacing: -0.6 }}>P {Number(trip.total_fare ?? 0).toFixed(2)}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.slate500, marginTop: 2 }}>· {paymentLabel}</Text>
          </View>
        </View>

        {isSearching && (
          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <ActivityIndicator size="large" color={colors.amber} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 14 }}>
              {searchSeconds > 30 ? t('still_searching') : t('finding_driver')}
            </Text>
            <Text style={{ fontSize: 13, color: colors.slate500, marginTop: 4, textAlign: 'center' }}>
              {searchSeconds > 30 ? t('widening_search', { seconds: searchSeconds }) : t('usually_under_minute')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: colors.amberLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100 }}>
              <Ionicons name="time-outline" size={14} color={colors.amberDark} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.amberDark }}>
                {t('auto_cancel_in', { time: formatMmSs(remainingSeconds) })}
              </Text>
            </View>
            {searchSeconds > 45 && (
              <TouchableOpacity onPress={cancel} style={{ marginTop: 16 }}>
                <Text style={{ color: colors.red, fontWeight: '800', fontSize: 14 }}>{t('cancel_search')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Driver + Vehicle card */}
        {trip.driver && (
          <View style={{ backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200, borderRadius: radius.lg, padding: 14, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: trip.vehicle ? 12 : 0 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.umuv, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: 'white' }}>{driverInitial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{driverName}</Text>
                <Text style={{ fontSize: 12, color: colors.slate500, marginTop: 2, fontWeight: '600' }}>
                  {driverEtaMinutes !== null ? formatEta(driverEtaMinutes) : t('your_driver')}
                </Text>
              </View>
              {['accepted', 'arrived', 'in_progress'].includes(trip.status) && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => router.push(`/trip/${id}/chat`)}
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.umuvLight, alignItems: 'center', justifyContent: 'center', position: 'relative' }}
                  >
                    <Ionicons name="chatbubble" size={18} color={colors.umuv} />
                    {unreadCount > 0 && (
                      <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.red, borderWidth: 2, borderColor: 'white', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                        <Text style={{ color: 'white', fontSize: 10, fontWeight: '900' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push(`/trip/${id}/call`)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.marketLight, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="call" size={18} color={colors.marketDark} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {trip.vehicle && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', borderWidth: 1, borderColor: colors.slate200, borderRadius: radius.md, padding: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.amberLight, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={vehicleIcon(trip.vehicle.vehicle_class) as any} size={22} color={colors.amberDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: colors.slate500, letterSpacing: 0.4 }}>{t('your_vehicle').toUpperCase()}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 2 }} numberOfLines={1}>
                    {[trip.vehicle.color, trip.vehicle.make, trip.vehicle.model].filter(Boolean).join(' ')}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.slate600, marginTop: 2, letterSpacing: 0.5 }}>
                    {vehicleClassLabel(trip.vehicle.vehicle_class)}
                    {trip.vehicle.plate_number ? ` · ${trip.vehicle.plate_number.toUpperCase()}` : ''}
                  </Text>
                </View>
                {trip.vehicle.plate_number && (
                  <View style={{ backgroundColor: colors.ink, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: 'white', letterSpacing: 1.5, fontFamily: 'monospace' }}>
                      {trip.vehicle.plate_number.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          <View style={{ alignItems: 'center', paddingTop: 4, marginRight: 12 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.market }} />
            <View style={{ width: 2, height: 26, backgroundColor: colors.slate200, marginVertical: 3 }} />
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.slate500, letterSpacing: 0.4 }}>{t('pickup').toUpperCase()}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 10 }} numberOfLines={1}>{trip.pickup_address}</Text>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.slate500, letterSpacing: 0.4 }}>{t('dropoff').toUpperCase()}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{trip.dropoff_address}</Text>
          </View>
        </View>

        {trip.status === 'completed' && (
          <TouchableOpacity
            onPress={() => router.replace({ pathname: `/trip/${id}/rate`, params: { driverName: trip.driver?.name ?? '', driverId: String(trip.driver?.id ?? '') } })}
            style={{ backgroundColor: colors.amber, paddingVertical: 16, borderRadius: radius.lg, alignItems: 'center' }}
          >
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '900' }}>{t('rate_trip')}</Text>
          </TouchableOpacity>
        )}

        {trip.status === 'cancelled' && (
          <View>
            <View style={{ backgroundColor: '#FEE2E2', padding: 14, borderRadius: radius.lg, marginBottom: 12, borderWidth: 1, borderColor: '#FCA5A5' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#991B1B' }}>Trip cancelled</Text>
              <Text style={{ fontSize: 12, color: '#991B1B', marginTop: 2 }}>
                {trip.cancellation_reason || 'No driver found'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={retryTrip}
              style={{ backgroundColor: colors.umuv, paddingVertical: 16, borderRadius: radius.lg, alignItems: 'center', marginBottom: 8 }}
            >
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '900' }}>Retry with same route</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)/home')}
              style={{ backgroundColor: colors.ink, paddingVertical: 16, borderRadius: radius.lg, alignItems: 'center' }}
            >
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '900' }}>{t('back_home')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {['pending', 'accepted'].includes(trip.status) && (
          <TouchableOpacity onPress={cancel} style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: colors.red, fontSize: 14, fontWeight: '700' }}>{t('cancel_trip')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}