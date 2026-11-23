// umuv-rider/src/lib/api.ts

import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const TOKEN_KEY = 'umuv_rider_token';

export async function saveToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
  }

  if (!response.ok) {
    throw new Error(json?.message ?? `Request failed (${response.status})`);
  }

  return json.data ?? json;
}

export const api = {
  // --- AUTH ---
  requestOtp: (phone: string) =>
    request<null>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, code: string) =>
    request<{ token: string; user: any }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code, role: 'rider' }),
    }),

  me: () => request<any>('/auth/me'),
  logout: () => request<null>('/auth/logout', { method: 'POST' }),

  updateProfile: (data: { name: string; email?: string }) =>
    request<any>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateLanguage: (language: string) =>
    request<{ language: string }>('/auth/language', {
      method: 'POST',
      body: JSON.stringify({ language }),
    }),

  // --- GEOCODING & ROUTES ---
  geocode: (address: string) =>
    request<{ lat: number; lng: number; formatted_address: string; name?: string | null }>(
      '/geocode',
      {
        method: 'POST',
        body: JSON.stringify({ address }),
      },
    ),

  suggestAddress: (query: string) =>
    request<Array<{ address: string; place_id?: string; lat?: number; lng?: number }>>(
      `/geocode/suggestions?query=${encodeURIComponent(query)}`,
    ),

  reverseGeocode: (lat: number, lng: number) =>
    request<{ formatted_address: string; name?: string | null }>('/geocode/reverse', {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    }),

  placeDetails: (placeId: string) =>
    request<{ lat: number; lng: number; formatted_address: string; name?: string | null }>(
      '/geocode/place-details',
      {
        method: 'POST',
        body: JSON.stringify({ place_id: placeId }),
      },
    ),

  previewRoute: (originLat: number, originLng: number, destLat: number, destLng: number) =>
    request<{ distance_km: number; duration_minutes: number; polyline: string | null }>(
      '/routes/preview',
      {
        method: 'POST',
        body: JSON.stringify({
          origin_lat: originLat,
          origin_lng: originLng,
          dest_lat: destLat,
          dest_lng: destLng,
        }),
      },
    ),

  // --- FARE & TRIPS ---
  previewFare: (payload: {
    pickup_lat: number;
    pickup_lng: number;
    dropoff_lat?: number;
    dropoff_lng?: number;
    distance_km: number;
    duration_minutes: number;
    vehicle_class?: 'sedan' | 'kombi' | 'bakkie' | 'luxury';
    service_type?: 'ride' | 'parcel' | 'freight';
  }) =>
    request<{
      base_fare: number;
      distance_fare: number;
      time_fare: number;
      surge_multiplier: number;
      total_fare: number;
    }>('/trips/preview-fare', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createTrip: (payload: {
    pickup_address: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_address: string;
    dropoff_lat: number;
    dropoff_lng: number;
    distance_km: number;
    duration_minutes: number;
    service_type: 'ride' | 'parcel' | 'freight';
    vehicle_class?: 'sedan' | 'kombi' | 'bakkie' | 'luxury';
    stops?: string[];
    payment_method?: 'cash' | 'orange_money' | 'myzaka' | 'smega' | 'card' | 'wallet';
    item_description?: string;
    recipient_phone?: string;
  }) =>
    request<any>('/trips', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getTrip: (id: number) => request<any>(`/trips/${id}`),
  trackTrip: (id: number) => request<any>(`/trips/${id}/track`),
  history: () => request<any>('/trips/history'),

  cancelTrip: (id: number, reason: string) =>
    request<any>(`/trips/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // --- CHAT ---
  getMessages: (tripId: number) =>
    request<any[]>(`/trips/${tripId}/messages`),
	
	getUnreadCount: (tripId: number) =>
  request<{ unread: number }>(`/trips/${tripId}/messages/unread-count`),

  sendMessage: (tripId: number, message: string) =>
    request<any>(`/trips/${tripId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  markChatRead: (tripId: number) =>
    request<{ marked_read: number }>(`/trips/${tripId}/messages/read`, { method: 'POST' }),

  // --- RATING ---
  rateTrip: (tripId: number, score: number, comment?: string) =>
    request<any>(`/trips/${tripId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ score, comment }),
    }),

  // --- CALLS ---
  sendCallSignal: (tripId: number, targetId: number, signal: string, payload?: any) =>
    request<any>(`/trips/${tripId}/call-signal`, {
      method: 'POST',
      body: JSON.stringify({ target_id: targetId, signal, payload }),
    }),

  // --- PAYMENTS ---
  initiateTripPayment: (
    tripId: number,
    provider: 'card' | 'orange_money' | 'myzaka' | 'smega' | 'paypal',
  ) =>
    request<{ redirect_url: string | null; payment_reference: string | null; message: string }>(
      `/trips/${tripId}/pay`,
      {
        method: 'POST',
        body: JSON.stringify({ provider }),
      },
    ),

  getTripPaymentStatus: (tripId: number) =>
    request<{ payment_status: string; payment_method: string; payment_reference: string | null }>(
      `/trips/${tripId}/payment-status`,
    ),
};