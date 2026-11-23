import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { api } from '../lib/api';

export default function HistoryScreen() {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.history().then((res) => {
      setTrips(res.data ?? res);
      setLoading(false);
    });
  }, []);

  if (loading) return <ActivityIndicator className="flex-1" />;

  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-xl font-bold mb-3">My trips</Text>
      <FlatList
        data={trips}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View className="bg-white rounded-xl p-4 mb-3 shadow-sm">
            <View className="flex-row justify-between">
              <Text className="font-mono text-xs text-gray-500">{item.trip_code}</Text>
              <Text className="text-xs capitalize text-gray-500">{item.status.replace('_', ' ')}</Text>
            </View>
            <Text className="mt-2">{item.pickup_address} → {item.dropoff_address}</Text>
            <Text className="text-gray-500 text-sm mt-1">P {Number(item.total_fare).toFixed(2)}</Text>
          </View>
        )}
        ListEmptyComponent={<Text className="text-center text-gray-400 mt-10">No trips yet</Text>}
      />
    </View>
  );
}