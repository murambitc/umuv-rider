import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function HomeScreen() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const { user, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    })();
  }, []);

  const requestRide = async () => {
    if (!coords) {
      Alert.alert('Location', 'Waiting for GPS...');
      return;
    }

    setLoading(true);
    try {
      // Demo dropoff: Airport Junction, Gaborone
      const trip = await api.createTrip({
        pickup_address: 'Current location',
        pickup_lat: coords.lat,
        pickup_lng: coords.lng,
        dropoff_address: 'Airport Junction',
        dropoff_lat: -24.62,
        dropoff_lng: 25.93,
        distance_km: 8.5,
        duration_minutes: 18,
        payment_method: 'cash',
      });

      router.push(`/trip/${trip.id}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-6">
        <Text className="text-2xl font-bold">Hello, {user?.name ?? 'Rider'}</Text>
        <Text className="text-gray-500 mt-1">
          {coords ? `Location: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'Getting location...'}
        </Text>

        <View className="bg-white rounded-2xl p-5 mt-6 shadow-sm">
          <Text className="font-semibold text-lg mb-2">Where to?</Text>
          <Text className="text-gray-500">Demo: Airport Junction</Text>
          <TouchableOpacity
            onPress={requestRide}
            disabled={loading || !coords}
            className="bg-blue-600 rounded-xl py-3 items-center mt-4"
          >
            {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">Book ride</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.push('/history')} className="mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <Text className="font-semibold">My trips</Text>
          <Text className="text-gray-500 text-sm mt-1">View past rides</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={signOut} className="mt-6 items-center">
          <Text className="text-red-600">Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}