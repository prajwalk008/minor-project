import { Redirect } from 'expo-router';
import { BuyerScreen } from '../BuyerScreen';
import { useAppState } from './_layout';

export default function BuyerRoute() {
  const { t, version, openTransport, account, token } = useAppState();
  if (account?.role === 'seller') return <Redirect href="/seller" />;
  if (account?.role !== 'customer' || !token) return <Redirect href="/auth" />;
  return <BuyerScreen t={t} version={version} onTransport={openTransport} account={account} token={token} />;
}
