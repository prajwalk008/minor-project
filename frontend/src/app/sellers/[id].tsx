import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { displayError, getPublicSeller } from '../../api';
import type { Listing, PublicSeller } from '../../types';
import { useAppState } from '../_layout';
import { dictionaries, en, type Key } from '../../i18n';
import { Action } from '../../seller/SellerUI';
import { ProductCard } from '../../products/ProductCard';
import { productStyles as s } from '../../products/styles';

export default function SellerProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale } = useAppState();
  const t = useCallback((key: Key) => dictionaries[locale][key] || en[key], [locale]);
  const [data, setData] = useState<{ seller: PublicSeller; listings: Listing[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await getPublicSeller(id)); } catch (e) { setError(displayError(e, t)); } finally { setLoading(false); }
  }, [id, t]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return <View style={s.page}>
    <Link href="/browse" style={s.breadcrumb}>← {t('backToProducts')}</Link>
    {loading ? <ActivityIndicator /> : error ? <View style={s.panel}><Text style={s.error}>{error}</Text><Action label={t('retry')} onPress={() => void load()} /></View> : data && <>
      <View style={s.panel}><Text style={s.category}>{t('sellerProfile')}</Text><Text style={s.title}>{data.seller.name}</Text>
        <Text style={s.muted}>{t('sellerSince')} {new Date(data.seller.joinedAt).toLocaleDateString(locale === 'en' ? 'en-IN' : 'hi-IN', { month: 'long', year: 'numeric' })}</Text>
        <Text style={s.text}>{[...new Set(data.listings.map(item => item.village))].join(' · ')}</Text>
      </View>
      <Text style={s.heading}>{t('sellerProducts')}</Text>
      <View style={s.grid}>{data.listings.map(item => <ProductCard key={item.id} listing={item} t={t} />)}</View>
      {!data.listings.length && <Text style={s.muted}>{t('noProducts')}</Text>}
    </>}
  </View>;
}
