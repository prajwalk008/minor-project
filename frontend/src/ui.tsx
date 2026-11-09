import React from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert([title, message].filter(Boolean).join('\n'));
  else Alert.alert(title, message);
}

export function Button({ label, onPress, secondary, disabled }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[s.button, secondary && s.secondary, disabled && s.disabled]}><Text style={[s.buttonText, secondary && s.secondaryText]}>{label}</Text></Pressable>;
}
export function Field({ label, value, onChangeText, number }: { label: string; value: string; onChangeText: (v: string) => void; number?: boolean }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput style={s.input} value={value} onChangeText={onChangeText} placeholder={label} keyboardType={number ? 'decimal-pad' : 'default'} /></View>;
}
export function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <Field label={label} number value={Number.isNaN(value) ? '' : String(value)} onChangeText={v => onChange(v === '' ? NaN : Number(v))} />;
}
export const s = StyleSheet.create({
  page: { padding: 18, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: 70 },
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  heading: { fontSize: 22, fontWeight: '700', color: '#173b2b', marginTop: 20, marginBottom: 10 },
  title: { fontSize: 27, fontWeight: '800', color: '#173b2b', marginTop: 28 },
  muted: { color: '#5e6b61', marginVertical: 6 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 7 },
  field: { marginVertical: 7 }, label: { fontWeight: '600', marginBottom: 4, color: '#334a3c' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#b8c7ba', borderRadius: 7, padding: 11, minHeight: 43 },
  button: { backgroundColor: '#256c46', borderRadius: 7, paddingVertical: 10, paddingHorizontal: 13, marginVertical: 3, alignSelf: 'flex-start' },
  secondary: { backgroundColor: '#e1ede3', borderWidth: 1, borderColor: '#8aa995' }, disabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontWeight: '700' }, secondaryText: { color: '#173b2b' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginVertical: 9, borderWidth: 1, borderColor: '#d9e4d9', gap: 5 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#173b2b' }, photo: { width: 210, height: 160, borderRadius: 7, marginVertical: 8 },
});
