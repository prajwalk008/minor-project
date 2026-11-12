import React, { useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { displayError } from '../api';
import { putDraft } from '../draftStore';
import { deletePhoto, savePhoto } from '../photoStore';
import type { ListingInput } from '../types';
import { showAlert } from '../ui';
import { useSeller } from './SellerProvider';
import { Action, Choice, FormField, Money, NumberField, PageHeader, ProductPhoto, type Translate } from './SellerUI';
import { st } from './styles';

const makeId = () => String(Date.now()) + '-' + Math.random().toString(36).slice(2);
const fresh = (): ListingInput => ({
  title: '', category: 'produce', description: '', quantity: 1, unit: 'kg',
  unitPriceRupees: 80, estimatedWeightKgPerUnit: 1,
  packageLengthCmPerUnit: 30, packageWidthCmPerUnit: 30, packageHeightCmPerUnit: 30,
  village: 'Kondagaon', pickupLocation: { lat: 19.5939, lng: 81.6689 },
});
const numericFields: (keyof ListingInput)[] = [
  'quantity', 'unitPriceRupees', 'estimatedWeightKgPerUnit',
  'packageLengthCmPerUnit', 'packageWidthCmPerUnit', 'packageHeightCmPerUnit',
];
export function SellerListingForm({ t }: { t: Translate }) {
  const { refreshDrafts } = useSeller();
  const [form, setForm] = useState<ListingInput>(fresh);
  const [step, setStep] = useState(0);
  const [photoRef, setPhotoRef] = useState('');
  const [photoMime, setPhotoMime] = useState('image/jpeg');
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof ListingInput>(key: K, value: ListingInput[K]) => setForm(previous => ({ ...previous, [key]: value }));
  const validProduct = !!form.title.trim() && !!form.village.trim();
  const validOffer = numericFields.every(key => typeof form[key] === 'number' && Number.isFinite(form[key] as number) && (form[key] as number) > 0);
  const next = () => {
    if ((step === 0 && !validProduct) || (step === 1 && !validOffer)) {
      showAlert(t('invalid'));
      return;
    }
    setStep(current => Math.min(2, current + 1));
  };
  const pick = async (camera: boolean) => {
    try {
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 4_000_000) {
        showAlert(t('invalid'), t('photoTooLarge'));
        return;
      }
      if (asset.mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType)) {
        showAlert(t('invalid'));
        return;
      }
      const saved = await savePhoto(asset, makeId());
      if (photoRef) await deletePhoto(photoRef);
      setPhotoRef(saved);
      setPhotoMime(asset.mimeType || 'image/jpeg');
    } catch (error) {
      showAlert(t('error'), displayError(error, t));
    }
  };
  const save = async () => {
    if (!validProduct || !validOffer || !photoRef) {
      showAlert(t('invalid'), photoRef ? t('invalid') : t('noPhoto'));
      return;
    }
    setSaving(true);
    try {
      await putDraft({
        localId: makeId(), clientPhotoId: makeId(), photoRef, photoMimeType: photoMime,
        fields: form, status: 'queued',
      });
      await refreshDrafts();
      router.replace('/seller/drafts');
    } catch (error) {
      showAlert(t('error'), displayError(error, t));
    } finally {
      setSaving(false);
    }
  };
  const steps = [t('stepProduct'), t('stepOffer'), t('stepPhoto')];
  return <View>
    <PageHeader kicker={t('inventory')} title={t('listing')} subtitle={t('newListingSubtitle')} />
    <View style={st.stepRow}>{steps.map((label, index) =>
      <View key={label} style={[st.step, index === step && st.stepActive]}>
        <Text style={st.stepText}>{index + 1}. {label}</Text>
      </View>)}</View>
    {step === 0 && <View style={st.formCard}>
      <Text style={st.formHeading}>{t('productDetails')}</Text>
      <Text style={st.cardSub}>{t('productHelp')}</Text>
      <FormField label={t('titleField')} value={form.title} onChange={value => update('title', value)} wide />
      <Text style={[st.label, { marginTop: 18 }]}>{t('category')}</Text>
      <View style={st.row}>
        <Choice label={t('categoryProduce')} selected={form.category === 'produce'} onPress={() => update('category', 'produce')} />
        <Choice label={t('categoryCraft')} selected={form.category === 'handicraft'} onPress={() => update('category', 'handicraft')} />
        <Choice label={t('categoryIndustry')} selected={form.category === 'small_industry'} onPress={() => update('category', 'small_industry')} />
      </View>
      <FormField label={t('productInformationOptional')} value={form.description} onChange={value => update('description', value)} multiline wide />
      <FormField label={t('village')} value={form.village} onChange={value => update('village', value)} wide />
    </View>}
    {step === 1 && <>
      <View style={st.formCard}>
        <Text style={st.formHeading}>{t('offerDetails')}</Text>
        <Text style={st.cardSub}>{t('offerHelp')}</Text>
        <View style={st.row}>
          <NumberField label={t('quantity')} value={form.quantity} onChange={value => update('quantity', value)} />
          <NumberField label={t('price')} value={form.unitPriceRupees} onChange={value => update('unitPriceRupees', value)} />
        </View>
        <Text style={[st.label, { marginTop: 18 }]}>{t('unit')}</Text>
        <View style={st.row}>
          <Choice label={t('unitKg')} selected={form.unit === 'kg'} onPress={() => update('unit', 'kg')} />
          <Choice label={t('unitPiece')} selected={form.unit === 'piece'} onPress={() => update('unit', 'piece')} />
        </View>
      </View>
      <View style={st.formCard}>
        <Text style={st.formHeading}>{t('packagingDetails')}</Text>
        <Text style={st.cardSub}>{t('photoHint')}</Text>
        <View style={st.row}>
          <NumberField label={t('weight')} value={form.estimatedWeightKgPerUnit} onChange={value => update('estimatedWeightKgPerUnit', value)} />
          <NumberField label={t('length')} value={form.packageLengthCmPerUnit} onChange={value => update('packageLengthCmPerUnit', value)} />
          <NumberField label={t('width')} value={form.packageWidthCmPerUnit} onChange={value => update('packageWidthCmPerUnit', value)} />
          <NumberField label={t('height')} value={form.packageHeightCmPerUnit} onChange={value => update('packageHeightCmPerUnit', value)} />
        </View>
      </View>
    </>}
    {step === 2 && <>
      <View style={st.formCard}>
        <Text style={st.formHeading}>{t('photoDetails')}</Text>
        <Text style={st.cardSub}>{t('photoHelp')}</Text>
        <View style={st.uploadBox}>
          {photoRef ? <ProductPhoto localRef={photoRef} large /> : <Text style={st.emptyGlyph}>＋</Text>}
          <Text style={[st.muted, { textAlign: 'center', marginBottom: 14 }]}>{photoRef ? t('photoReady') : t('noPhoto')}</Text>
          <View style={st.row}>
            <Action label={t('takePhoto')} onPress={() => pick(true)} secondary />
            <Action label={t('choosePhoto')} onPress={() => pick(false)} secondary />
          </View>
        </View>
      </View>
      <View style={st.formCard}>
        <Text style={st.formHeading}>{t('reviewListing')}</Text>
        <View style={st.divider} />
        <Text style={st.cardTitle}>{form.title}</Text>
        <Text style={[st.muted, { marginTop: 6 }]}>{form.village} · {form.quantity} {form.unit}</Text>
        <View style={{ marginTop: 9 }}><Money value={form.unitPriceRupees} /></View>
        <Text style={[st.muted, { marginTop: 12 }]}>{t('offlineHint')}</Text>
      </View>
    </>}
    <View style={[st.row, { justifyContent: 'flex-end', marginBottom: 20 }]}>
      {step > 0 && <Action label={t('previousStep')} onPress={() => setStep(current => current - 1)} secondary />}
      {step < 2 ? <Action label={t('nextStep')} onPress={next} /> :
        <Action label={saving ? t('saving') : t('saveListing')} onPress={save} disabled={saving} />}
    </View>
  </View>;
}
