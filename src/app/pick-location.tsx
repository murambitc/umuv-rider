// umuv-rider/src/app/pick-location.tsx

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, FlatList,
  ActivityIndicator, Keyboard, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { PROVIDER_GOOGLE, Marker, Polyline, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import polyline from '@mapbox/polyline';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, shadows } from '../theme';
import { Button } from '../components/Button';

const DEFAULT_LAT = -24.6541;
const DEFAULT_LNG = 25.9087;
const NEUTRAL_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 };

function computeInitialRegion(
  pickup: { lat: number; lng: number } | null,
  dest: { lat: number; lng: number } | null,
): Region {
  if (
    pickup && dest &&
    Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng) &&
    Number.isFinite(dest.lat) && Number.isFinite(dest.lng)
  ) {
    const minLat = Math.min(pickup.lat, dest.lat);
    const maxLat = Math.max(pickup.lat, dest.lat);
    const minLng = Math.min(pickup.lng, dest.lng);
    const maxLng = Math.max(pickup.lng, dest.lng);

    return {
      latitude:  (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta:  Math.max((maxLat - minLat) * 1.6, 0.02),
      longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.02),
    };
  }

  const anchor = pickup ?? dest;
  if (anchor && Number.isFinite(anchor.lat) && Number.isFinite(anchor.lng)) {
    return { latitude: anchor.lat, longitude: anchor.lng, ...NEUTRAL_DELTA };
  }

  return { latitude: DEFAULT_LAT, longitude: DEFAULT_LNG, ...NEUTRAL_DELTA };
}

