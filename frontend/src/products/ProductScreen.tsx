import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Link, router } from 'expo-router';
import { API, createRequest, displayError, getListing, getListings } from '../api';
import type { Listing, OrderRequest } from '../types';
import { dictionaries, en, type Key } from '../i18n';
import { useAppState } from '../app/_layout';
import { Action } from '../seller/SellerUI';
import { Rating } from './ProductCard';
import { ProductGrid } from './ProductGrid';
import { ProductReviews } from './ProductReviews';
import { productStyles as s } from './styles';

export function ProductScreen({ id }: { id: string }) {
  const { account, token, locale, openTransport } = useAppState();
  const t = useCallback((key: Key) => dictionaries[locale][key] || en[key], [locale]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [suggestions, setSuggestions] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState('1');
  const [phone, setPhone] = useState(account?.phone || '');
  const [buyerName, setBuyerName] = useState([account?.firstName, account?.lastName].filter(Boolean).join(' '));
  const [busy, setBusy] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [request, setRequest] = useState<OrderRequest | null>(null);
  const { width } = useWindowDimensions();
  const narrow = width < 700;
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setListing(await getListing(id)); }
    catch (e) { setError(displayError(e, t)); }
    finally { setLoading(false); }
  }, [id, t]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    let active = true;
    getListings().then(items => { if (active) setSuggestions(items); }).catch(() => {});
    return () => { active = false; };
  }, [id]);
  const submit = async () => {
    if (!listing || busy || request) return;
    if (!token || account?.role !== 'customer') { router.push({ pathname: '/auth', params: { productId: id } }); return; }
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount <= 0 || amount > listing.availableQuantity || (listing.unit === 'piece' && !Number.isInteger(amount))) { setOrderError(t('quantityUnavailable')); return; }
    const cleanPhone = phone.replace(/[\s()-]/g, '');
    if (!buyerName.trim() || !/^\+?[0-9]{10,15}$/.test(cleanPhone)) { setOrderError(t('invalid')); return; }
    setBusy(true); setOrderError('');
    try { setRequest(await createRequest({ listingId: id, buyerName: buyerName.trim(), buyerPhone: cleanPhone, quantity: amount }, token)); }
    catch (e) { setOrderError(displayError(e, t)); }
    finally { setBusy(false); }
  };
  if (loading) return <View style={s.panel}><ActivityIndicator /><Text style={s.muted}>{t('loadingProducts')}</Text></View>;
  if (!listing || error) return <View style={s.panel}><Text style={s.heading}>{t('productUnavailable')}</Text><Text style={s.error}>{error}</Text><Action label={t('retry')} onPress={() => void load()} secondary /></View>;
  const related = suggestions.filter(item => item.id !== id && item.availableQuantity > 0)
    .sort((a, b) => Number(b.category === listing.category) - Number(a.category === listing.category)).slice(0, 4);
  const amount = Number(quantity);
  const images = listing.imageUrls?.length ? listing.imageUrls : listing.imageUrl ? [listing.imageUrl] : [];
  return <View style={s.page}>
    <Link href="/browse" style={s.breadcrumb}>← {t('backToProducts')}</Link>
    <View style={[s.columns, narrow && { flexDirection: 'column', alignItems: 'stretch' }]}>
      <View style={[s.gallery, narrow && { flex: 0, flexBasis: 'auto', width: '100%' }]}>
        {images[selectedImage] && !imageFailed ? <Image source={{ uri: `${API}${images[selectedImage]}` }} accessibilityLabel={`${listing.title}, ${t('productPhoto')} ${selectedImage + 1}`} onError={() => setImageFailed(true)} resizeMode="contain" style={s.mainImage} />
          : <View style={s.imageFallback}><Text style={s.muted}>{t('products')}</Text></View>}
        {images.length > 1 && <View style={[s.row, { padding: 14 }]}>{images.map((url, index) =>
          <Pressable key={url} accessibilityRole="button" accessibilityLabel={`${t('productPhoto')} ${index + 1}`} accessibilityState={{ selected: index === selectedImage }}
            onPress={() => { setSelectedImage(index); setImageFailed(false); }} style={[s.thumbnail, index === selectedImage && { borderColor: '#E69918' }]}>
            <Image source={{ uri: `${API}${url}` }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          </Pressable>)}</View>}
        {!!listing.imageCredits?.length && <View style={{ padding: 14, gap: 5 }}>
          {listing.imageCredits.some(credit => credit.illustrative) && <Text style={s.muted}>{t('samplePhotoNotice')}</Text>}
          <Text style={s.label}>{t('photoCredits')}</Text>
          {listing.imageCredits.map((credit, index) => <Pressable key={`${credit.sourceUrl}-${index}`} accessibilityRole="link" onPress={() => void Linking.openURL(credit.sourceUrl)}>
            <Text numberOfLines={2} style={[s.link, { fontSize: 11 }]}>{index + 1}. {credit.author} · {credit.license}</Text>
          </Pressable>)}
        </View>}
      </View>
      <View style={[s.information, narrow && { flex: 0, flexBasis: 'auto' }]}>
        <Text style={s.category}>{t(listing.category === 'handicraft' ? 'categoryCraft' : listing.category === 'produce' ? 'categoryProduce' : 'categoryIndustry')} · {listing.village}</Text>
        <Text style={s.title}>{listing.title}</Text>
        <Link href={{ pathname: '/sellers/[id]', params: { id: listing.sellerId } }} style={s.link}>{t('soldBy')} {listing.sellerName || t('seller')} →</Link>
        <Rating average={listing.averageRating} count={listing.reviewCount} t={t} />
        <Text style={s.muted}>{listing.unitsSold || 0} {listing.unit} {t('unitsSold')}</Text><View style={s.line} />
        <Text style={s.price}>₹{listing.unitPriceRupees.toLocaleString('en-IN')} <Text style={s.muted}>/ {listing.unit}</Text></Text>
        <Text style={listing.availableQuantity > 0 ? s.stock : s.error}>{listing.availableQuantity > 0 ? `${t('inStock')} · ${listing.availableQuantity} ${listing.unit}` : t('outOfStock')}</Text>
        <View style={s.line} /><Text style={s.smallHeading}>{t('aboutProduct')}</Text>
        <Text style={s.text}>{listing.description || t('noProductInfo')}</Text>
      </View>
      <View style={[s.buyBox, narrow && { flex: 0, flexBasis: 'auto' }]}>
        <Text style={s.smallHeading}>{t('requestSummary')}</Text>
        {request ? <>
          <Text accessibilityRole="alert" style={s.success}>{t('requestSuccess')}</Text>
          <Text style={s.text}>{request.quantity} {request.unit} · ₹{(request.quantity * request.requestedUnitPriceRupees).toLocaleString('en-IN')}</Text>
          <Action label={t('viewRequest')} onPress={() => router.push({ pathname: '/buyer/request/[id]', params: { id: request.id } })} />
        </> : <>
          <Text style={s.price}>₹{(Number.isFinite(amount) && amount > 0 ? amount * listing.unitPriceRupees : listing.unitPriceRupees).toLocaleString('en-IN')}</Text>
          <View><Text style={s.label}>{t('quantity')} ({listing.unit})</Text><TextInput accessibilityLabel={t('quantity')} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={s.input} editable={!busy} /></View>
          {account?.role === 'customer' && <>
            <View><Text style={s.label}>{t('buyerName')}</Text><TextInput value={buyerName} onChangeText={setBuyerName} accessibilityLabel={t('buyerName')} editable={!account.firstName && !busy} style={s.input} /></View>
            <View><Text style={s.label}>{t('phone')}</Text><TextInput accessibilityLabel={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={s.input} editable={!busy} /></View>
          </>}
          {!!orderError && <Text accessibilityRole="alert" style={s.error}>{orderError}</Text>}
          <Action label={busy ? t('pleaseWait') : account?.role === 'customer' ? t('order') : t('signInToOrder')} onPress={() => void submit()} disabled={busy || listing.availableQuantity <= 0 || listing.status !== 'active'} />
        </>}
        <Text style={s.muted}>{t('requestExplanation')}</Text>
        <View style={s.line} /><Action label={t('transport')} onPress={() => openTransport(listing)} secondary />
      </View>
    </View>
    {!!related.length && <View style={{ gap: 15 }}><Text style={s.heading}>{t('suggestedProducts')}</Text><Text style={s.muted}>{t('suggestedHelp')}</Text><ProductGrid listings={related} t={t} /></View>}
    <ProductReviews listing={listing} onPublished={() => { void getListing(id).then(setListing).catch(() => {}); }} />
  </View>;
}
