import React from 'react';
import { router, usePathname } from 'expo-router';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useAppState } from '../app/_layout';
import { localeLabels, type Key, type Locale } from '../i18n';
import { useSeller } from './SellerProvider';
import { c, st } from './styles';
import { AccountMenu } from '../AccountMenu';

const navigation: { href: '/seller' | '/seller/inventory' | '/seller/new' | '/seller/drafts' | '/seller/orders'; key: Key; glyph: string }[] = [
  { href: '/seller', key: 'dashboard', glyph: '▦' },
  { href: '/seller/inventory', key: 'inventory', glyph: '◫' },
  { href: '/seller/new', key: 'listing', glyph: '+' },
  { href: '/seller/drafts', key: 'drafts', glyph: '▤' },
  { href: '/seller/orders', key: 'requests', glyph: '☷' },
];
function NavItem({ item, active, compact }: { item: typeof navigation[number]; active: boolean; compact: boolean }) {
  const { t } = useAppState();
  return <Pressable accessibilityRole="link" onPress={() => router.navigate(item.href)}
    style={compact ? [st.mobileNavItem, active && st.mobileNavActive] : [st.navItem, active && st.navItemActive]}>
    {!compact && <Text style={[st.navIcon, active && st.navIconActive]}>{item.glyph}</Text>}
    <Text style={compact ? [st.mobileNavText, active && st.navTextActive] : [st.navText, active && st.navTextActive]}>{t(item.key)}</Text>
  </Pressable>;
}
export function SellerShell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale, account, logOut } = useAppState();
  const { drafts, remoteAvailable } = useSeller();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  return <View style={st.shell}>
    <View style={st.topBar}><View style={[st.topBarInner, !wide && { width: width - 48 }]}>
      <View style={st.brandRow}>
        <View style={st.brandMark}><Text style={st.brandMarkText}>M</Text></View>
        <View><Text style={st.brandName}>Minor Project</Text><Text style={st.brandSub}>{t('sellerHub')}</Text></View>
      </View>
      <View style={[st.headerRight, !wide && { width: '100%' }]}>
        {(Object.keys(localeLabels) as Locale[]).map(l =>
          <Pressable key={l} onPress={() => setLocale(l)} accessibilityRole="button" accessibilityLabel={localeLabels[l]}
            style={[st.localePill, locale === l && st.localePillActive]}>
            <Text style={[st.localeText, locale === l && st.localeTextActive]}>{localeLabels[l]}</Text>
          </Pressable>)}
        <AccountMenu account={account} logOut={logOut} t={t} />
      </View>
    </View></View>
    {(locale === 'hlb' || locale === 'gon') && <View style={st.warning}><Text style={st.warningText}>{t('provisional')}</Text></View>}
    {!wide && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.mobileNav} contentContainerStyle={st.mobileNavInner}>
      {navigation.map(item => <NavItem key={item.href} item={item} active={pathname === item.href || (item.href === '/seller' && pathname === '/seller/')} compact />)}
    </ScrollView>}
    <ScrollView contentContainerStyle={[st.body, !wide && { flexDirection: 'column', width }]}>
      {wide && <View style={st.sidebar}>
        <Text style={st.sideHeading}>{t('sellerHub')}</Text>
        {navigation.map(item => <NavItem key={item.href} item={item} active={pathname === item.href || (item.href === '/seller' && pathname === '/seller/')} compact={false} />)}
        <View style={st.sideNote}>
          <Text style={st.sideNoteTitle}>{t('offlineReady')}</Text>
          <Text style={st.sideNoteText}>{t('offlineHint')}</Text>
        </View>
      </View>}
      <View style={[st.main, !wide && { paddingHorizontal: 15, width: '100%', flex: 0 }]}>
        {!remoteAvailable && <View style={st.notice}><Text style={st.noticeText}>{t('offlineBanner')}</Text></View>}
        {!!drafts.length && pathname !== '/seller/drafts' && <Pressable onPress={() => router.navigate('/seller/drafts')} style={[st.notice, { backgroundColor: c.blueSoft }]}>
          <Text style={[st.noticeText, { color: c.navy }]}>{drafts.length} {t('draftsWaiting')} →</Text>
        </Pressable>}
        {children}
      </View>
    </ScrollView>
  </View>;
}
