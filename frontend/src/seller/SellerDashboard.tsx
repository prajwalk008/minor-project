import React from 'react';
import { router } from 'expo-router';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSeller } from './SellerProvider';
import { Action, EmptyState, Money, PageHeader, ProductPhoto, SectionLink, StatusBadge, type Translate } from './SellerUI';
import { c, st } from './styles';
import { useAppState } from '../app/_layout';

function Metric({ number, label, glyph, tint, width }: { number: number; label: string; glyph: string; tint: string; width?: number }) {
  return <View style={[st.card, st.metric, width === undefined ? undefined : { width, flexGrow: 0, flexBasis: width, minWidth: 0 }]}>
    <Text style={[st.metricGlyph, { backgroundColor: tint }]}>{glyph}</Text>
    <Text style={st.metricNumber}>{number}</Text><Text style={st.metricLabel}>{label}</Text>
  </View>;
}
export function SellerDashboard({ t }: { t: Translate }) {
  const { account } = useAppState();
  const firstName = account?.role === 'seller' ? account.firstName?.trim() : null;
  const { drafts, listings, requests, remoteAvailable, refreshRemote } = useSeller();
  const screenWidth = useWindowDimensions().width;
  const mobile = screenWidth < 900;
  const metricWidth = mobile ? (screenWidth - 44) / 2 : undefined;
  const pending = requests.filter(item => item.status === 'pending');
  const accepted = requests.filter(item => item.status === 'accepted');
  return <View>
    <PageHeader kicker={t('sellerHub')} title={firstName ? t('welcomeByName').replace('{name}', () => firstName) : t('welcomeSeller')} subtitle={t('welcomeSub')}
      action={<View style={st.row}>
        <Action label={t('transport')} onPress={() => router.navigate('/transport')} secondary />
        <Action label={t('addProduct')} onPress={() => router.navigate('/seller/new')} />
      </View>} />
    <View style={[st.hero, mobile && { flexDirection: 'column', alignItems: 'flex-start' }]}>
      <View style={{ flex: mobile ? 0 : 1, minWidth: mobile ? 0 : 220 }}>
        <Text style={st.heroKicker}>{t('pilotLocation')}</Text>
        <Text style={st.heroTitle}>{t('heroTitle')}</Text>
        <Text style={st.heroText}>{t('heroText')}</Text>
      </View>
      <Action label={t('startListing')} onPress={() => router.navigate('/seller/new')} />
    </View>
    <View style={st.row}>
      <Metric number={listings.length} label={t('activeListings')} glyph="▦" tint={c.blueSoft} width={metricWidth} />
      <Metric number={pending.length} label={t('pendingOrders')} glyph="◷" tint={c.orangeSoft} width={metricWidth} />
      <Metric number={drafts.length} label={t('pendingUploads')} glyph="⇧" tint={c.blueSoft} width={metricWidth} />
      <Metric number={accepted.length} label={t('acceptedOrders')} glyph="✓" tint={c.greenSoft} width={metricWidth} />
    </View>
    <SectionLink title={t('actionNeeded')} action={t('viewOrders')} onPress={() => router.navigate('/seller/orders')} />
    <View style={st.card}>
      {!remoteAvailable ? <EmptyState title={t('offlineReady')} detail={t('offlineBanner')}
        action={<Action label={t('refresh')} onPress={refreshRemote} secondary />} glyph="↻" /> :
      pending.length === 0 ? <EmptyState title={t('noPending')} detail={t('noPendingHelp')} glyph="✓" /> :
      pending.slice(0, 3).map((order, index) => <View key={order.id} style={[st.listRow, index === Math.min(2, pending.length - 1) && { borderBottomWidth: 0 }]}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text style={st.listTitle}>{order.buyerName}</Text>
          <Text style={st.listMeta}>{order.quantity} {order.unit} · {t('orderId')} {order.id.slice(0, 8)}</Text>
        </View>
        <StatusBadge label={t('pending')} amber />
        <Pressable onPress={() => router.navigate('/seller/orders')} accessibilityRole="link"><Text style={st.textLink}>{t('reviewOrder')} →</Text></Pressable>
      </View>)}
    </View>
    <SectionLink title={t('recentListings')} action={t('viewInventory')} onPress={() => router.navigate('/seller/inventory')} />
    <View style={st.card}>
      {listings.length === 0 ? <EmptyState title={t('noInventory')} detail={t('noInventoryHelp')}
        action={<Action label={t('addProduct')} onPress={() => router.navigate('/seller/new')} secondary />} /> :
      listings.slice(0, 3).map((item, index) => <View key={item.id} style={[st.listRow, index === Math.min(2, listings.length - 1) && { borderBottomWidth: 0 }]}>
        <ProductPhoto remotePath={item.imageUrl} />
        <View style={{ flex: 1, minWidth: 150 }}><Text style={st.listTitle}>{item.title}</Text>
          <Text style={st.listMeta}>{item.village} · {item.availableQuantity} {item.unit} {t('available')}</Text></View>
        <Money value={item.unitPriceRupees} />
      </View>)}
    </View>
  </View>;
}
