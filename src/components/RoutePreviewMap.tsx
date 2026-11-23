// umuv-rider/src/components/RoutePreviewMap.tsx

import { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import polyline from '@mapbox/polyline';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export type LatLng = { lat: number; lng: number };

type Props = {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  /** Encoded polyline from the backend (Google Routes / Directions). */
  polyline?: string | null;
  /** Extra stops to draw as amber pins. */
  stops?: Array<LatLng | null>;
  /** Approximate height of the map. Defaults to 220. */
  height?: number;
  /** Top/bottom/left/right padding when fitting the view. */
  edgePadding?: { top: number; right: number; bottom: number; left: number };
  /** If true, disables panning/zooming (useful as an inline preview). */
  liteMode?: boolean;
};

const DEFAULT_REGION: Region = {
  latitude: -24.6541,
  longitude: 25.9087,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

export function RoutePreviewMap({
  pickup,
  dropoff,
  polyline: encodedPolyline,
  stops = [],
  height = 220,
  edgePadding = { top: 60, right: 60, bottom: 60, left: 60 },
  liteMode = false,
}: Props) {
  const mapRef = useRef<MapView>(null);

  // Decode the polyline once per change.
  const routeCoords = (() => {
    if (!encodedPolyline) return [];
    try {
      return polyline
        .decode(encodedPolyline)
        .map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
    } catch {
      return [];
    }
  })();

  // Fit the map whenever the key points change.
  useEffect(() => {
    if (!mapRef.current) return;

    const pts: Array<{ latitude: number; longitude: number }> = [];
    if (pickup) pts.push({ latitude: pickup.lat, longitude: pickup.lng });
    if (dropoff) pts.push({ latitude: dropoff.lat, longitude: dropoff.lng });
    stops.forEach((s) => {
      if (s) pts.push({ latitude: s.lat, longitude: s.lng });
    });

    if (pts.length === 0) return;

    // When only one point exists, animate to it instead of trying to fit a box
    if (pts.length === 1) {
      mapRef.current.animateToRegion(
        {
          latitude: pts[0].latitude,
          longitude: pts[0].longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        400,
      );
      return;
    }

    setTimeout(() => {
      mapRef.current?.fitToCoordinates(pts, {
        edgePadding,
        animated: true,
      });
    }, 200);
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, encodedPolyline]);

  // If only one endpoint is known, centre on it.
  const initialRegion: Region =
    pickup
      ? {
          latitude: pickup.lat,
          longitude: pickup.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }
      : DEFAULT_REGION;

  return (
    <View style={[styles.wrapper, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        scrollEnabled={!liteMode}
        zoomEnabled={!liteMode}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest
        loadingEnabled
      >
        {routeCoords.length > 1 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={colors.umuv}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {pickup && (
          <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.pin, { backgroundColor: colors.market }]}>
              <Ionicons name="ellipse" size={8} color="white" />
            </View>
          </Marker>
        )}

        {stops.map((stop, i) =>
          stop ? (
            <Marker key={`stop-${i}`} coordinate={{ latitude: stop.lat, longitude: stop.lng }} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.pin, { backgroundColor: colors.amber }]}>
                <Ionicons name="stop" size={8} color={colors.ink} />
              </View>
            </Marker>
          ) : null,
        )}

        {dropoff && (
          <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.pin, { backgroundColor: colors.red }]}>
              <Ionicons name="location" size={10} color="white" />
            </View>
          </Marker>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
  },
  pin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
});