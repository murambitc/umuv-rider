// umuv-rider/src/context/AuthContext.tsx

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import i18n from '../lib/i18n';
import { api, saveToken, getToken, clearToken } from '../lib/api';

type AuthContextType = {
  user: any | null;
  loading: boolean;
  language: string;
  setLanguage: (code: string) => Promise<void>;
  signIn: (token: string, user: any) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguageState] = useState<string>('en');

  useEffect(() => {
    (async () => {
      try {
        const savedLang = await SecureStore.getItemAsync('user_lang');
        if (savedLang) {
          setLanguageState(savedLang);
          i18n.locale = savedLang;
        }

        const token = await getToken();
        if (token) {
          const me = await api.me();
          setUser(me);
          if (me?.preferred_language && me.preferred_language !== savedLang) {
            setLanguageState(me.preferred_language);
            i18n.locale = me.preferred_language;
            await SecureStore.setItemAsync('user_lang', me.preferred_language);
          }
        }
      } catch {
        await clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setLanguage = useCallback(async (code: string) => {
    i18n.locale = code;
    setLanguageState(code);
    try { await SecureStore.setItemAsync('user_lang', code); } catch {}
    try {
      const token = await getToken();
      if (token) await api.updateLanguage(code);
    } catch {}
  }, []);

  const signIn = async (token: string, userData: any) => {
    await saveToken(token);
    setUser(userData);
    if (userData?.preferred_language && userData.preferred_language !== language) {
      i18n.locale = userData.preferred_language;
      setLanguageState(userData.preferred_language);
      await SecureStore.setItemAsync('user_lang', userData.preferred_language);
    }
  };

  const signOut = async () => {
    try { await clearToken(); } catch {}
    finally { setUser(null); }
  };

  return (
    <AuthContext.Provider value={{ user, loading, language, setLanguage, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);