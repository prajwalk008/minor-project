import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { API, displayError, getReviewEligibility, getReviews, publishReview } from '../api';
import type { Listing, ProductReview, ReviewImage } from '../types';
import { useAppState } from '../app/_layout';
import { dictionaries, en, type Key } from '../i18n';
import { Action } from '../seller/SellerUI';
import { Rating } from './ProductCard';
import { productStyles as s } from './styles';

type Photo = ReviewImage & { uri: string };
export function ProductReviews({ listing, onPublished }: { listing: Listing; onPublished: () => void }) {
  const { token, account, locale } = useAppState();
  const t = useCallback((key: Key) => dictionaries[locale][key] || en[key], [locale]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [eligibility, setEligibility] = useState<{ purchased: boolean; reviewed: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [items, allowed] = await Promise.all([getReviews(listing.id), token && account?.role === 'customer' ? getReviewEligibility(listing.id, token) : Promise.resolve(null)]);
      setReviews(items); setEligibility(allowed);
    } catch (e) { setLoadError(displayError(e, t)); }
    finally { setLoading(false); }
  }, [listing.id, token, account, t]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const addPhotos = async () => {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 3 - photos.length, base64: true, quality: 0.65 });
      if (result.canceled) return;
      const additions: Photo[] = [];
      for (const asset of result.assets) {
        const mimeType = asset.mimeType || 'image/jpeg';
        if (!asset.base64 || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) || asset.base64.length > 1_333_336) {
          setError(t('reviewPhotoInvalid')); return;
        }
        additions.push({ uri: asset.uri, base64: asset.base64, mimeType });
      }
      setPhotos(previous => [...previous, ...additions].slice(0, 3));
    } catch (e) { setError(displayError(e, t)); }
  };
  const submit = async () => {
    if (!token || busy) return;
    if (!rating || !body.trim() || body.trim().length > 2000) { setError(t('reviewInvalid')); return; }
    setBusy(true); setError('');
    try {
      await publishReview(listing.id, { rating, body: body.trim(), images: photos.map(({ base64, mimeType }) => ({ base64, mimeType })) }, token);
      setSuccess(true); setBody(''); setPhotos([]); setRating(0);
      await load(); onPublished();
    } catch (e) { setError(displayError(e, t)); }
    finally { setBusy(false); }
  };
  return <View style={s.panel}>
    <Text style={s.heading}>{t('customerReviews')}</Text>
    <View style={s.reviewLayout}>
      <View style={s.reviewSummary}>
        <Text style={s.price}>{listing.averageRating ? listing.averageRating.toFixed(1) : '—'} <Text style={s.muted}>{t('outOfFive')}</Text></Text>
        <Rating average={listing.averageRating} count={listing.reviewCount} t={t} />
        <Text style={s.muted}>{listing.reviewCount || 0} {t('reviewsLabel')}</Text>
        <View style={s.line} /><Text style={s.smallHeading}>{t('reviewProduct')}</Text>
        <Text style={s.text}>{t('reviewHelp')}</Text>
        <Text style={s.muted}>{eligibility?.reviewed ? t('alreadyReviewed') : t('reviewPurchaseRequired')}</Text>
      </View>
      <View style={s.reviewList}>
        {success && <Text accessibilityRole="alert" style={s.success}>{t('reviewPublished')}</Text>}
        {loading ? <View style={s.row}><ActivityIndicator /><Text style={s.muted}>{t('reviewLoading')}</Text></View>
          : loadError ? <><Text style={s.error}>{t('reviewLoadFailed')} {loadError}</Text><Action label={t('retry')} onPress={() => void load()} secondary /></>
          : <>
            {eligibility?.purchased && !eligibility.reviewed && <View style={[s.panel, { backgroundColor: '#F7FAFC' }]}>
              <Text style={s.smallHeading}>{t('reviewProduct')}</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel={t('ratingLabel')} style={s.row}>
                {[1, 2, 3, 4, 5].map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: rating === value }} accessibilityLabel={`${value} ${t('outOfFive')}`} onPress={() => setRating(value)} disabled={busy} style={s.starButton}>
                  <Text style={[s.stars, { fontSize: 25 }]}>{value <= rating ? '★' : '☆'}</Text>
                </Pressable>)}
              </View>
              <Text style={s.label}>{t('reviewText')}</Text>
              <TextInput accessibilityLabel={t('reviewText')} multiline maxLength={2000} value={body} onChangeText={setBody} editable={!busy} placeholder={t('reviewPlaceholder')} style={[s.input, { minHeight: 120, textAlignVertical: 'top' }]} />
              <Text style={s.muted}>{t('reviewPhotoHelp')}</Text>
              <View style={s.row}>{photos.map((photo, index) => <View key={`${index}-${photo.uri}`} style={{ gap: 5 }}>
                <Image source={{ uri: photo.uri }} style={s.reviewImage} accessibilityLabel={t('choosePhoto')} />
                <Pressable onPress={() => setPhotos(items => items.filter((_, i) => i !== index))} disabled={busy} accessibilityRole="button"><Text style={s.link}>{t('removePhoto')}</Text></Pressable>
              </View>)}</View>
              <View style={s.row}><Action label={t('addReviewPhotos')} onPress={() => void addPhotos()} secondary disabled={busy || photos.length >= 3} /><Action label={busy ? t('pleaseWait') : t('submitReview')} onPress={() => void submit()} disabled={busy} /></View>
              {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
            </View>}
            {!reviews.length && <Text style={s.muted}>{t('noReviews')}</Text>}
            {reviews.map(review => <View key={review.id} style={s.review}>
              <View style={s.row}><Text style={s.avatar}>{review.buyerName.slice(0, 1).toUpperCase()}</Text><Text style={s.smallHeading}>{review.buyerName}</Text></View>
              <Rating average={review.rating} t={t} />
              <Text style={s.badge}>{t('verifiedPurchase')}</Text>
              <Text style={s.muted}>{new Date(review.createdAt).toLocaleDateString(locale === 'en' ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
              <Text style={s.text}>{review.body}</Text>
              <View style={s.row}>{review.imageUrls.map(url => <Pressable key={url} onPress={() => setExpandedPhoto(`${API}${url}`)} accessibilityRole="button" accessibilityLabel={t('choosePhoto')}>
                <Image source={{ uri: `${API}${url}` }} style={s.reviewImage} resizeMode="cover" />
              </Pressable>)}</View>
            </View>)}
          </>}
      </View>
    </View>
    <Modal visible={!!expandedPhoto} transparent onRequestClose={() => setExpandedPhoto(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,20,30,0.94)', padding: 24, justifyContent: 'center', gap: 20 }}>
        <Action label={t('close')} onPress={() => setExpandedPhoto(null)} secondary />
        {expandedPhoto && <Image source={{ uri: expandedPhoto }} style={{ width: '100%', flex: 1 }} resizeMode="contain" accessibilityLabel={t('customerReviews')} />}
      </View>
    </Modal>
  </View>;
}
