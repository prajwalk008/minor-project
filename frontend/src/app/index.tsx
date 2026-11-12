import { Redirect } from 'expo-router';
import { LandingScreen } from '../LandingScreen';
import { useAppState } from './_layout';

export default function HomeRoute() {
  const { t, account, locale, setLocale } = useAppState();
  if (account?.role === 'seller') return <Redirect href="/seller" />;
  if (account?.role === 'customer') return <Redirect href="/buyer" />;
  return <LandingScreen t={t} locale={locale} setLocale={setLocale} />;
}
