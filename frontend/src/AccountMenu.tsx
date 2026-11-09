import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Account } from './api';
import type { Key } from './i18n';

export function AccountMenu({ account, logOut, t }: { account: Account | null; logOut: () => void; t: (key: Key) => string }) {
  const [open, setOpen] = useState(false);
  if (!account) return <Pressable accessibilityRole="button" onPress={() => router.navigate('/auth')} style={styles.login}>
    <Text style={styles.label}>{t('registerLogin')}</Text>
  </Pressable>;
  return <View style={{ marginLeft: 'auto' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('accountMenu')} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={styles.icon}>
      <Image source={require('../assets/user-icon.png')} style={styles.avatar} resizeMode="contain" />
    </Pressable>
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable accessibilityLabel={t('closeMenu')} onPress={() => setOpen(false)} style={styles.backdrop}>
        <View style={styles.menu}>
          <Text style={styles.email}>{account.email}</Text>
          <Pressable accessibilityRole="button" onPress={() => { setOpen(false); router.navigate('/profile'); }} style={styles.item}><Text style={styles.label}>{t('viewProfile')}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setOpen(false); logOut(); }} style={styles.item}><Text style={styles.label}>{t('logOut')}</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  login: { marginLeft: 'auto', padding: 12, borderRadius: 8, backgroundColor: '#F5A623' },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatar: { width: 40, height: 40 },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,33,56,0.15)', alignItems: 'flex-end', paddingTop: 76, paddingHorizontal: 20 },
  menu: { width: 280, maxWidth: '100%', borderRadius: 12, backgroundColor: '#fff', padding: 12, elevation: 8, borderWidth: 1, borderColor: '#DDE5ED' },
  email: { padding: 12, color: '#64748B', fontSize: 13 },
  item: { padding: 14, borderRadius: 8 },
  label: { color: '#132840', fontWeight: '700', fontSize: 14 },
});
