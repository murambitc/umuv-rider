// umuv-rider/src/app/(tabs)/home.tsx

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Alert, ScrollView, Image, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { getEcho } from '../../lib/echo';
import { t } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, shadows } from '../../theme';
import { Button } from '../../components/Button';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { cleanAddress } from '../../lib/format';
import { RoutePreviewMap } from '../../components/RoutePreviewMap';

const SERVICES = [
  { id: 'ride', labelKey: 'trip_service_ride', icon: 'car-sport' },
  { id: 'parcel', labelKey: 'trip_service_parcel', icon: 'cube' },
  { id: 'freight', labelKey: 'trip_service_freight', icon: 'bicycle' },
] as const;

const VEHICLE_CLASSES = [
  { id: 'sedan', labelKey: 'vehicle_sedan', icon: 'car-sport', descriptionKey: 'vehicle_sedan_desc', services: ['ride', 'parcel'] },
  { id: 'kombi', labelKey: 'vehicle_kombi', icon: 'bus', descriptionKey: 'vehicle_kombi_desc', services: ['ride', 'parcel'] },
  { id: 'bakkie', labelKey: 'vehicle_bakkie', icon: 'car', descriptionKey: 'vehicle_bakkie_desc', services: ['ride', 'parcel', 'freight'] },
  { id: 'luxury', labelKey: 'vehicle_luxury', icon: 'diamond', descriptionKey: 'vehicle_luxury_desc', services: ['ride', 'freight'] },
] as const;

const PAYMENT_METHODS = [
  { id: 'cash', labelKey: 'cash', icon: 'cash-outline' },
  { id: 'orange_money', labelKey: 'orange_money', icon: 'phone-portrait-outline' },
  { id: 'card', labelKey: 'card', icon: 'card-outline' },
  { id: 'wallet', labelKey: 'wallet', icon: 'wallet-outline' },
] as const;

type ServiceId = typeof SERVICES[number]['id'];
type VehicleClassId = typeof VEHICLE_CLASSES[number]['id'];
type PaymentMethodId = typeof PAYMENT_METHODS[number]['id'];

const SAVED_PLACES_KEY = 'umuv_saved_places';
const RECENT_DESTINATIONS_KEY = 'umuv_recent_destinations';
const LAST_PAYMENT_KEY = 'umuv_last_payment';

