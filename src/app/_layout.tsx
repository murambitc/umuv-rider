// umuv-rider/src/app/_layout.tsx

import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        {/* Auth */}
        <Stack.Screen name="index" options={{ animation: 'none' }} />
      

        {/* Tabs (main app) */}
        <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />

        {/* Modals & full-screen pushes */}
        <Stack.Screen name="pick-location" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="trip/[id]" />
        <Stack.Screen name="trip/[id]/chat" />
        <Stack.Screen name="trip/[id]/call" />
        <Stack.Screen name="trip/[id]/rate" />
      </Stack>
    </AuthProvider>
  );
}