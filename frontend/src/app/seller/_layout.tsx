import { Redirect, Slot } from 'expo-router';
import { useAppState } from '../_layout';
import { SellerProvider } from '../../seller/SellerProvider';
import { SellerShell } from '../../seller/SellerShell';

export default function SellerLayout() {
  const { published, account, token } = useAppState();
  if (!account || account.role !== 'seller' || !token) return <Redirect href="/auth" />;
  return <SellerProvider key={account.id} onPublished={published}><SellerShell><Slot /></SellerShell></SellerProvider>;
}