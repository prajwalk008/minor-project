import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { displayError, getBuyerRequests, setRequestStatus } from '../../api';
import type { OrderRequest } from '../../types';
import { dictionaries, en, type Key } from '../../i18n';
import { useAppState } from '../_layout';
import { Action, EmptyState, Money, PageHeader, StatusBadge } from '../../seller/SellerUI';
import { buyerStyles as s } from '../../buyer/BuyerStyles';

type StatusFilter = 'all' | OrderRequest['status'];
const filters: { key: StatusFilter; label: Key }[] = [
  { key: 'all', label: 'requestsFilterAll' },
  { key: 'pending', label: 'pending' },
  { key: 'accepted', label: 'accepted' },
  { key: 'completed', label: 'completed' },
  { key: 'declined', label: 'declined' },
  { key: 'withdrawn', label: 'withdrawn' },
];

export default function BuyerRequestsRoute() {
  const { account, token, locale } = useAppState();
  const t = useCallback((key: Key) => dictionaries[locale][key] || en[key], [locale]);
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [withdrawErrors, setWithdrawErrors] = useState<Record<string, string>>({});

  const loadRequests = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      setRequests(await getBuyerRequests(token));
    } catch (requestError) {
      setError(displayError(requestError, t));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const visibleRequests = useMemo(
    () => filter === 'all' ? requests : requests.filter(request => request.status === filter),
    [filter, requests],
  );

  if (account?.role !== 'customer' || !token) return <Redirect href="/auth" />;

  const withdraw = async (request: OrderRequest) => {
    if (request.status !== 'pending' || busyRequestId) return;
    setBusyRequestId(request.id);
    setWithdrawErrors(previous => ({ ...previous, [request.id]: '' }));
    try {
      const updatedRequest = await setRequestStatus(request.id, { action: 'withdraw' }, token);
      setRequests(previous => previous.map(item => item.id === request.id ? { ...item, ...updatedRequest } : item));
    } catch (requestError) {
      setWithdrawErrors(previous => ({ ...previous, [request.id]: displayError(requestError, t) }));
    } finally {
      setBusyRequestId(null);
    }
  };

  const dateLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  return (
    <View>
      <PageHeader
        kicker={t('buyer')}
        title={t('myRequestsTitle')}
        subtitle={t('myRequestsSubtitle')}
        action={<Action label={loading ? t('pleaseWait') : t('refresh')} onPress={() => void loadRequests()} secondary disabled={loading} />}
      />

      <View style={[s.productActions, { marginBottom: 16 }]}>
        {filters.map(item => (
          <Action
            key={item.key}
            label={t(item.label)}
            onPress={() => setFilter(item.key)}
            secondary={filter !== item.key}
          />
        ))}
      </View>

      {loading ? (
        <View style={s.stateCard}>
          <ActivityIndicator color="#16805A" />
          <Text style={s.stateText}>{t('loadingRequests')}</Text>
        </View>
      ) : error ? (
        <View style={s.stateCard}>
          <EmptyState
            title={t('requestsLoadError')}
            detail={error}
            action={<Action label={t('retry')} onPress={() => void loadRequests()} />}
          />
        </View>
      ) : visibleRequests.length === 0 ? (
        <View style={s.stateCard}>
          <EmptyState
            title={filter === 'all' ? t('myRequestsEmpty') : t('noFilteredRequests')}
            detail={filter === 'all' ? t('myRequestsEmptyHelp') : t('noFilteredRequestsHelp')}
          />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {visibleRequests.map(request => {
            const date = request.createdAt ? new Date(request.createdAt) : null;
            const dateText = date && Number.isFinite(date.getTime())
              ? date.toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' })
              : null;
            const requestBusy = busyRequestId === request.id;
            return (
              <View key={request.id} style={s.requestCard}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`${t('viewRequestDetails')}: ${request.productName || t('products')}`}
                  onPress={() => router.push({ pathname: '/buyer/request/[id]', params: { id: request.id } })}
                >
                  <View style={s.requestHeading}>
                    <View style={{ flex: 1, minWidth: 160 }}>
                      <Text style={s.requestKicker}>{t('requestIdLabel')} {request.id.slice(0, 8)}</Text>
                      <Text style={s.requestTitle}>{request.productName || t('products')}</Text>
                    </View>
                    <StatusBadge label={t(request.status as Key)} amber={request.status === 'pending'} />
                  </View>
                  <Text style={s.productDetail}>{t('requestedQuantityLabel')}: {request.quantity} {request.unit}</Text>
                  <Text style={s.productDetail}>{t('requestedPriceLabel')}: <Money value={request.requestedUnitPriceRupees} /> / {request.unit}</Text>
                  {dateText && <Text style={s.productDetail}>{t('requestDateLabel')}: {dateText}</Text>}
                  <Text style={[s.productDetail, { fontWeight: '700' }]}>{t('viewRequestDetails')} →</Text>
                </Pressable>
                {(request.status === 'accepted' || request.status === 'completed') && request.acceptedTotalPriceRupees !== undefined && (
                  <Text style={s.productDetail}>{t('acceptedTotalLabel')}: <Money value={request.acceptedTotalPriceRupees} /></Text>
                )}
                {!!withdrawErrors[request.id] && (
                  <Text accessibilityRole="alert" style={s.errorText}>{withdrawErrors[request.id]}</Text>
                )}
                {request.status === 'pending' && (
                  <View style={s.productActions}>
                    <Action
                      label={requestBusy ? t('pleaseWait') : t('withdraw')}
                      onPress={() => void withdraw(request)}
                      secondary
                      disabled={requestBusy || busyRequestId !== null}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
