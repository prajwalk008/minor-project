import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAppState } from './_layout';
import { Button, s } from '../ui';

export default function ProfileRoute() {
  const { account, t } = useAppState();
  return <View style={s.card}>
    <Text style={s.heading}>{t('viewProfile')}</Text>
    {account ? <>
      {!!account.firstName && <Text style={s.muted}>{t('firstName')}: {account.firstName}</Text>}
      {!!account.lastName && <Text style={s.muted}>{t('lastName')}: {account.lastName}</Text>}
      <Text style={s.label}>{t('chooseAccount')}: {t(account.role === 'seller' ? 'seller' : 'customer')}</Text>
      <Text style={s.muted}>{t('email')}: {account.email}</Text>
      {!!account.phone && <Text style={s.muted}>{t('phone')}: {account.phone}</Text>}
      <Button label={t('backToMarketplace')} onPress={() => router.navigate(account.role === 'seller' ? '/seller' : '/')} secondary />
    </> : <Button label={t('registerLogin')} onPress={() => router.navigate('/auth')} />}
  </View>;
}
