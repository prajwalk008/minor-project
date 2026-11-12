import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { displayError, getListings, type Account } from './api';
import type { Key } from './i18n';
import type { Listing } from './types';
import { Action, EmptyState, PageHeader } from './seller/SellerUI';
import { buyerStyles as s } from './buyer/BuyerStyles';
import { ProductGrid } from './products/ProductGrid';

type Props = { t: (key: Key) => string; version: number; onTransport: (listing: Listing) => void; account: Account | null; token: string | null; mode?: 'dashboard' | 'browse' };
export function BuyerScreen({ t, version, mode = 'dashboard' }: Props) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadError = t('error');
  useEffect(() => {
    let active = true;
    getListings().then(items => { if (active) { setListings(items); setError(''); } })
      .catch(() => { if (active) setError(loadError); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version, loadError]);
  const search = async () => {
    setLoading(true); setError('');
    try { setListings(await getListings(query)); } catch (e) { setError(displayError(e, t)); } finally { setLoading(false); }
  };
  return <View>
    {mode === 'dashboard' && <View style={s.hero}>
      <View style={s.heroCopy}><Text style={s.heroKicker}>{t('buyer')}</Text><Text style={s.heroTitle}>{t('buyerWelcome')}</Text><Text style={s.heroText}>{t('buyerIntro')}</Text></View>
      <View style={s.heroActions}><Action label={t('browseProducts')} onPress={() => router.navigate('/browse')} /><Action label={t('myRequestsNav')} onPress={() => router.navigate('/buyer/requests')} secondary /></View>
    </View>}
    <PageHeader kicker={t('products')} title={t(mode === 'browse' ? 'browseProducts' : 'featuredProducts')} subtitle={t('buyerBrowseSubtitle')} />
    <View style={s.searchPanel}>
      <TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => void search()} returnKeyType="search" accessibilityLabel={t('search')} placeholder={t('searchPlaceholder')} style={s.searchInput} />
      <Action label={t('search')} onPress={() => void search()} disabled={loading} />
    </View>
    {loading ? <View style={s.stateCard}><ActivityIndicator /><Text>{t('loadingProducts')}</Text></View>
      : error ? <View style={s.stateCard}><EmptyState title={t('error')} detail={error} action={<Action label={t('retry')} onPress={() => void search()} />} /></View>
      : !listings.length ? <View style={s.stateCard}><EmptyState title={t('noProducts')} detail={t('noSearchResultsHelp')} /></View>
      : <ProductGrid listings={listings} t={t} />}
  </View>;
}
