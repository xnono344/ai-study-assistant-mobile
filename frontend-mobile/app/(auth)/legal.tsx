/**
 * Legal — privacy policy, terms, Google data disclosure.
 * Fully translated (EN/FR/AR).
 */

import { View, Text, StyleSheet, Linking, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassButton } from '../../components/ui/GlassButton';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing } from '../../constants/spacing';
import { useT } from '../../hooks/useT';

const LEGAL_URLS = {
  privacy: 'https://nexusstudy.app/privacy',
  terms: 'https://nexusstudy.app/terms',
  dpa: 'https://nexusstudy.app/dpa',
  googleDisclosure: 'https://nexusstudy.app/google-disclosure',
};

export default function LegalScreen() {
  const router = useRouter();
  const { t } = useT();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[Typography.displaySmall, styles.title]}>
          {t('auth.legal.privacyPolicy')}
        </Text>
        <Text style={[Typography.bodyMedium, styles.intro]}>
          {t('auth.connectGoogleSubtitle')}
        </Text>

        <Section title={t('auth.legal.privacyPolicy')} url={LEGAL_URLS.privacy} />
        <Section title={t('auth.legal.termsOfService')} url={LEGAL_URLS.terms} />
        <Section title={t('auth.legal.dataProcessing')} url={LEGAL_URLS.dpa} />
        <Section title={t('auth.legal.googleDisclosure')} url={LEGAL_URLS.googleDisclosure} />

        <View style={styles.disclosure}>
          <Text style={[Typography.labelSmall, { color: Colors.gold.metallic, marginBottom: Spacing[2] }]}>
            {t('auth.legal.googleUsageTitle')}
          </Text>
          <Text style={[Typography.bodySmall, styles.disclosureText]}>
            {t('auth.legal.googleUsageBody')}
          </Text>
        </View>

        <GlassButton variant="secondary" onPress={() => router.back()} fullWidth style={{ marginTop: Spacing[6] }}>
          {t('common.back')}
        </GlassButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const Section = ({ title, url }: { title: string; url: string }) => (
  <GlassButton
    variant="secondary"
    onPress={() => Linking.openURL(url)}
    fullWidth
    style={{ marginBottom: Spacing[3] }}
  >
    {title} ↗
  </GlassButton>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing[6], paddingTop: Spacing[8], paddingBottom: Spacing[8] },
  title: { marginBottom: Spacing[3] },
  intro: { color: Colors.text.secondary, marginBottom: Spacing[6] },
  disclosure: {
    marginTop: Spacing[6],
    padding: Spacing[4],
    borderRadius: 16,
    backgroundColor: 'rgba(255, 215, 0, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  disclosureText: { color: Colors.text.secondary, lineHeight: 20 },
});
