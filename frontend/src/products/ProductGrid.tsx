import { useState } from 'react';
import { View } from 'react-native';
import type { Listing } from '../types';
import type { Key } from '../i18n';
import { ProductCard } from './ProductCard';
import { productStyles as s } from './styles';

export function ProductGrid({ listings, t }: { listings: Listing[]; t: (key: Key) => string }) {
  const [width, setWidth] = useState(0);
  const columns = Math.max(1, Math.min(4, Math.floor((width + 16) / 252)));
  const cardWidth = width > 0 ? (width - (columns - 1) * 16) / columns : '100%';
  return <View style={s.grid} onLayout={event => {
    const next = event.nativeEvent.layout.width;
    setWidth(previous => Math.abs(previous - next) < 1 ? previous : next);
  }}>
    {listings.map(listing => <View key={listing.id} style={{ width: cardWidth, minWidth: 0, flexShrink: 0 }}>
      <ProductCard listing={listing} t={t} />
    </View>)}
  </View>;
}
