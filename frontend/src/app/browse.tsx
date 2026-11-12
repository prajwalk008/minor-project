import { BuyerScreen } from '../BuyerScreen';
import { useAppState } from './_layout';

export default function BrowseRoute() {
  const { t, version, openTransport, account, token } = useAppState();
  return <BuyerScreen t={t} version={version} onTransport={openTransport} account={account} token={token} mode="browse" />;
}
