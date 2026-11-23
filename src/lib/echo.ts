import Echo from 'laravel-echo';
import PusherModule from 'pusher-js/react-native';
import { getToken } from './api';

let echoInstance: Echo | null = null;

const resolvePusher = (): any => {
  const mod = PusherModule as any;
  if (typeof mod === 'function') return mod;
  if (typeof mod?.default === 'function') return mod.default;
  if (typeof mod?.default?.default === 'function') return mod.default.default;
  if (typeof mod?.Pusher === 'function') return mod.Pusher;
  throw new Error('Pusher constructor not found');
};

export const getEcho = async () => {
  if (echoInstance) return echoInstance;

  const token = await getToken();
  if (!token) return null;

  const Pusher = resolvePusher();
  const pusherClient = new Pusher(process.env.EXPO_PUBLIC_REVERB_APP_KEY!, {
    wsHost: process.env.EXPO_PUBLIC_REVERB_HOST,
    wsPort: Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? 6001),
    wssPort: Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? 6001),
    forceTLS: false,
    enabledTransports: ['ws', 'wss'],
    // ADD THIS LINE - satisfies pusher-js's mandatory check
    cluster: 'mt1',
    auth: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    authEndpoint: `${process.env.EXPO_PUBLIC_API_URL}/broadcasting/auth`,
  });

  echoInstance = new Echo({
    broadcaster: 'reverb',
    client: pusherClient,
    key: process.env.EXPO_PUBLIC_REVERB_APP_KEY,
    wsHost: process.env.EXPO_PUBLIC_REVERB_HOST,
    wsPort: Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? 6001),
    forceTLS: false,
    enabledTransports: ['ws', 'wss'],
    // Also add it here for Echo's own config
    cluster: 'mt1',
  });

  return echoInstance;
};

export const disconnectEcho = () => {
  if (echoInstance) {
    echoInstance.disconnect();
    echoInstance = null;
  }
};