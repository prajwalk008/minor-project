import React from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { localeLabels, type Key, type Locale } from './i18n';
import { c } from './seller/styles';

type Props = { t: (key: Key) => string; locale: Locale; setLocale: (locale: Locale) => void };

const steps: { number: string; title: Key; description: Key; icon: string }[] = [
  { number: '01', title: 'landingFarmerStepTitle', description: 'landingFarmerStep', icon: '▦' },
  { number: '02', title: 'landingBuyerStepTitle', description: 'landingBuyerStep', icon: '⌕' },
  { number: '03', title: 'landingTransportStepTitle', description: 'landingTransportStep', icon: '↗' },
];

function LandingButton({ label, onPress, secondary = false }: { label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, secondary && styles.secondaryButton]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

export function LandingScreen({ t, locale, setLocale }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const goToAuth = () => router.navigate('/auth');

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.navbar}>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/')} style={styles.brand}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>M</Text></View>
          <Text style={styles.brandName}>{t('title')}</Text>
        </Pressable>
        <View style={styles.navActions}>
          <View style={styles.localeActions}>
            {(Object.keys(localeLabels) as Locale[]).map(item => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityLabel={localeLabels[item]}
                accessibilityState={{ selected: item === locale }}
                onPress={() => setLocale(item)}
                style={[styles.localeButton, item === locale && styles.localeButtonActive]}
              >
                <Text style={[styles.localeButtonText, item === locale && styles.localeButtonTextActive]}>{localeLabels[item]}</Text>
              </Pressable>
            ))}
          </View>
          <LandingButton label={t('login')} onPress={goToAuth} secondary />
          <LandingButton label={t('register')} onPress={goToAuth} />
        </View>
      </View>

      <View style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{t('landingEyebrow')}</Text>
          <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>{t('landingHeadline')}</Text>
          <Text style={styles.heroDescription}>{t('landingDescription')}</Text>
          <View style={styles.heroActions}>
            <LandingButton label={t('exploreProducts')} onPress={() => router.navigate('/browse')} />
            <LandingButton label={t('joinMarketplace')} onPress={goToAuth} secondary />
          </View>
        </View>
        <View style={styles.heroVisual} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.visualSun} />
          <View style={styles.visualField}>
            <View style={[styles.fieldLine, styles.fieldLineOne]} />
            <View style={[styles.fieldLine, styles.fieldLineTwo]} />
            <View style={[styles.fieldLine, styles.fieldLineThree]} />
          </View>
          <View style={styles.visualCard}>
            <Text style={styles.visualCardIcon}>⌂</Text>
            <Text style={styles.visualCardText}>{t('landingEyebrow')}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>{t('landingHowEyebrow')}</Text>
        <Text style={styles.sectionTitle}>{t('landingHowTitle')}</Text>
        <View style={[styles.cardRow, compact && styles.cardColumn]}>
          {steps.map(step => (
            <View key={step.number} style={styles.stepCard}>
              <View style={styles.stepTop}>
                <Text style={styles.stepIcon}>{step.icon}</Text>
                <Text style={styles.stepNumber}>{step.number}</Text>
              </View>
              <Text style={styles.cardTitle}>{t(step.title)}</Text>
              <Text style={styles.cardDescription}>{t(step.description)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.benefitSection, compact && styles.benefitSectionCompact]}>
        <View style={styles.benefitIntro}>
          <Text style={styles.sectionEyebrow}>{t('landingBenefitsEyebrow')}</Text>
          <Text style={styles.sectionTitle}>{t('landingBenefitsTitle')}</Text>
          <Text style={styles.cardDescription}>{t('landingBenefitsDescription')}</Text>
        </View>
        <View style={[styles.benefitCards, compact && styles.cardColumn]}>
          <View style={styles.benefitCard}>
            <Text style={styles.benefitIcon}>↗</Text>
            <Text style={styles.cardTitle}>{t('landingFarmersTitle')}</Text>
            <Text style={styles.cardDescription}>{t('landingFarmersBenefit')}</Text>
          </View>
          <View style={styles.benefitCard}>
            <Text style={styles.benefitIcon}>⌕</Text>
            <Text style={styles.cardTitle}>{t('landingBuyersTitle')}</Text>
            <Text style={styles.cardDescription}>{t('landingBuyersBenefit')}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.transportSection, compact && styles.transportSectionCompact]}>
        <View style={styles.transportIcon}><Text style={styles.transportIconText}>↗</Text></View>
        <View style={styles.transportCopy}>
          <Text style={styles.sectionEyebrow}>{t('transport')}</Text>
          <Text style={styles.transportTitle}>{t('landingTransportTitle')}</Text>
          <Text style={styles.transportDescription}>{t('landingTransportDescription')}</Text>
        </View>
        <LandingButton label={t('transportAction')} onPress={() => router.navigate('/transport')} secondary />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerBrand}>{t('title')}</Text>
        <Text style={styles.footerText}>{t('landingFooter')}</Text>
        <View style={styles.footerActions}>
          <Pressable accessibilityRole="link" onPress={() => router.navigate('/browse')}>
            <Text style={styles.footerLink}>{t('exploreProducts')}</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={goToAuth}>
            <Text style={styles.footerLink}>{t('register')}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.canvas },
  pageContent: { flexGrow: 1, paddingBottom: 0 },
  navbar: {
    width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 18,
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.orange, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: c.navyDeep, fontSize: 22, fontWeight: '900' },
  brandName: { color: c.navyDeep, fontSize: 17, fontWeight: '900' },
  navActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  localeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  localeButton: { paddingHorizontal: 7, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: c.border },
  localeButtonActive: { backgroundColor: c.orange, borderColor: c.orange },
  localeButtonText: { color: c.muted, fontSize: 10, fontWeight: '700' },
  localeButtonTextActive: { color: c.navyDeep },
  button: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 17, paddingVertical: 11, borderRadius: 8, backgroundColor: c.orange },
  buttonText: { color: c.navyDeep, fontSize: 13, fontWeight: '900' },
  secondaryButton: { backgroundColor: c.white, borderWidth: 1, borderColor: c.border },
  secondaryButtonText: { color: c.ink },
  hero: {
    width: '100%', maxWidth: 1200, minHeight: 420, alignSelf: 'center', marginTop: 16,
    paddingHorizontal: 42, paddingVertical: 40, borderRadius: 18, overflow: 'hidden',
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 24,
    backgroundColor: c.navy,
  },
  heroCompact: { marginTop: 0, paddingHorizontal: 23, paddingVertical: 30, borderRadius: 0 },
  heroCopy: { flex: 1, flexBasis: 390, maxWidth: 640 },
  eyebrow: { color: '#F8CD83', fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 12 },
  heroTitle: { color: c.white, fontSize: 48, fontWeight: '900', lineHeight: 57, maxWidth: 630 },
  heroTitleCompact: { fontSize: 35, lineHeight: 42 },
  heroDescription: { color: '#D3DFEA', fontSize: 16, lineHeight: 25, maxWidth: 550, marginTop: 14 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 25 },
  heroVisual: { width: 300, height: 275, position: 'relative', justifyContent: 'flex-end', alignItems: 'center', flexGrow: 1, flexBasis: 230, maxWidth: 330 },
  visualSun: { position: 'absolute', top: 10, right: 28, width: 94, height: 94, borderRadius: 47, backgroundColor: '#F5A623' },
  visualField: { width: '100%', height: 155, borderTopLeftRadius: 150, borderTopRightRadius: 150, backgroundColor: '#315B4C', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  fieldLine: { position: 'absolute', width: '140%', height: 100, borderWidth: 2, borderColor: '#85A77C', borderRadius: 100 },
  fieldLineOne: { top: 27 },
  fieldLineTwo: { top: 48 },
  fieldLineThree: { top: 69 },
  visualCard: { position: 'absolute', top: 86, left: 3, minWidth: 180, padding: 14, borderRadius: 11, backgroundColor: c.white, flexDirection: 'row', alignItems: 'center', gap: 10 },
  visualCardIcon: { color: c.green, fontSize: 25, fontWeight: '900' },
  visualCardText: { color: c.ink, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  section: { width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 54 },
  sectionEyebrow: { color: c.green, fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginBottom: 8 },
  sectionTitle: { color: c.ink, fontSize: 29, lineHeight: 36, fontWeight: '900', marginBottom: 22 },
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 15 },
  cardColumn: { flexDirection: 'column' },
  stepCard: { flex: 1, flexBasis: 245, minWidth: 0, padding: 21, borderRadius: 13, backgroundColor: c.white, borderWidth: 1, borderColor: c.border },
  stepTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  stepIcon: { width: 42, height: 42, borderRadius: 11, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', color: c.navy, backgroundColor: c.blueSoft, fontSize: 22, fontWeight: '900' },
  stepNumber: { color: '#A8B4C1', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  cardTitle: { color: c.ink, fontSize: 17, lineHeight: 23, fontWeight: '900', marginBottom: 8 },
  cardDescription: { color: c.muted, fontSize: 14, lineHeight: 22 },
  benefitSection: { width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 35, backgroundColor: '#EAF0F6' },
  benefitSectionCompact: { paddingVertical: 34 },
  benefitIntro: { flex: 1, flexBasis: 260 },
  benefitCards: { flex: 2, flexBasis: 470, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  benefitCard: { flex: 1, flexBasis: 205, padding: 20, borderRadius: 13, backgroundColor: c.white, borderWidth: 1, borderColor: c.border },
  benefitIcon: { color: c.green, fontSize: 24, fontWeight: '900', marginBottom: 15 },
  transportSection: { width: '100%', maxWidth: 1152, alignSelf: 'center', marginVertical: 48, padding: 25, borderRadius: 15, backgroundColor: c.white, borderWidth: 1, borderColor: c.border, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 },
  transportSectionCompact: { marginVertical: 26, marginHorizontal: 15, width: 'auto' },
  transportIcon: { width: 54, height: 54, borderRadius: 14, backgroundColor: c.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  transportIconText: { color: c.navy, fontSize: 27, fontWeight: '900' },
  transportCopy: { flex: 1, flexBasis: 240 },
  transportTitle: { color: c.ink, fontSize: 21, fontWeight: '900', marginBottom: 6 },
  transportDescription: { color: c.muted, fontSize: 14, lineHeight: 21, maxWidth: 650 },
  footer: { width: '100%', paddingHorizontal: 24, paddingVertical: 28, backgroundColor: c.navyDeep, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  footerBrand: { color: c.white, fontSize: 15, fontWeight: '900' },
  footerText: { color: '#C5D3E1', fontSize: 12 },
  footerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  footerLink: { color: '#F8CD83', fontSize: 12, fontWeight: '800' },
});
