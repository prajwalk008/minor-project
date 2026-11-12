import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { displayError, loginAccount, registerAccount, type Account, type AuthSession } from './api';
import type { Key } from './i18n';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INDIA_PHONE = /^(?:\+91|91)?[6-9]\d{9}$/;
type Role = Account['role'];
type Mode = 'login' | 'register';
type Props = { t: (key: Key) => string; onSignIn: (session: AuthSession) => void };

export function AuthScreen({ t, onSignIn }: Props) {
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  const [role, setRole] = useState<Role>('customer');
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const isSeller = role === 'seller';
  const submit = async () => {
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    if (mode === 'register' && (!cleanFirstName || !cleanLastName || [...cleanFirstName].length > 100 || [...cleanLastName].length > 100 || /[\p{Cc}\p{Cf}]/u.test(cleanFirstName + cleanLastName))) {
      setMessage(t('invalidName'));
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim().replace(/[\s()-]/g, '');
    const validIdentifier = EMAIL.test(cleanEmail) || (isSeller && mode === 'login' && INDIA_PHONE.test(cleanEmail.replace(/[\s()-]/g, '')));
    if (!validIdentifier || password.length < 8 || (isSeller && mode === 'register' && !INDIA_PHONE.test(cleanPhone))) {
      setMessage(t('invalidAuthInput'));
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = mode === 'register'
        ? await registerAccount({ role, email: cleanEmail, password, firstName: cleanFirstName, lastName: cleanLastName, ...(isSeller ? { phone: cleanPhone } : {}) })
        : await loginAccount({ role, identifier: cleanEmail, password });
      onSignIn(response);
      setMessage(t('authSuccess') + ' ' + response.account.email);
      if (!isSeller && productId) router.replace({ pathname: '/product/[id]', params: { id: productId } });
      else router.replace(isSeller ? '/seller' : '/buyer');
    } catch (error) {
      setMessage(displayError(error, t));
    } finally {
      setBusy(false);
    }
  };
  const changeRole = (next: Role) => { setRole(next); setMessage(''); };
  const changeMode = (next: Mode) => { setMode(next); setMessage(''); };
  return <ScrollView contentContainerStyle={a.page} style={a.canvas}>
    <View style={a.top}>
      <Pressable onPress={() => router.replace('/')} accessibilityRole="link"><Text style={a.brand}>MINOR PROJECT</Text></Pressable>
      <Pressable onPress={() => router.replace('/')} accessibilityRole="link"><Text style={a.back}>{t('backToMarketplace')} ←</Text></Pressable>
    </View>
    <View style={a.content}>
      <View style={a.intro}>
        <Text style={a.kicker}>{t('accountAccess')}</Text>
        <Text style={a.title}>{t('authHeadline')}</Text>
        <Text style={a.copy}>{t('authSubhead')}</Text>
        <View style={a.infoBox}><Text style={a.infoTitle}>{t('publicMarketplace')}</Text><Text style={a.infoText}>{t('publicMarketplaceInfo')}</Text></View>
      </View>
      <View style={a.card}>
        <Text style={a.cardTitle}>{t('chooseAccount')}</Text>
        <Text style={a.cardCopy}>{t('chooseAccountHelp')}</Text>
        <View style={a.roleRow}>
          <RoleCard label={t('customerAccount')} detail={t('customerAccountHelp')} icon="◉" selected={role === 'customer'} onPress={() => changeRole('customer')} />
          <RoleCard label={t('sellerAccount')} detail={t('sellerAccountHelp')} icon="▦" selected={role === 'seller'} onPress={() => changeRole('seller')} />
        </View>
        <View style={a.modeRow}>
          <ModeTab label={t('login')} active={mode === 'login'} onPress={() => changeMode('login')} />
          <ModeTab label={t('register')} active={mode === 'register'} onPress={() => changeMode('register')} />
        </View>
        <Text style={a.formTitle}>{mode === 'login' ? t('loginAs') : t('registerAs')} {isSeller ? t('seller') : t('customer')}</Text>
        {mode === 'register' && <>
          <Field label={t('firstName')} value={firstName} onChangeText={setFirstName} />
          <Field label={t('lastName')} value={lastName} onChangeText={setLastName} />
        </>}
        <Field label={t(isSeller && mode === 'login' ? 'emailOrPhone' : 'email')} value={email} onChangeText={setEmail} keyboardType={isSeller && mode === 'login' ? 'default' : 'email-address'} autoCapitalize="none" />
        {isSeller && mode === 'register' && <Field label={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91 9876543210" />}
        <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry placeholder={t('passwordHelp')} />
        {!!message && <View style={a.feedback}><Text style={a.feedbackText}>{message}</Text></View>}
        <Pressable onPress={submit} disabled={busy} accessibilityRole="button" style={[a.submit, busy && a.disabled]}>
          <Text style={a.submitText}>{busy ? t('pleaseWait') : mode === 'login' ? t('login') : t('createAccount')}</Text>
        </Pressable>
        <Text style={a.note}>{isSeller && mode === 'login' ? t('sellerLoginNote') : isSeller ? t('sellerAuthNote') : t('customerAuthNote')}</Text>
      </View>
    </View>
  </ScrollView>;
}
function RoleCard({ label, detail, icon, selected, onPress }: { label: string; detail: string; icon: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" style={[a.roleCard, selected && a.roleSelected]}>
    <Text style={a.roleIcon}>{icon}</Text><Text style={a.roleLabel}>{label}</Text><Text style={a.roleDetail}>{detail}</Text>
  </Pressable>;
}
function ModeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" style={[a.modeTab, active && a.modeActive]}><Text style={[a.modeText, active && a.modeTextActive]}>{label}</Text></Pressable>;
}
function Field({ label, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address' | 'phone-pad'; autoCapitalize?: 'none'; placeholder?: string }) {
  return <View style={a.field}><Text style={a.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} secureTextEntry={secureTextEntry}
    keyboardType={keyboardType} autoCapitalize={autoCapitalize} placeholder={placeholder || label} placeholderTextColor="#90A0B2" style={a.input} /></View>;
}
const a = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: '#F4F7FA' }, page: { flexGrow: 1, padding: 26, paddingBottom: 70 },
  top: { width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 54 },
  brand: { color: '#132840', fontWeight: '900', letterSpacing: 1.6, fontSize: 14 }, back: { color: '#1D669D', fontWeight: '800', fontSize: 13 },
  content: { width: '100%', maxWidth: 970, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 44, alignItems: 'center', justifyContent: 'center' },
  intro: { flexGrow: 1, flexBasis: 310, maxWidth: 390 }, kicker: { color: '#17805C', fontSize: 12, fontWeight: '900', letterSpacing: 1.4, marginBottom: 10 },
  title: { color: '#172B44', fontSize: 36, lineHeight: 43, fontWeight: '900' }, copy: { color: '#5D6E81', fontSize: 15, lineHeight: 23, marginTop: 13 },
  infoBox: { marginTop: 28, padding: 18, borderRadius: 12, backgroundColor: '#FFF2D6', borderWidth: 1, borderColor: '#F7D292' },
  infoTitle: { color: '#203349', fontWeight: '900', fontSize: 14, marginBottom: 5 }, infoText: { color: '#685631', fontSize: 13, lineHeight: 19 },
  card: { flexGrow: 1, flexBasis: 400, maxWidth: 490, backgroundColor: '#FFF', borderRadius: 16, borderColor: '#DCE5ED', borderWidth: 1, padding: 26, shadowColor: '#182B43', shadowOpacity: 0.06, shadowRadius: 16, elevation: 2 },
  cardTitle: { color: '#172B44', fontWeight: '900', fontSize: 22 }, cardCopy: { color: '#627386', fontSize: 13, marginTop: 5, lineHeight: 19 },
  roleRow: { flexDirection: 'row', gap: 10, marginTop: 19 }, roleCard: { flex: 1, minHeight: 132, borderWidth: 1, borderColor: '#DCE5ED', padding: 14, borderRadius: 10, backgroundColor: '#FFF' }, roleSelected: { borderColor: '#F5A623', backgroundColor: '#FFF8E8', borderWidth: 2 },
  roleIcon: { color: '#172B44', fontSize: 20, marginBottom: 10 }, roleLabel: { color: '#172B44', fontWeight: '900', fontSize: 14 }, roleDetail: { color: '#65768A', fontSize: 11, lineHeight: 16, marginTop: 4 },
  modeRow: { backgroundColor: '#F2F5F8', borderRadius: 9, padding: 4, flexDirection: 'row', marginTop: 22 }, modeTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 7 }, modeActive: { backgroundColor: '#FFF', shadowColor: '#132840', shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  modeText: { color: '#647589', fontWeight: '800', fontSize: 13 }, modeTextActive: { color: '#172B44' }, formTitle: { color: '#172B44', fontSize: 16, fontWeight: '900', marginTop: 24 },
  field: { marginTop: 16 }, label: { color: '#26394F', fontSize: 12, fontWeight: '800', marginBottom: 7 }, input: { color: '#172B44', borderColor: '#C9D6E2', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, minHeight: 46, fontSize: 14 },
  feedback: { backgroundColor: '#E8F4FF', borderColor: '#BDD9F3', borderWidth: 1, padding: 11, borderRadius: 8, marginTop: 16 }, feedbackText: { color: '#235B85', fontSize: 12, lineHeight: 18 },
  submit: { backgroundColor: '#F5A623', borderRadius: 8, alignItems: 'center', paddingVertical: 13, marginTop: 21 }, disabled: { opacity: 0.5 }, submitText: { color: '#132840', fontWeight: '900', fontSize: 14 },
  note: { color: '#738296', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 14 },
});
