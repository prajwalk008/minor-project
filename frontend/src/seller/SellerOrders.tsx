import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { displayError, setRequestStatus } from '../api';
import type { OrderRequest } from '../types';
import { showAlert } from '../ui';
import { useAppState } from '../app/_layout';
import { useSeller } from './SellerProvider';
import { Action, Choice, EmptyState, NumberField, PageHeader, StatusBadge, type Translate } from './SellerUI';
import { st } from './styles';

function OrderCard({ order, title, t, changed }: { order: OrderRequest; title: string; t: Translate; changed: () => Promise<void> }) {
  const { token, account } = useAppState();
  const [qty, setQty] = useState(order.quantity);
  const [unitPrice, setUnitPrice] = useState(order.requestedUnitPriceRupees);
  const [total, setTotal] = useState(order.quantity * order.requestedUnitPriceRupees);
  const [busy, setBusy] = useState(false);
  const act = async (action: 'accept' | 'decline') => {
    if (!token || account?.role !== 'seller') {
      showAlert(t('error'), t('error'));
      return;
    }
    setBusy(true);
    try {
      await setRequestStatus(order.id, { action, exactQuantity: qty, unitPriceRupees: unitPrice, totalPriceRupees: total }, token);
      await changed();
    } catch (error) {
      showAlert(t('error'), displayError(error, t));
    } finally {
      setBusy(false);
    }
  };
  return <View style={[st.card, { marginBottom: 14 }]}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 160 }}>
        <Text style={st.cardTitle}>{title}</Text>
        <Text style={st.cardSub}>{t('orderId')} {order.id.slice(0, 8)} · {order.quantity} {order.unit}</Text>
      </View>
      <StatusBadge label={t(order.status)} amber={order.status === 'pending'} />
    </View>
    <View style={st.divider} />
    <Text style={st.muted}>{t('orderFrom')}: <Text style={{ fontWeight: '800', color: '#192B40' }}>{order.buyerName}</Text></Text>
    <Pressable onPress={() => Linking.openURL('tel:' + order.buyerPhone)} accessibilityRole="link">
      <Text style={[st.textLink, { marginTop: 8 }]}>{t('buyerContact')}: {order.buyerPhone}</Text>
    </Pressable>
    <Text style={[st.muted, { marginTop: 8 }]}>{t('requestedPrice')}: ₹{order.requestedUnitPriceRupees}/{order.unit}</Text>
    {order.status === 'pending' && <>
      <View style={[st.notice, { marginTop: 18, marginBottom: 0 }]}><Text style={st.noticeText}>{t('orderNotice')}</Text></View>
      <View style={st.row}>
        <NumberField label={t('exactQty')} value={qty} onChange={value => { setQty(value); setTotal(value * unitPrice); }} />
        <NumberField label={t('price')} value={unitPrice} onChange={value => { setUnitPrice(value); setTotal(qty * value); }} />
        <NumberField label={t('total')} value={total} onChange={setTotal} />
      </View>
      <View style={[st.row, { marginTop: 18 }]}>
        <Action label={t('accept')} onPress={() => act('accept')} disabled={busy} />
        <Action label={t('decline')} onPress={() => act('decline')} disabled={busy} secondary />
      </View>
    </>}
    {(order.status === 'accepted' || order.status === 'completed') && <Text style={[st.muted, { marginTop: 12 }]}>{t('acceptedTerms')}: ₹{order.acceptedTotalPriceRupees}</Text>}
  </View>;
}
export function SellerOrders({ t }: { t: Translate }) {
  const { requests, listings, refreshRemote, remoteAvailable } = useSeller();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const shown = filter === 'pending' ? requests.filter(order => order.status === 'pending') : requests;
  return <View>
    <PageHeader kicker={t('sellerHub')} title={t('requests')} subtitle={t('ordersSubtitle')}
      action={<Action label={t('refresh')} onPress={refreshRemote} secondary />} />
    <View style={[st.row, { marginBottom: 18 }]}>
      <Choice label={t('newRequests') + ' (' + requests.filter(order => order.status === 'pending').length + ')'}
        selected={filter === 'pending'} onPress={() => setFilter('pending')} />
      <Choice label={t('allOrders') + ' (' + requests.length + ')'} selected={filter === 'all'} onPress={() => setFilter('all')} />
    </View>
    {!remoteAvailable ? <View style={st.card}><EmptyState title={t('offlineReady')} detail={t('offlineBanner')} glyph="↻" /></View> :
    shown.length === 0 ? <View style={st.card}><EmptyState title={filter === 'pending' ? t('noPending') : t('noOrders')}
      detail={filter === 'pending' ? t('noPendingHelp') : t('noOrdersHelp')} glyph="☷" /></View> :
    shown.map(order => <OrderCard key={order.id} order={order}
      title={listings.find(item => item.id === order.listingId)?.title || t('order')}
      t={t} changed={refreshRemote} />)}
  </View>;
}
