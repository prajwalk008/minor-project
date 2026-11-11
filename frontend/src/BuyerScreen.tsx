import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { API, createRequest, displayError, getListings, setRequestStatus } from './api';
import type { Key } from './i18n';
import type { Listing, OrderRequest } from './types';
import { Action, EmptyState, Money, PageHeader, StatusBadge } from './seller/SellerUI';
import { buyerStyles as s } from './buyer/BuyerStyles';
import { showAlert } from './ui';

type Props = { t: (key: Key) => string; version: number; onTransport: (listing: Listing) => void };

function ProductCard({
  listing,
  t,
  onOrder,
  onTransport,
  compact,
}: {
  listing: Listing;
  t: (key: Key) => string;
  onOrder: () => void;
  onTransport: () => void;
  compact: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <View style={[s.productCard, compact && s.productCardCompact]}>
      {listing.imageUrl && !imageFailed ? (
        <Image
          source={{ uri: `${API}${listing.imageUrl}` }}
          style={{ width: '100%', height: 180, backgroundColor: '#E9F1FF' }}
          resizeMode="cover"
          accessibilityLabel={listing.title}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={s.productImagePlaceholder}>
          <Text style={s.productImageGlyph}>◫</Text>
        </View>
      )}
      <View style={s.productBody}>
        <Text style={s.productTitle} numberOfLines={2}>{listing.title}</Text>
        <View style={s.productMetaRow}>
          <Money value={listing.unitPriceRupees} />
          <Text style={s.productUnit}>/ {listing.unit}</Text>
        </View>
        <Text style={s.productDetail}>{t('available')}: {listing.availableQuantity} {listing.unit}</Text>
        <Text style={s.productDetail}>{t('village')}: {listing.village}</Text>
        {!!listing.description && <Text style={s.productDescription} numberOfLines={2}>{listing.description}</Text>}
        <View style={s.productActions}>
          <Action label={t('order')} onPress={onOrder} />
          <Action label={t('transport')} onPress={onTransport} secondary />
        </View>
      </View>
    </View>
  );
}

