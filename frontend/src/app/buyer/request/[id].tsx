import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ApiError, displayError, getRequest, setRequestStatus } from '../../../api';
import type { OrderRequest } from '../../../types';
import { dictionaries, en, type Key } from '../../../i18n';
import { useAppState } from '../../_layout';
import { Action, EmptyState, Money, PageHeader, StatusBadge } from '../../../seller/SellerUI';
import { buyerStyles as s } from '../../../buyer/BuyerStyles';

function formatDate(value: string | undefined, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function validSellerPhone(value: string | undefined): value is string {
  if (!value) return false;
  const normalized = value.replace(/[\s().-]/g, '');
  return /^(?:\+91|91)?[6-9]\d{9}$/.test(normalized);
}

export default function BuyerRequestDetailsRoute() {
  const { account, token, locale } = useAppState();
  const t = useCallback((key: Key) => dictionaries[locale][key] || en[key], [locale]);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const requestId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [request, setRequest] = useState<OrderRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadRequest = useCallback(async () => {
    if (!requestId || !token) {
      setLoading(false);
      setNotFound(!requestId);
      return;
    }
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      setRequest(await getRequest(requestId, token));
    } catch (requestError) {
      setRequest(null);
      if (requestError instanceof ApiError && requestError.code === 'NOT_FOUND') {
        setNotFound(true);
      } else {
        setError(displayError(requestError, t));
      }
    } finally {
      setLoading(false);
    }
  }, [requestId, token, t]);

  useEffect(() => {
    void Promise.resolve().then(loadRequest);
  }, [loadRequest]);

  if (account?.role !== 'customer' || !token) return <Redirect href="/auth" />;

  const dateLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  const placedAt = formatDate(request?.createdAt, dateLocale);
  const updatedAt = formatDate(request?.updatedAt, dateLocale);
  const sellerPhone = request && validSellerPhone(request.sellerPhone) ? request.sellerPhone : null;

  const withdraw = async () => {
    if (!request || request.status !== 'pending' || busy) return;
    setBusy(true);
    setActionError('');
    try {
      setRequest(await setRequestStatus(request.id, { action: 'withdraw' }, token));
    } catch (requestError) {
      setActionError(displayError(requestError, t));
    } finally {
      setBusy(false);
    }
  };

  const callSeller = async () => {
    if (!sellerPhone || request?.status !== 'accepted' || busy) return;
    setBusy(true);
    setActionError('');
    try {
      await Linking.openURL(`tel:${sellerPhone.replace(/[\s().-]/g, '')}`);
    } catch {
      setActionError(t('sellerCallFailed'));
    } finally {
      setBusy(false);
    }
  };

  const browseProducts = () => router.navigate('/browse');

  return (
    <View>
      <PageHeader
        kicker={t('buyer')}
        title={t('requestDetailsTitle')}
        subtitle={t('requestDetailsSubtitle')}
        action={<Action label={t('myRequestsNav')} onPress={() => router.navigate('/buyer/requests')} secondary />}
      />

      {loading ? (
        <View style={s.stateCard}>
          <ActivityIndicator color="#16805A" />
          <Text style={s.stateText}>{t('loadingRequestDetails')}</Text>
        </View>
      ) : notFound ? (
        <View style={s.stateCard}>
          <EmptyState
            title={t('requestNotFound')}
            detail={t('requestNotFoundHelp')}
            action={<Action label={t('browseProducts')} onPress={browseProducts} />}
          />
        </View>
      ) : error ? (
        <View style={s.stateCard}>
          <EmptyState
            title={t('requestDetailsError')}
            detail={error}
            action={<Action label={t('retry')} onPress={() => void loadRequest()} />}
          />
        </View>
      ) : request ? (
        <>
          <View style={s.requestCard}>
            <View style={s.requestHeading}>
              <View style={{ flex: 1, minWidth: 150 }}>
                <Text style={s.requestKicker}>{t('requestIdLabel')}</Text>
                <Text style={s.requestTitle}>{request.id}</Text>
              </View>
              <StatusBadge label={t(request.status as Key)} amber={request.status === 'pending'} />
            </View>
            <Text style={s.formLabel}>{t('products')}</Text>
            <Text style={s.requestTitle}>{request.productName || t('productNameUnavailable')}</Text>
            {placedAt && <Text style={s.productDetail}>{t('requestDateLabel')}: {placedAt}</Text>}
            <Text style={s.productDetail}>{t('requestedQuantityLabel')}: {request.quantity} {request.unit}</Text>
            <Text style={s.productDetail}>
              {t('requestedPriceLabel')}: <Money value={request.requestedUnitPriceRupees} /> / {request.unit}
            </Text>
            {request.status === 'accepted' && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E4EAF0' }}>
                <Text style={s.formLabel}>{t('acceptedTerms')}</Text>
                {request.acceptedQuantity !== undefined && (
                  <Text style={s.productDetail}>{t('acceptedQuantityLabel')}: {request.acceptedQuantity} {request.unit}</Text>
                )}
                {request.acceptedUnitPriceRupees !== undefined && (
                  <Text style={s.productDetail}>
                    {t('acceptedUnitPriceLabel')}: <Money value={request.acceptedUnitPriceRupees} /> / {request.unit}
                  </Text>
                )}
                {request.acceptedTotalPriceRupees !== undefined && (
                  <Text style={s.productDetail}>{t('acceptedTotalLabel')}: <Money value={request.acceptedTotalPriceRupees} /></Text>
                )}
              </View>
            )}
          </View>

          <View style={s.requestCard}>
            <Text style={s.requestTitle}>{t('requestTimelineTitle')}</Text>
            <View style={{ marginTop: 12 }}>
              <Text style={s.requestKicker}>● {t('requestPlaced')}</Text>
              {placedAt
                ? <Text style={s.productDetail}>{placedAt}</Text>
                : <Text style={s.productDetail}>{t('timestampUnavailable')}</Text>}
            </View>
            <View style={{ marginTop: 18 }}>
              <Text style={s.requestKicker}>
                {request.status === 'accepted'
                  ? `● ${t('sellerAccepted')}`
                  : request.status === 'declined'
                    ? `● ${t('sellerDeclined')}`
                    : request.status === 'withdrawn'
                      ? `● ${t('sellerResponseUnavailable')}`
                      : `◷ ${t('awaitingSellerResponse')}`}
              </Text>
              {(request.status === 'accepted' || request.status === 'declined') && (
                <Text style={s.productDetail}>
                  {updatedAt ? `${t('requestUpdatedAt')}: ${updatedAt}` : t('timestampUnavailable')}
                </Text>
              )}
            </View>
            <View style={{ marginTop: 18 }}>
              <Text style={s.requestKicker}>{t('finalRequestStatus')}</Text>
              <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                <StatusBadge label={t(request.status as Key)} amber={request.status === 'pending'} />
              </View>
              {request.status !== 'pending' && (
                <Text style={s.productDetail}>
                  {updatedAt ? `${t('requestUpdatedAt')}: ${updatedAt}` : t('timestampUnavailable')}
                </Text>
              )}
            </View>
          </View>

          <View style={s.requestCard}>
            <Text style={s.requestTitle}>{t('buyerActionsTitle')}</Text>
            {request.status === 'accepted' && sellerPhone && (
              <View style={[s.formCard, { marginTop: 14 }]}>
                <Text style={s.formLabel}>{t('sellerContact')}</Text>
                <Text style={s.requestTitle}>{sellerPhone}</Text>
                <View style={s.productActions}>
                  <Action
                    label={busy ? t('pleaseWait') : t('callSeller')}
                    onPress={() => void callSeller()}
                    disabled={busy}
                  />
                </View>
              </View>
            )}
            <View style={s.productActions}>
              {request.status === 'pending' && (
                <Action
                  label={busy ? t('pleaseWait') : t('withdrawRequest')}
                  onPress={() => void withdraw()}
                  secondary
                  disabled={busy}
                />
              )}
              {(request.status === 'accepted' || request.status === 'declined' || request.status === 'withdrawn') && (
                <Action label={t('browseProducts')} onPress={browseProducts} secondary={request.status !== 'declined' && request.status !== 'withdrawn'} disabled={busy} />
              )}
              <Action
                label={t('backToMyRequests')}
                onPress={() => router.navigate('/buyer/requests')}
                secondary
                disabled={busy}
              />
            </View>
            {!!actionError && <Text accessibilityRole="alert" style={s.errorText}>{actionError}</Text>}
          </View>
        </>
      ) : null}
    </View>
  );
}
