import React, { createContext, useContext, useEffect, useState } from 'react';
import '../global.css';
import { Slot, router, usePathname } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { dictionaries, en, type Key, type Locale } from '../i18n';
import type { Listing } from '../types';
import { logoutAccount, type Account, type AuthSession } from '../api';
import { BuyerShell } from '../buyer/BuyerShell';

type AppState = {
  account: Account | null;
  token: string | null;
  authReady: boolean;
  signIn: (session: AuthSession) => void;
  logOut: () => Promise<void>;
  t: (key: Key) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  version: number;
  published: () => void;
  transportListing: Listing | null;
  openTransport: (listing: Listing) => void;
};
const AppContext = createContext<AppState | null>(null);
export function useAppState(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error('App state requires the root layout');
  return value;
}
export default function RootLayout() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [locale, setLocale] = useState<Locale>('en');
  const [version, setVersion] = useState(0);
  const [transportListing, setTransportListing] = useState<Listing | null>(null);
  const pathname = usePathname();
  const t = (key: Key) => dictionaries[locale][key] || en[key];
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setAuthReady(true);
    });
    return () => { active = false; };
  }, []);
  const logOut = async () => {
    const token = session?.token;
    if (token) await logoutAccount(token);
    setSession(null);
    router.replace('/');
  };
  const value: AppState = {
    account: session?.account || null,
    token: session?.token || null,
    authReady,
    signIn: setSession, logOut,
    t, locale, setLocale, version, transportListing,
    published: () => setVersion(v => v + 1),
    openTransport: listing => { setTransportListing(listing); router.navigate('/transport'); },
  };
  if (!authReady) {
    return <AppContext.Provider value={value}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F6FA', gap: 12 }}>
        <ActivityIndicator color="#16805A" />
        <Text style={{ color: '#64748B', fontSize: 14 }}>{t('authLoading')}</Text>
      </View>
    </AppContext.Provider>;
  }
  if (pathname === '/seller' || pathname.startsWith('/seller/') || pathname === '/auth') {
    return <AppContext.Provider value={value}><Slot /></AppContext.Provider>;
  }
  if (pathname === '/buyer' || pathname === '/buyer/requests' || pathname.startsWith('/buyer/request/') || pathname.startsWith('/product/') || pathname.startsWith('/sellers/') || pathname === '/browse' || pathname === '/transport' || pathname === '/profile') {
    return <AppContext.Provider value={value}><BuyerShell><Slot /></BuyerShell></AppContext.Provider>;
  }
  return <AppContext.Provider value={value}><Slot /></AppContext.Provider>;
}