export function BuyerScreen({ t, version, onTransport }: Props) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Listing | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [request, setRequest] = useState<OrderRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listingsError, setListingsError] = useState('');
  const [requestError, setRequestError] = useState('');
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const loadError = t('error');

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setLoading(true);
        setListingsError('');
      }
      return getListings();
    }).then(items => {
      if (active) setListings(items);
    }).catch(() => {
      if (active) setListingsError(loadError);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [version, loadError]);

  const refresh = async () => {
    setLoading(true);
    setListingsError('');
    try {
      setListings(await getListings(q));
    } catch (error) {
      setListingsError(displayError(error, t));
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    if (!selected || !buyerName.trim() || !/^\+?[0-9]{10,15}$/.test(buyerPhone) || !Number.isFinite(quantity) || quantity <= 0) {
      showAlert(t('invalid'));
      return;
    }
    setBusy(true);
    setRequestError('');
    try {
      setRequest(await createRequest({ listingId: selected.id, buyerName, buyerPhone, quantity }));
    } catch (error) {
      setRequestError(displayError(error, t));
    } finally {
      setBusy(false);
    }
  };

  const refreshRequest = async () => {
    if (!request) return;
    setRequestBusy(true);
    setRequestError('');
    try {
      const response = await fetch(`${API}/api/requests/${request.id}`);
      if (!response.ok) throw new Error('Request refresh failed');
      setRequest(await response.json() as OrderRequest);
    } catch {
      setRequestError(t('error'));
    } finally {
      setRequestBusy(false);
    }
  };

  const withdraw = async () => {
    if (!request) return;
    setRequestBusy(true);
    setRequestError('');
    try {
      setRequest(await setRequestStatus(request.id, { action: 'withdraw' }));
    } catch (error) {
      setRequestError(displayError(error, t));
    } finally {
      setRequestBusy(false);
    }
  };

  const findTransport = () => {
    if (listings[0]) onTransport(listings[0]);
    else router.navigate('/transport');
  };

  return (
    <View>
      <View style={s.hero}>
        <View style={s.heroCopy}>
          <Text style={s.heroKicker}>{t('buyer')}</Text>
          <Text style={s.heroTitle}>{t('buyerWelcome')}</Text>
          <Text style={s.heroText}>{t('buyerIntro')}</Text>
        </View>
        <View style={s.heroActions}>
          <Action label={t('findProductsAction')} onPress={() => { void refresh(); }} />
          <Action label={t('transportAction')} onPress={findTransport} secondary />
        </View>
      </View>

      <PageHeader kicker={t('products')} title={t('featuredProducts')} subtitle={t('buyerBrowseSubtitle')} />
      <View style={s.searchPanel}>
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={refresh}
          returnKeyType="search"
          accessibilityLabel={t('search')}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor="#94A3B8"
          style={s.searchInput}
        />
        <Pressable
          accessibilityRole="button"
          onPress={refresh}
          disabled={loading}
          style={[s.searchButton, loading && s.disabled]}
        >
          <Text style={s.searchButtonText}>{t('search')}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={s.stateCard}>
          <ActivityIndicator color="#16805A" />
          <Text style={s.stateText}>{t('loadingProducts')}</Text>
        </View>
      ) : listingsError ? (
        <View style={s.stateCard}>
          <EmptyState
            title={t('error')}
            detail={listingsError}
            action={<Action label={t('retry')} onPress={refresh} />}
          />
        </View>
      ) : listings.length === 0 ? (
        <View style={s.stateCard}>
          <EmptyState
            title={q.trim() ? t('noSearchResultsBuyer') : t('noProducts')}
            detail={q.trim() ? t('noSearchResultsHelp') : t('noProductsHelpBuyer')}
            action={<Action label={t('refresh')} onPress={refresh} secondary />}
          />
        </View>
      ) : (
        <View style={s.productGrid}>
          {listings.map(listing => (
            <ProductCard
              key={listing.id}
              listing={listing}
              t={t}
              compact={compact}
              onOrder={() => { setSelected(listing); setQuantity(1); setRequestError(''); }}
              onTransport={() => onTransport(listing)}
            />
          ))}
        </View>
      )}

      {selected && (
        <View style={s.formCard}>
          <PageHeader
            kicker={t('order')}
            title={selected.title}
            subtitle={`${selected.availableQuantity} ${selected.unit} · ₹${selected.unitPriceRupees}/${selected.unit}`}
          />
          <Text style={s.formLabel}>{t('buyerName')}</Text>
          <TextInput value={buyerName} onChangeText={setBuyerName} placeholder={t('buyerName')} style={s.formInput} />
          <Text style={s.formLabel}>{t('phone')}</Text>
          <TextInput value={buyerPhone} onChangeText={setBuyerPhone} keyboardType="phone-pad" placeholder={t('phone')} style={s.formInput} />
          <Text style={s.formLabel}>{t('amount')}</Text>
          <TextInput
            value={Number.isNaN(quantity) ? '' : String(quantity)}
            onChangeText={value => setQuantity(value === '' ? NaN : Number(value))}
            keyboardType="decimal-pad"
            placeholder={t('amount')}
            style={s.formInput}
          />
          <Text style={s.totalText}>
            {t('total')}: ₹{Number.isFinite(quantity) ? quantity * selected.unitPriceRupees : 0}
          </Text>
          {!!requestError && <Text accessibilityRole="alert" style={s.errorText}>{requestError}</Text>}
          <View style={s.productActions}>
            <Action label={busy ? t('pleaseWait') : t('order')} onPress={send} disabled={busy} />
            <Action label={t('close')} onPress={() => setSelected(null)} secondary />
          </View>
        </View>
      )}

      {request && (
        <View style={s.requestCard}>
          <View style={s.requestHeading}>
            <View style={{ flex: 1 }}>
              <Text style={s.requestKicker}>{t('currentRequest')}</Text>
              <Text style={s.requestTitle}>{t('requestSent')}</Text>
            </View>
            <StatusBadge label={t(request.status as Key)} amber={request.status === 'pending'} />
          </View>
          <Text style={s.productDetail}>{request.quantity} {request.unit} · ₹{request.requestedUnitPriceRupees}/{request.unit}</Text>
          <Text style={s.productDetail}>{t('sellerContact')}: {request.sellerPhone}</Text>
          {!!requestError && <Text accessibilityRole="alert" style={s.errorText}>{requestError}</Text>}
          <View style={s.productActions}>
            <Action label={requestBusy ? t('pleaseWait') : t('refresh')} onPress={refreshRequest} secondary disabled={requestBusy} />
            {request.status === 'pending' && (
              <Action label={t('withdraw')} onPress={withdraw} secondary disabled={requestBusy} />
            )}
          </View>
        </View>
      )}
    </View>
  );
}
