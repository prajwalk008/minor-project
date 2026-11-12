import { useLocalSearchParams } from 'expo-router';
import { ProductScreen } from '../../products/ProductScreen';
import { useAppState } from '../_layout';
export default function ProductRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { account } = useAppState();
  return <ProductScreen key={`${id}-${account?.id || 'guest'}`} id={Array.isArray(id) ? id[0] : id} />;
}
