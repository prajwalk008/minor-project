import { AuthScreen } from '../AuthScreen';
import { useAppState } from './_layout';

export default function AuthRoute() {
  const { t, signIn } = useAppState();
  return <AuthScreen t={t} onSignIn={signIn} />;
}
