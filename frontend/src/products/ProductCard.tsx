import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { API } from '../api';
import type { Listing } from '../types';
import type { Key } from '../i18n';
import { productStyles as s } from './styles';

export function Rating({ average, count, t }: { average?: number | null; count?: number; t: (key: Key) => string }) {
  return <View style={s.row} accessibilityLabel={average ? `${average.toFixed(1)} ${t('outOfFive')}${count === undefined ? '' : `, ${count} ${t('reviewsLabel')}`}` : t('noRatings')}>
    <Text style={s.stars}>{average ? '★'.repeat(Math.round(average)) + '☆'.repeat(5 - Math.round(average)) : '☆☆☆☆☆'}</Text>
    <Text style={s.muted}>{average ? `${average.toFixed(1)}${count === undefined ? '' : ` (${count})`}` : t('noRatings')}</Text>
  </View>;
}
export function ProductCard({ listing, t }: { listing: Listing; t: (key: Key) => string }) {
  const [failed, setFailed] = useState(false);
  return <Link href={{ pathname: '/product/[id]', params: { id: listing.id } }} asChild>
    <Pressable accessibilityRole="link" accessibilityLabel={`${listing.title}, ₹${listing.unitPriceRupees}`} style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
      {listing.imageUrl && !failed ? <Image source={{ uri: `${API}${listing.imageUrl}` }} style={s.cardImage} resizeMode="contain" onError={() => setFailed(true)} accessibilityLabel={listing.title} />
        : <View style={[s.cardImage, { alignItems: 'center', justifyContent: 'center' }]}><Text style={s.muted}>{t('products')}</Text></View>}
      <View style={s.cardBody}>
        <Text style={s.category}>{listing.village}</Text><Text style={s.cardTitle} numberOfLines={2}>{listing.title}</Text>
        <Text style={s.muted} numberOfLines={1}>{t('soldBy')} {listing.sellerName || t('seller')}</Text>
        <Rating average={listing.averageRating} count={listing.reviewCount} t={t} />
        <Text style={s.cardPrice}>₹{listing.unitPriceRupees.toLocaleString('en-IN')} <Text style={s.muted}>/ {listing.unit}</Text></Text>
        <Text style={s.muted}>{listing.unitsSold || 0} {listing.unit} {t('unitsSold')}</Text>
        <Text style={listing.availableQuantity > 0 ? s.badge : s.muted}>{listing.availableQuantity > 0 ? `${listing.availableQuantity} ${listing.unit} · ${t('inStock')}` : t('outOfStock')}</Text>
      </View>
    </Pressable>
  </Link>;
}