function parseCoord(latRaw?: string | string[], lngRaw?: string | string[]): { lat: number; lng: number } | null {
  const lat = Number(Array.isArray(latRaw) ? latRaw[0] : latRaw);
  const lng = Number(Array.isArray(lngRaw) ? lngRaw[0] : lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export default function PickLocationScreen() {
  const params = useLocalSearchParams<{
    field?: string;
    pickupAddress?: string; pickupLat?: string; pickupLng?: string;
    destAddress?: string; destLat?: string; destLng?: string;
    stops?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useAuth();
  const mapRef = useRef<MapView>(null);
  const inputRef = useRef<TextInput>(null);

  const [centerCoords, setCenterCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string>('');
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [routeCoords, setRouteCoords] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ address: string; place_id?: string | null }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [useMyLocationLoading, setUseMyLocationLoading] = useState(false);

  const initialRegionSet = useRef(false);

  const contextPickup = parseCoord(params.pickupLat, params.pickupLng);
  const contextDest   = parseCoord(params.destLat,   params.destLng);

  let contextStops: Array<{ lat: number; lng: number }> = [];
  try {
    if (params.stops) {
      const parsed = JSON.parse(String(params.stops));
      if (Array.isArray(parsed)) {
        contextStops = parsed
          .map((s: any) => (s && Number.isFinite(s.lat) && Number.isFinite(s.lng)) ? { lat: s.lat, lng: s.lng } : null)
          .filter((s: any): s is { lat: number; lng: number } => s !== null);
      }
    }
  } catch {
    contextStops = [];
  }

  // ── Initial load ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let pickup = contextPickup;
      let dest = contextDest;

      if (params.field === 'pickup' && !pickup) {
        try {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (perm.status !== 'granted') {
            if (!cancelled) setLocationError(t('permission_location') ?? 'Location permission denied.');
          } else {
            try {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              if (loc && loc.coords &&
                  Number.isFinite(loc.coords.latitude) &&
                  Number.isFinite(loc.coords.longitude)) {
                pickup = { lat: loc.coords.latitude, lng: loc.coords.longitude };
              } else {
                if (!cancelled) setLocationError('Could not read your GPS position.');
              }
            } catch (gpsErr: any) {
              console.warn('[pick-location] GPS failed', gpsErr?.message);
              if (!cancelled) setLocationError('Could not get your location. Using default area.');
            }
          }
        } catch (permErr: any) {
          console.warn('[pick-location] permission request failed', permErr?.message);
          if (!cancelled) setLocationError('Location permission request failed.');
        }
      }

      if (params.field === 'destination' && !dest && !pickup && contextPickup) {
        pickup = contextPickup;
      }

      if (cancelled) return;

      const region = computeInitialRegion(pickup, dest);
      setInitialRegion(region);
      setCenterCoords({ lat: region.latitude, lng: region.longitude });
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [params.field, params.pickupLat, params.destLat]);

  // ── Route preview ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchRoute = async () => {
      const start = params.field === 'pickup' ? centerCoords : contextPickup;
      const end   = params.field === 'destination' ? centerCoords : contextDest;

      if (!start || !end) {
        if (!cancelled) setRouteCoords([]);
        return;
      }
      if (start.lat === end.lat && start.lng === end.lng) {
        if (!cancelled) setRouteCoords([]);
        return;
      }

      try {
        const route = await api.previewRoute(start.lat, start.lng, end.lat, end.lng);
        if (cancelled) return;

        if (route?.polyline) {
          try {
            const decoded = polyline
              .decode(route.polyline)
              .map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
            if (!cancelled) {
              setRouteCoords(decoded.length > 1 ? decoded : [
                { latitude: start.lat, longitude: start.lng },
                { latitude: end.lat, longitude: end.lng },
              ]);
            }
            return;
          } catch {}
        }
        if (!cancelled) {
          setRouteCoords([
            { latitude: start.lat, longitude: start.lng },
            { latitude: end.lat, longitude: end.lng },
          ]);
        }
      } catch {
        if (!cancelled) {
          setRouteCoords([
            { latitude: start.lat, longitude: start.lng },
            { latitude: end.lat, longitude: end.lng },
          ]);
        }
      }
    };

    fetchRoute();
    return () => { cancelled = true; };
  }, [centerCoords, params.field, params.pickupLat, params.destLat]);

  // ── Reverse geocode (debounced) ────────────────────────────
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveAddress = useCallback(async (lat: number, lng: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setResolvingAddress(false);
      return;
    }

    setResolvingAddress(true);

    try {
      const geo = await api.reverseGeocode(lat, lng);
      const name = typeof geo?.name === 'string' ? geo.name.trim() : '';
      const formatted = typeof geo?.formatted_address === 'string' ? geo.formatted_address.trim() : '';
      const display = name || formatted || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setResolvedAddress(display);
    } catch (geoErr: any) {
      console.warn('[pick-location] reverse geocode failed', geoErr?.message);
      setResolvedAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } finally {
      setResolvingAddress(false);
    }
  }, []);

  const onRegionChangeComplete = (r: Region) => {
    if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return;

    if (!initialRegionSet.current) {
      initialRegionSet.current = true;
      return;
    }

    setCenterCoords({ lat: r.latitude, lng: r.longitude });

    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    reverseTimer.current = setTimeout(() => resolveAddress(r.latitude, r.longitude), 800);
  };

  // ── Use my current location ────────────────────────────────
  const useMyLocation = async () => {
    setUseMyLocationLoading(true);
    setLocationError(null);

    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setLocationError(t('permission_location') ?? 'Location permission denied.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!loc?.coords ||
          !Number.isFinite(loc.coords.latitude) ||
          !Number.isFinite(loc.coords.longitude)) {
        setLocationError('Could not read your GPS position.');
        return;
      }

      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };

      mapRef.current?.animateToRegion(
        { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        400,
      );
      setCenterCoords(coords);
      await resolveAddress(coords.lat, coords.lng);
    } catch (e: any) {
      setLocationError(e?.message ?? 'Could not get your location.');
    } finally {
      setUseMyLocationLoading(false);
    }
  };

  // ── Autocomplete ───────────────────────────────────────────
  useEffect(() => {
    if (!showSearch) return;
    if (!searchText || searchText.trim().length < 3) {
      setSuggestions([]);
      setSearchError(null);
      return;
    }

    let cancelled = false;

    const tt = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const results = await api.suggestAddress(searchText);
        if (cancelled) return;

        const safeResults = Array.isArray(results)
          ? results.filter((r: any) => r && typeof r.address === 'string' && r.address.trim().length > 0)
          : [];

        setSuggestions(safeResults);
        if (safeResults.length === 0) setSearchError(t('no_matches') ?? 'No matches found.');
      } catch (searchErr: any) {
        if (cancelled) return;
        console.warn('[pick-location] autocomplete failed', searchErr?.message);
        setSuggestions([]);
        setSearchError(t('search_unavailable') ?? 'Search unavailable. Try again.');
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(tt);
    };
  }, [searchText, showSearch]);

  const selectSuggestion = async (item: { address: string; place_id?: string | null }) => {
    if (!item || typeof item.address !== 'string') return;

    Keyboard.dismiss();
    setShowSearch(false);

    try {
      let coords: { lat: number; lng: number } | null = null;
      let display = item.address;

      if (item.place_id) {
        try {
          const d = await api.placeDetails(item.place_id);
          if (d && Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
            coords = { lat: Number(d.lat), lng: Number(d.lng) };
            display = (typeof d.name === 'string' && d.name.trim())
              ? d.name.trim()
              : ((typeof d.formatted_address === 'string' && d.formatted_address.trim())
                ? d.formatted_address.trim()
                : item.address);
          } else {
            throw new Error('Invalid place details');
          }
        } catch (placeErr: any) {
          console.warn('[pick-location] place details failed, trying geocode', placeErr?.message);
        }
      }

      if (!coords) {
        const g = await api.geocode(item.address);
        if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lng)) {
          throw new Error('Could not resolve that address.');
        }
        coords = { lat: Number(g.lat), lng: Number(g.lng) };
        display = (typeof g.name === 'string' && g.name.trim())
          ? g.name.trim()
          : ((typeof g.formatted_address === 'string' && g.formatted_address.trim())
            ? g.formatted_address.trim()
            : item.address);
      }

      mapRef.current?.animateToRegion(
        { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        400,
      );
      setCenterCoords(coords);
      setResolvedAddress(display);
      setSearchText('');
      setSuggestions([]);
      setSearchError(null);
    } catch (e: any) {
      Alert.alert(
        t('error') ?? 'Error',
        e?.message ?? 'Could not resolve that location. Please try a different one.',
      );
    }
  };

  const confirm = () => {
    Keyboard.dismiss();
    if (!centerCoords || !Number.isFinite(centerCoords.lat) || !Number.isFinite(centerCoords.lng)) {
      Alert.alert(t('error') ?? 'Error', 'No location selected. Move the map to pick one.');
      return;
    }
    const address = resolvedAddress.trim() || `${centerCoords.lat.toFixed(5)}, ${centerCoords.lng.toFixed(5)}`;

    router.replace({
      pathname: '/(tabs)/home',
      params: {
        pickedField: String(params.field ?? ''),
        pickedAddress: address,
        pickedLat: String(centerCoords.lat),
        pickedLng: String(centerCoords.lng),
      },
    });
  };

  const cancel = () => {
    Keyboard.dismiss();
    router.back();
  };

  const label = params.field === 'pickup'
    ? t('pickup') ?? 'Pickup'
    : params.field === 'destination'
      ? t('destination') ?? 'Destination'
      : t('stop') ?? 'Stop';

  const labelColor = params.field === 'pickup'
    ? colors.market
    : params.field === 'destination'
      ? colors.red
      : colors.amberDark;

  const labelIcon = params.field === 'pickup'
    ? 'ellipse'
    : params.field === 'destination'
      ? 'location'
      : 'stop-circle';

  const hasSelection = resolvedAddress.trim().length > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Header with Cancel + Confirm */}
      <View style={{
        backgroundColor: colors.ink,
        paddingTop: insets.top + spacing.md,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
      }}>
        <TouchableOpacity onPress={cancel} hitSlop={12} style={{ padding: 4 }}>
          <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>Cancel</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={labelIcon as any} size={16} color={labelColor} />
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '800' }}>
            {t('set_location', { label }) ?? `Set ${label}`}
          </Text>
        </View>

        <TouchableOpacity onPress={() => setShowSearch((v) => !v)} hitSlop={10} style={{ padding: 4 }}>
          <Ionicons name={showSearch ? 'close' : 'search'} size={22} color="white" />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {loading || !initialRegion ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.umuv} size="large" />
            {locationError && (
              <Text style={{ marginTop: 12, color: colors.red, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 }}>
                {locationError}
              </Text>
            )}
          </View>
        ) : (
          <>
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              provider={PROVIDER_GOOGLE}
              initialRegion={initialRegion}
              onRegionChangeComplete={onRegionChangeComplete}
              showsUserLocation={params.field === 'pickup'}
              showsMyLocationButton={false}
            >
              {routeCoords.length > 1 && (
                <Polyline coordinates={routeCoords} strokeColor={colors.umuv} strokeWidth={5} />
              )}

              {contextPickup && (
                <Marker coordinate={{ latitude: contextPickup.lat, longitude: contextPickup.lng }}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.market, borderWidth: 3, borderColor: 'white' }} />
                </Marker>
              )}

              {contextStops.map((stop, idx) => (
                <Marker key={idx} coordinate={{ latitude: stop.lat, longitude: stop.lng }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.amber, borderWidth: 2, borderColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: colors.ink }}>{idx + 1}</Text>
                  </View>
                </Marker>
              ))}

              {contextDest && (
                <Marker coordinate={{ latitude: contextDest.lat, longitude: contextDest.lng }}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.red, borderWidth: 3, borderColor: 'white' }} />
                </Marker>
              )}
            </MapView>

            {/* Centre pin */}
            <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -20, marginTop: -40 }}>
              <Ionicons name="location" size={40} color={hasSelection ? labelColor : colors.slate400} />
            </View>

            {/* Use my current location button */}
            <TouchableOpacity
              onPress={useMyLocation}
              disabled={useMyLocationLoading}
              style={{
                position: 'absolute',
                bottom: 24,
                right: spacing.lg,
                width: 52, height: 52, borderRadius: 26,
                backgroundColor: 'white',
                alignItems: 'center', justifyContent: 'center',
                ...shadows.card,
                shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
              }}
            >
              {useMyLocationLoading ? (
                <ActivityIndicator size="small" color={colors.umuv} />
              ) : (
                <Ionicons name="locate" size={24} color={colors.umuv} />
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {showSearch && (
        <View style={{ position: 'absolute', top: insets.top + spacing.md + 56, left: spacing.lg, right: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: radius.lg, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.umuv, ...shadows.card }}>
            <Ionicons name="search" size={20} color={colors.umuv} />
            <TextInput
              ref={inputRef}
              value={searchText}
              onChangeText={setSearchText}
              placeholder={t('type_address') ?? 'Type an address'}
              placeholderTextColor={colors.slate400}
              autoFocus
              style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: colors.ink, fontWeight: '600' }}
            />
            <TouchableOpacity onPress={() => { setShowSearch(false); Keyboard.dismiss(); }}>
              <Ionicons name="close-circle" size={20} color={colors.slate400} />
            </TouchableOpacity>
          </View>

          {isSearching && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 4 }}>
              <ActivityIndicator size="small" color={colors.umuv} />
              <Text style={{ fontSize: 12, color: colors.slate500, fontWeight: '600' }}>{t('searching') ?? 'Searching...'}</Text>
            </View>
          )}

          {searchError && (
            <Text style={{ fontSize: 12, color: colors.red, marginTop: 8, fontWeight: '600' }}>{searchError}</Text>
          )}

          {suggestions.length > 0 && (
            <View style={{ backgroundColor: 'white', borderRadius: radius.lg, marginTop: 8, maxHeight: 420, overflow: 'hidden', ...shadows.card }}>
              <FlatList
                keyboardShouldPersistTaps="handled"
                data={suggestions}
                keyExtractor={(it, i) => `${it.place_id ?? i}`}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => selectSuggestion(item)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.slate100 }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.slate100, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="location-outline" size={16} color={colors.slate600} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: colors.ink, fontWeight: '600' }} numberOfLines={2}>
                      {item.address}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>
      )}

      {!showSearch && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, paddingBottom: insets.bottom + spacing.md, ...shadows.card, shadowOpacity: 0.15, shadowRadius: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.lg }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: labelColor + '15', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={labelIcon as any} size={22} color={labelColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.slate500, letterSpacing: 0.5 }}>
                {(t('selected_location', { label: label.toUpperCase() }) ?? `Selected ${label}`).toUpperCase()}
              </Text>
              {resolvingAddress ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <ActivityIndicator size="small" color={colors.slate400} />
                  <Text style={{ fontSize: 13, color: colors.slate500 }}>{t('getting_address') ?? 'Getting address...'}</Text>
                </View>
              ) : hasSelection ? (
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 }} numberOfLines={2}>
                  {resolvedAddress}
                </Text>
              ) : (
                <Text style={{ fontSize: 13, fontStyle: 'italic', color: colors.slate500, marginTop: 2 }} numberOfLines={2}>
                  {t('pick_location_prompt') ?? 'Move the map to pick a location'}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            onPress={() => { setShowSearch(true); setTimeout(() => inputRef.current?.focus(), 100); }}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.slate50, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.slate200, marginBottom: spacing.md }}
          >
            <Ionicons name="search" size={20} color={colors.slate500} />
            <Text style={{ flex: 1, marginLeft: 10, fontSize: 15, color: colors.slate500, fontWeight: '600' }}>
              {t('search_place') ?? 'Search for a place'}
            </Text>
          </TouchableOpacity>

          <Button
            title={t('confirm_label', { label }) ?? `Confirm ${label}`}
            onPress={confirm}
            disabled={loading || !centerCoords || !hasSelection}
          />
        </View>
      )}
    </SafeAreaView>
  );
}