interface SavedPlace {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

interface RecentDestination extends SavedPlace {}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default function HomeScreen() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const [pickup, setPickup] = useState('Locating...');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destination, setDestination] = useState('');
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [serviceType, setServiceType] = useState<ServiceId>('ride');
  const [vehicleClass, setVehicleClass] = useState<VehicleClassId>('sedan');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>('cash');
  const [stops, setStops] = useState<string[]>([]);

  const [fareEstimate, setFareEstimate] = useState<{
    min: number; max: number; total: number; distance: number; duration: number;
    surge: number; vehicleClass: VehicleClassId;
    base_fare: number; distance_fare: number; time_fare: number;
  } | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [fareError, setFareError] = useState<string | null>(null);

  const [routePolyline, setRoutePolyline] = useState<string | null>(null);

  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [recentDestinations, setRecentDestinations] = useState<RecentDestination[]>([]);
  const [showSavePrompt, setShowSavePrompt] = useState(false);

  const [messageToast, setMessageToast] = useState<{ sender: string; body: string; tripId: number } | null>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  const availableVehicles = VEHICLE_CLASSES.filter((v) =>
    (v.services as readonly string[]).includes(serviceType)
  );

  useEffect(() => {
    if (!availableVehicles.some((v) => v.id === vehicleClass)) {
      setVehicleClass(availableVehicles[0]?.id ?? 'sedan');
    }
  }, [serviceType]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [user, authLoading]);

  // Load saved places, recent destinations, last payment method
  useEffect(() => {
    (async () => {
      try {
        const savedRaw = await SecureStore.getItemAsync(SAVED_PLACES_KEY);
        if (savedRaw) setSavedPlaces(JSON.parse(savedRaw));
      } catch {}

      try {
        const recentRaw = await SecureStore.getItemAsync(RECENT_DESTINATIONS_KEY);
        if (recentRaw) setRecentDestinations(JSON.parse(recentRaw));
      } catch {}

      try {
        const lastPayment = await SecureStore.getItemAsync(LAST_PAYMENT_KEY);
        if (lastPayment) setPaymentMethod(lastPayment as PaymentMethodId);
      } catch {}
    })();
  }, []);

  // Initial pickup
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setPickup(t('pickup_current')); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setPickupCoords(coords);
        try {
          const geo = await api.reverseGeocode(coords.lat, coords.lng);
          setPickup(geo.name?.trim() || cleanAddress(geo.formatted_address) || t('pickup_current'));
        } catch { setPickup(t('pickup_current')); }
      } catch { setPickup(t('pickup_current')); }
    })();
  }, [user]);

  // Handle params from pick-location
  useEffect(() => {
    if (!params.pickedField || !params.pickedAddress) return;

    const lat = Number(params.pickedLat);
    const lng = Number(params.pickedLng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
    const address = String(params.pickedAddress ?? '').trim();

    (async () => {
      let coords: { lat: number; lng: number } | null = hasCoords ? { lat, lng } : null;

      if (!coords && address) {
        try {
          const g = await api.geocode(address);
          if (g?.lat && g?.lng) coords = { lat: g.lat, lng: g.lng };
        } catch {}
      }

      if (params.pickedField === 'pickup') {
        setPickup(address);
        if (coords) setPickupCoords(coords);
      } else if (params.pickedField === 'destination') {
        setDestination(address);
        if (coords) setDestCoords(coords);
      } else if (String(params.pickedField).startsWith('stop:')) {
        const idx = Number(String(params.pickedField).split(':')[1]);
        const updated = [...stops];
        updated[idx] = address;
        setStops(updated);
      }

      router.setParams({
        pickedField: undefined, pickedAddress: undefined, pickedLat: undefined, pickedLng: undefined,
      });
    })();
  }, [params.pickedField]);

  // Rebook from history
  useEffect(() => {
    if (!params.rebookLat || !params.rebookDestLat) return;
    const pLat = Number(params.rebookLat);
    const pLng = Number(params.rebookLng);
    const dLat = Number(params.rebookDestLat);
    const dLng = Number(params.rebookDestLng);

    if (Number.isFinite(pLat) && Number.isFinite(pLng)) setPickupCoords({ lat: pLat, lng: pLng });
    if (params.rebookAddress) setPickup(String(params.rebookAddress));
    if (Number.isFinite(dLat) && Number.isFinite(dLng)) setDestCoords({ lat: dLat, lng: dLng });
    if (params.rebookDestAddress) setDestination(String(params.rebookDestAddress));
    if (params.rebookService) {
      const s = String(params.rebookService);
      if (['ride', 'parcel', 'freight'].includes(s)) setServiceType(s as ServiceId);
    }
    if (params.rebookVehicle) {
      const v = String(params.rebookVehicle);
      if (['sedan', 'kombi', 'bakkie', 'luxury'].includes(v)) setVehicleClass(v as VehicleClassId);
    }
    router.setParams({
      rebookLat: undefined, rebookLng: undefined, rebookAddress: undefined,
      rebookDestLat: undefined, rebookDestLng: undefined, rebookDestAddress: undefined,
      rebookService: undefined, rebookVehicle: undefined, rebookAt: undefined,
    });
  }, [params.rebookAt]);

  // Fare estimation
  useEffect(() => {
    if (!pickupCoords || !destCoords) {
      setFareEstimate(null);
      setFareError(null);
      setRoutePolyline(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsEstimating(true);
      setFareError(null);

      let distance = haversineKm(pickupCoords, destCoords);
      let duration = Math.round(distance * 2);
      let polyline: string | null = null;

      try {
        const route = await api.previewRoute(pickupCoords.lat, pickupCoords.lng, destCoords.lat, destCoords.lng);
        if (Number(route.distance_km) > 0) distance = Number(route.distance_km);
        if (Number(route.duration_minutes) > 0) duration = Number(route.duration_minutes);
        if (route.polyline) polyline = route.polyline;
      } catch {}

      distance = Math.max(distance, 0.1);
      duration = Math.max(duration, 1);
      setRoutePolyline(polyline);

      try {
        const fare = await api.previewFare({
          pickup_lat: pickupCoords.lat,
          pickup_lng: pickupCoords.lng,
          dropoff_lat: destCoords.lat,
          dropoff_lng: destCoords.lng,
          distance_km: distance,
          duration_minutes: duration,
          service_type: serviceType,
          vehicle_class: vehicleClass,
        });

        const total = Number((fare as any)?.total_fare);
        if (!Number.isFinite(total) || total <= 0) throw new Error('Unexpected fare response');

        const surge = Number((fare as any)?.surge_multiplier) || 1;
        const base_fare = Number((fare as any)?.base_fare) || 0;
        const distance_fare = Number((fare as any)?.distance_fare) || 0;
        const time_fare = Number((fare as any)?.time_fare) || 0;

        setFareEstimate({
          min: Math.round(total * 0.95),
          max: Math.round(total * 1.05),
          total: Math.round(total),
          distance: Math.round(distance * 10) / 10,
          duration,
          surge,
          vehicleClass,
          base_fare,
          distance_fare,
          time_fare,
        });
      } catch (e: any) {
        setFareEstimate(null);
        setFareError(e?.message ?? String(e));
      } finally {
        setIsEstimating(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [pickupCoords, destCoords, serviceType, vehicleClass]);

  // User channel subscription for chat toasts
  useEffect(() => {
    if (!user?.id) return;
    let channel: any = null;
    let mounted = true;

    const setup = async () => {
      try {
        const echo = await getEcho();
        if (!echo || !mounted) return;

        channel = echo.private(`user.${user.id}`)
          .subscribed(() => console.log('[RIDER ECHO] ✓ subscribed', user.id))
          .error((err: any) => console.warn('[RIDER ECHO] ✗', err))
          .listen('.NewMessageReceived', (data: any) => {
            if (!data?.message) return;
            setMessageToast({
              sender: data.sender?.name ?? 'Driver',
              body: data.message.body,
              tripId: Number(data.message.trip_id),
            });
            if (toastTimer.current) clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setMessageToast(null), 5000);
          });
      } catch (e) {
        console.warn('[RIDER ECHO] setup failed', e);
      }
    };
    setup();

    return () => {
      mounted = false;
      try { if (channel) channel.stopListening('.NewMessageReceived'); } catch {}
    };
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!pickupCoords) setPickupCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {}
    })();
  }, [user, pickupCoords]));

  const saveDestinationIfNew = async (address: string, lat: number, lng: number) => {
    try {
      const raw = await SecureStore.getItemAsync(RECENT_DESTINATIONS_KEY);
      const recent: RecentDestination[] = raw ? JSON.parse(raw) : [];
      const filtered = recent.filter(r => r.address !== address);
      const updated = [{ label: address, address, lat, lng }, ...filtered].slice(0, 5);
      await SecureStore.setItemAsync(RECENT_DESTINATIONS_KEY, JSON.stringify(updated));
      setRecentDestinations(updated);
    } catch {}
  };

  const persistPaymentMethod = async (method: PaymentMethodId) => {
    setPaymentMethod(method);
    try { await SecureStore.setItemAsync(LAST_PAYMENT_KEY, method); } catch {}
  };

  const fillSavedPlace = (place: SavedPlace) => {
    setDestination(place.address);
    setDestCoords({ lat: place.lat, lng: place.lng });
  };

  const openPicker = (field: string) => {
    const stopsJson = JSON.stringify(
      stops.filter(Boolean).map((addr) => ({ address: addr, lat: null, lng: null })),
    );
    router.push({
      pathname: '/pick-location',
      params: {
        field,
        pickupAddress: pickup, pickupLat: pickupCoords?.lat, pickupLng: pickupCoords?.lng,
        destAddress: destination, destLat: destCoords?.lat, destLng: destCoords?.lng,
        stops: stopsJson,
      },
    });
  };

  const addStop = () => {
    if (stops.length >= 3) { Alert.alert(t('stop_limit'), t('stop_limit_msg')); return; }
    openPicker(`stop:${stops.length}`);
  };

  const removeStop = (i: number) => setStops(stops.filter((_, idx) => idx !== i));

  const handleBook = async () => {
    if (!pickup.trim() || !destination.trim() || !fareEstimate) {
      Alert.alert(t('missing_info'), t('missing_info_msg'));
      return;
    }

    setIsBooking(true);
    try {
      let finalPickup = pickupCoords;
      if (!finalPickup) {
        try { const res = await api.geocode(pickup); finalPickup = { lat: res.lat, lng: res.lng }; }
        catch (e: any) { throw new Error(`Could not resolve pickup location: ${e?.message ?? e}`); }
      }
      let finalDest = destCoords;
      if (!finalDest) {
        try { const res = await api.geocode(destination); finalDest = { lat: res.lat, lng: res.lng }; }
        catch (e: any) { throw new Error(`Could not resolve destination: ${e?.message ?? e}`); }
      }

      if (typeof api.createTrip !== 'function') throw new Error('api.createTrip missing. Reload app.');

      const trip = await api.createTrip({
        pickup_address: pickup,
        pickup_lat: finalPickup.lat,
        pickup_lng: finalPickup.lng,
        dropoff_address: destination,
        dropoff_lat: finalDest.lat,
        dropoff_lng: finalDest.lng,
        distance_km: fareEstimate.distance,
        duration_minutes: fareEstimate.duration,
        service_type: serviceType,
        vehicle_class: vehicleClass,
        stops: stops.filter(Boolean),
        payment_method: paymentMethod,
      });

      if (!trip || !trip.id) throw new Error('Server did not return a trip id.');

      saveDestinationIfNew(destination, finalDest.lat, finalDest.lng);

      router.replace(`/trip/${trip.id}`);
    } catch (e: any) {
      Alert.alert(t('booking_failed') ?? 'Booking failed', e?.message ?? String(e));
    } finally {
      setIsBooking(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(t('sign_out_confirm_title'), t('sign_out_confirm_msg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('sign_out'), style: 'destructive', onPress: async () => { await signOut(); router.replace('/'); } },
    ]);
  };

  const firstName = user?.name?.split(' ')[0] ?? 'Rider';

  return (
    <View style={{ flex: 1, backgroundColor: colors.slate50 }}>
      {messageToast && (
        <TouchableOpacity
          onPress={() => {
            const tripId = messageToast.tripId;
            setMessageToast(null);
            if (toastTimer.current) clearTimeout(toastTimer.current);
            router.push(`/trip/${tripId}/chat`);
          }}
          style={{
            position: 'absolute', top: insets.top + spacing.sm,
            left: spacing.lg, right: spacing.lg,
            backgroundColor: 'white', borderRadius: radius.lg, padding: 14,
            flexDirection: 'row', alignItems: 'center', gap: 12,
            ...shadows.card, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12,
            zIndex: 100,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.umuv, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chatbubble" size={18} color="white" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.ink }} numberOfLines={1}>{messageToast.sender}</Text>
            <Text style={{ fontSize: 12, color: colors.slate600, marginTop: 1 }} numberOfLines={1}>{messageToast.body}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.slate400} />
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* HERO */}
          <View style={{ backgroundColor: colors.amber, overflow: 'hidden', paddingHorizontal: spacing.xl, paddingTop: insets.top + spacing.sm, paddingBottom: 60 }}>
            <Image source={require('../../../assets/images/login-bg.png')} style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.35 }} resizeMode="cover" />

            <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
              <LanguageSwitcher />
              <TouchableOpacity onPress={handleSignOut} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="log-out-outline" size={22} color="white" />
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 12 }}>
              <View style={{ backgroundColor: colors.ink, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 100, alignSelf: 'flex-start', marginBottom: 10 }}>
                <Text style={{ color: colors.amber, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }}>{t('rider_app_badge')}</Text>
              </View>
              <Text style={{ color: 'white', fontSize: 26, fontWeight: '900', letterSpacing: -0.6 }}>{t('welcome_back')}, {firstName}.</Text>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '500', marginTop: 2 }}>{t('where_to')}</Text>
            </View>
          </View>

          {/* BOOKING CARD */}
          <View style={{ backgroundColor: 'white', marginTop: -40, marginHorizontal: spacing.lg, borderRadius: radius.xxl, padding: spacing.xl, ...shadows.card, shadowOpacity: 0.12, shadowRadius: 20, elevation: 8 }}>
            {/* SERVICE PICKER */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.slate500, letterSpacing: 0.6, marginBottom: 8 }}>{t('choose_service').toUpperCase()}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.lg }}>
              {SERVICES.map((s) => {
                const active = serviceType === s.id;
                return (
                  <TouchableOpacity key={s.id} onPress={() => setServiceType(s.id)} style={{ flex: 1, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center', backgroundColor: active ? colors.amber : colors.slate50, borderWidth: 1, borderColor: active ? colors.amber : colors.slate200 }}>
                    <Ionicons name={s.icon as any} size={20} color={active ? colors.ink : colors.slate600} />
                    <Text style={{ fontSize: 11, fontWeight: '800', marginTop: 6, color: active ? colors.ink : colors.slate600, textAlign: 'center' }} numberOfLines={2}>{t(s.labelKey)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* VEHICLE CLASS PICKER */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.slate500, letterSpacing: 0.6, marginBottom: 8 }}>{t('choose_vehicle').toUpperCase()}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.lg }}>
              {availableVehicles.map((v) => {
                const active = vehicleClass === v.id;
                return (
                  <TouchableOpacity key={v.id} onPress={() => setVehicleClass(v.id)} style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 6, borderRadius: radius.lg, alignItems: 'center', backgroundColor: active ? colors.umuvLight : colors.slate50, borderWidth: 1, borderColor: active ? colors.umuv : colors.slate200 }}>
                    <Ionicons name={v.icon as any} size={20} color={active ? colors.umuv : colors.slate600} />
                    <Text style={{ fontSize: 11, fontWeight: '800', marginTop: 6, color: active ? colors.umuvDark : colors.slate600, textAlign: 'center' }} numberOfLines={1}>{t(v.labelKey)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* PICKUP */}
            <TouchableOpacity onPress={() => openPicker('pickup')} style={routeRowStyle}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.market, marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.slate500, letterSpacing: 0.6 }}>{t('pickup').toUpperCase()}</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 }} numberOfLines={2}>{pickup}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.slate400} />
            </TouchableOpacity>

            {/* STOPS */}
            {stops.map((stop, i) => (
              <View key={i} style={[routeRowStyle, { backgroundColor: colors.amberLight }]}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.amber, marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: colors.amberDark, letterSpacing: 0.6 }}>{t('stop')} {i + 1}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink, marginTop: 2 }} numberOfLines={1}>{stop || t('choose_stop')}</Text>
                </View>
                <TouchableOpacity onPress={() => removeStop(i)} hitSlop={10}>
                  <Ionicons name="close-circle" size={20} color={colors.slate400} />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity onPress={addStop} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, marginLeft: 4 }}>
              <Ionicons name="add-circle-outline" size={16} color={colors.amberDark} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.amberDark }}>{t('add_stop')}</Text>
            </TouchableOpacity>

            {/* DESTINATION */}
            <TouchableOpacity onPress={() => openPicker('destination')} style={[routeRowStyle, { marginTop: 0 }]}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.red, marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.slate500, letterSpacing: 0.6 }}>{t('destination').toUpperCase()}</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 }} numberOfLines={2}>{destination || t('where_to')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.slate400} />
            </TouchableOpacity>

            {/* SAVED PLACES + RECENT (only when destination is empty) */}
            {!destination && (savedPlaces.length > 0 || recentDestinations.length > 0) && (
              <View style={{ marginBottom: 12 }}>
                {savedPlaces.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {savedPlaces.map((place, i) => (
                      <TouchableOpacity
                        key={`saved-${i}`}
                        onPress={() => fillSavedPlace(place)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100, backgroundColor: colors.umuvLight, borderWidth: 1, borderColor: colors.umuv }}
                      >
                        <Ionicons name="bookmark" size={14} color={colors.umuv} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.umuvDark }}>{place.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {recentDestinations.length > 0 && (
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.slate500, letterSpacing: 0.6, marginBottom: 6 }}>{t('recent')?.toUpperCase() ?? 'RECENT'}</Text>
                    {recentDestinations.slice(0, 3).map((r, i) => (
                      <TouchableOpacity
                        key={`recent-${i}`}
                        onPress={() => fillSavedPlace(r)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
                      >
                        <Ionicons name="time-outline" size={16} color={colors.slate400} />
                        <Text style={{ flex: 1, fontSize: 13, color: colors.slate600, fontWeight: '600' }} numberOfLines={1}>{r.address}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ROUTE PREVIEW */}
            {pickupCoords && destCoords && (
              <View style={{ marginTop: 12 }}>
                <RoutePreviewMap pickup={pickupCoords} dropoff={destCoords} polyline={routePolyline} height={200} liteMode edgePadding={{ top: 40, right: 40, bottom: 40, left: 40 }} />
              </View>
            )}

            {/* FARE — loading */}
            {isEstimating && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
                <ActivityIndicator size="small" color={colors.umuv} />
                <Text style={{ fontSize: 12, color: colors.slate500, fontWeight: '600' }}>{t('calculating_fare')}</Text>
              </View>
            )}

            {/* FARE — estimate */}
            {fareEstimate && !isEstimating && (
              <View style={{ marginTop: 16, padding: 16, borderRadius: radius.lg, backgroundColor: colors.amberLight, borderWidth: 1, borderColor: colors.amber + '60' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.amberDark, letterSpacing: 0.6 }}>{t('estimated_fare').toUpperCase()}</Text>
                    <Text style={{ fontSize: 28, fontWeight: '900', color: colors.ink, letterSpacing: -0.8, marginTop: 2 }}>P {fareEstimate.total}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.amberDark, marginTop: 2 }}>{t(VEHICLE_CLASSES.find((v) => v.id === fareEstimate.vehicleClass)?.labelKey ?? 'vehicle_sedan').toUpperCase()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>{fareEstimate.distance} km</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.slate600, marginTop: 2 }}>~{fareEstimate.duration} min</Text>
                  </View>
                </View>

                {fareEstimate.surge > 1.0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' }}>
                    <Ionicons name="flash" size={14} color={colors.amberDark} />
                    <Text style={{ fontSize: 12, color: colors.amberDark, fontWeight: '800' }}>{t('high_demand')} ({fareEstimate.surge}x)</Text>
                  </View>
                )}

                {/* Fare breakdown */}
                <TouchableOpacity onPress={() => setShowBreakdown(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.amberDark }}>{showBreakdown ? 'Hide' : 'See'} fare breakdown</Text>
                  <Ionicons name={showBreakdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.amberDark} />
                </TouchableOpacity>

                {showBreakdown && (
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.amber }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: colors.slate600 }}>Base fare</Text>
                      <Text style={{ fontSize: 12, color: colors.ink, fontWeight: '600' }}>P {fareEstimate.base_fare.toFixed(2)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: colors.slate600 }}>Distance ({fareEstimate.distance} km)</Text>
                      <Text style={{ fontSize: 12, color: colors.ink, fontWeight: '600' }}>P {fareEstimate.distance_fare.toFixed(2)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: colors.slate600 }}>Time ({fareEstimate.duration} min)</Text>
                      <Text style={{ fontSize: 12, color: colors.ink, fontWeight: '600' }}>P {fareEstimate.time_fare.toFixed(2)}</Text>
                    </View>
                    {fareEstimate.surge > 1.0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: colors.amberDark, fontWeight: '600' }}>Surge ({fareEstimate.surge}x)</Text>
                        <Text style={{ fontSize: 12, color: colors.amberDark, fontWeight: '700' }}>Applied</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.amber }}>
                      <Text style={{ fontSize: 13, color: colors.ink, fontWeight: '800' }}>Total</Text>
                      <Text style={{ fontSize: 13, color: colors.ink, fontWeight: '900' }}>P {fareEstimate.total}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* PAYMENT METHOD SELECTOR */}
            {fareEstimate && !isEstimating && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.slate500, letterSpacing: 0.6, marginBottom: 8 }}>{t('payment_method')?.toUpperCase() ?? 'PAYMENT METHOD'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {PAYMENT_METHODS.map((m) => {
                    const active = paymentMethod === m.id;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        onPress={() => persistPaymentMethod(m.id)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100,
                          backgroundColor: active ? colors.umuvLight : colors.slate50,
                          borderWidth: 1, borderColor: active ? colors.umuv : colors.slate200,
                        }}
                      >
                        <Ionicons name={m.icon as any} size={16} color={active ? colors.umuv : colors.slate600} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? colors.umuvDark : colors.slate600 }}>
                          {t(m.labelKey) ?? m.id}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* FARE — error */}
            {destination && fareError && !isEstimating && (
              <View style={{ marginTop: 12, padding: 12, borderRadius: radius.lg, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#991B1B' }}>{t('fare_unavailable')}</Text>
                <Text style={{ fontSize: 11, color: '#991B1B', marginTop: 4 }}>{fareError}</Text>
                <TouchableOpacity onPress={() => setDestCoords(destCoords ? { ...destCoords } : null)} style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#991B1B', textDecorationLine: 'underline' }}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* FARE — empty */}
            {destination && !fareEstimate && !isEstimating && !fareError && (
              <Text style={{ fontSize: 12, color: colors.slate500, marginTop: 12, textAlign: 'center' }}>
                {t('fare_unavailable')}
              </Text>
            )}

            {/* BOOK */}
            <View style={{ marginTop: spacing.lg }}>
              <Button
                title={isBooking ? t('booking') : (fareEstimate ? `${t('book_ride')} · P ${fareEstimate.total}` : t('enter_destination_to_see_fare') ?? 'Enter destination to see fare')}
                onPress={handleBook}
                loading={isBooking}
                disabled={!fareEstimate || isBooking}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const routeRowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  backgroundColor: colors.slate50,
  borderRadius: radius.lg,
  paddingVertical: 14,
  paddingHorizontal: 14,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: colors.slate200,
};