import React from 'react';
import { router, usePathname } from 'expo-router';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { AccountMenu } from '../AccountMenu';
import { localeLabels, type Key, type Locale } from '../i18n';
import { useAppState } from '../app/_layout';
import { buyerStyles as s } from './BuyerStyles';

const navigation: { href: '/buyer' | '/buyer/requests' | '/browse' | '/transport' | '/profile'; key: Key; glyph: string }[] = [
  { href: '/buyer', key: 'dashboard', glyph: '▦' },
  { href: '/buyer/requests', key: 'myRequestsNav', glyph: '☷' },
  { href: '/browse', key: 'browseProducts', glyph: '◫' },
  { href: '/transport', key: 'transport', glyph: '↗' },
  { href: '/profile', key: 'viewProfile', glyph: '◉' },
];

function NavItem({ item, active, compact }: { item: typeof navigation[number]; active: boolean; compact: boolean }) {
  const { t, account } = useAppState();
  const href = item.href === '/buyer' && !account ? '/' : item.href;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={() => router.navigate(href)}
      style={compact ? [s.mobileNavItem, active && s.mobileNavActive] : [s.navItem, active && s.navItemActive]}
    >
      {!compact && <Text style={[s.navIcon, active && s.navIconActive]}>{item.glyph}</Text>}
      <Text style={compact ? [s.mobileNavText, active && s.mobileNavTextActive] : [s.navText, active && s.navTextActive]}>
        {t(item.key)}
      </Text>
    </Pressable>
  );
}

export function BuyerShell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale, account, logOut } = useAppState();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  return (
    <View style={s.shell}>
      <View style={s.topBar}>
        <View style={[s.topBarInner, !wide && { width: width - 48 }]}>
          <View style={s.brandRow}>
            <View style={s.brandMark}><Text style={s.brandMarkText}>M</Text></View>
            <View>
              <Text style={s.brandName}>Minor Project</Text>
              <Text style={s.brandSub}>{t('buyer')}</Text>
            </View>
          </View>
          <View style={[s.headerRight, !wide && { width: '100%' }]}>
            {(Object.keys(localeLabels) as Locale[]).map(l => (
              <Pressable
                key={l}
                onPress={() => setLocale(l)}
                accessibilityRole="button"
                accessibilityLabel={localeLabels[l]}
                accessibilityState={{ selected: locale === l }}
                style={[s.localePill, locale === l && s.localePillActive]}
              >
                <Text style={[s.localeText, locale === l && s.localeTextActive]}>{localeLabels[l]}</Text>
              </Pressable>
            ))}
            <AccountMenu account={account} logOut={logOut} t={t} />
          </View>
        </View>
      </View>
      {(locale === 'hlb' || locale === 'gon') && (
        <View style={s.warning}><Text style={s.warningText}>{t('provisional')}</Text></View>
      )}
      {!wide && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.mobileNav} contentContainerStyle={s.mobileNavInner}>
          {navigation.map(item => (
            <NavItem key={item.href} item={item} active={pathname === item.href || (item.href === '/buyer/requests' && pathname.startsWith('/buyer/request/'))} compact />
          ))}
        </ScrollView>
      )}
      <ScrollView contentContainerStyle={[s.body, !wide && { flexDirection: 'column', width }]}>
        {wide && (
          <View style={s.sidebar}>
            <Text style={s.sideHeading}>{t('buyer')}</Text>
            {navigation.map(item => (
              <NavItem key={item.href} item={item} active={pathname === item.href || (item.href === '/buyer/requests' && pathname.startsWith('/buyer/request/'))} compact={false} />
            ))}
          </View>
        )}
        <View style={[s.main, !wide && { paddingHorizontal: 15, width: '100%', flex: 0 }]}>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}
