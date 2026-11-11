import React, { createContext, useContext, useState } from 'react';
import '../global.css';
import { Slot, router, usePathname } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { dictionaries, en, localeLabels, type Key, type Locale } from '../i18n';
import type { Listing } from '../types';
import { Button, s } from '../ui';
import type { Account } from '../api';
import { AccountMenu } from '../AccountMenu';
import { BuyerShell } from '../buyer/BuyerShell';

type AppState = {
  account: Account | null;
  signIn: (account: Account) => void;
  logOut: () => void;
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
  const [account, setAccount] = useState<Account | null>(null);
  const [locale, setLocale] = useState<Locale>('en');
  const [version, setVersion] = useState(0);
  const [transportListing, setTransportListing] = useState<Listing | null>(null);
  const pathname = usePathname();
  const t = (key: Key) => dictionaries[locale][key] || en[key];
  const value: AppState = {
    account, signIn: setAccount, logOut: () => setAccount(null),
    t, locale, setLocale, version, transportListing,
    published: () => setVersion(v => v + 1),
    openTransport: listing => { setTransportListing(listing); router.navigate('/transport'); },
  };
  if (pathname.startsWith('/seller') || pathname === '/auth') {
    return <AppContext.Provider value={value}><Slot /></AppContext.Provider>;
  }
  if (pathname === '/' || pathname === '/transport' || pathname === '/profile') {
    return <AppContext.Provider value={value}><BuyerShell><Slot /></BuyerShell></AppContext.Provider>;
  }
  return <AppContext.Provider value={value}>
    <ScrollView style={{ flex: 1, backgroundColor: '#f5f3ed' }} contentContainerStyle={s.page}>
      <View style={s.pageHeader}><View><Text style={s.title}>{t('title')}</Text><Text style={s.muted}>{t('demo')}</Text></View>
        <AccountMenu account={account} logOut={value.logOut} t={t} />
      </View>
      <View style={s.row}>{(Object.keys(localeLabels) as Locale[]).map(l =>
        <Button key={l} label={localeLabels[l]} onPress={() => setLocale(l)} secondary={locale !== l} />)}</View>
      {(locale === 'hlb' || locale === 'gon') && <Text style={{ backgroundColor: '#fff0c2', padding: 10 }}>{t('provisional')}</Text>}
      <View style={s.row}>
        <Button label={t('seller')} onPress={() => router.navigate('/seller')} secondary={pathname !== '/seller'} />
        <Button label={t('home')} onPress={() => router.navigate('/')} secondary={pathname !== '/'} />
        <Button label={t('transport')} onPress={() => router.navigate('/transport')} secondary={pathname !== '/transport'} />
      </View>
      <Slot />
    </ScrollView>
  </AppContext.Provider>;
}
