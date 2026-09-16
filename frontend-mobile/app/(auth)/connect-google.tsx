/**
 * Connect Google — fully translated (EN/FR/AR).
 */

import { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brain, ArrowRight, X } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { GlassCard } from '../../components/ui/GlassCard';
import { GlassButton } from '../../components/ui/GlassButton';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing } from '../../constants/spacing';
import { useT } from '../../hooks/useT';
import { useAuth } from '../../hooks/useAuth';

export default function ConnectGoogleScreen() {
  const router = useRouter();
  const { t } = useT();
  const { signInWithGoogle, isLoading } = useAuth();
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (connecting || isLoading) return;
    setConnecting(true);
    try {
      await signInWithGoogle();
      router.replace('/(tabs)');
    } catch (e: any) {
      // OAuth failure is non-fatal — the user can still continue as
      // anonymous. Surface the error so they aren't left wondering.
      if (__DEV__) console.warn('Google sign-in failed:', e?.message ?? e);
      Alert.alert(
        t('auth.signInFailedTitle'),
        t('auth.signInFailedBody')
      );
    } finally {
      setConnecting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.content}>
        <View style={styles.iconCircle}>
          <Brain size={64} color={Colors.gold.metallic} strokeWidth={1.5} />
        </View>

        <Text style={[Typography.displaySmall, styles.title]}>
          {t('auth.connectGoogleForAI')}
        </Text>
        <Text style={[Typography.bodyLarge, styles.subtitle]}>
          {t('auth.connectGoogleBody')}
        </Text>

        <GlassCard variant="elevated" style={styles.benefits}>
          <BenefitRow title={t('auth.benefitUseOwn')} description={t('auth.benefitUseOwnDesc')} />
          <BenefitRow title={t('auth.benefitNoCost')} description={t('auth.benefitNoCostDesc')} />
          <BenefitRow title={t('auth.benefitPrivacy')} description={t('auth.benefitPrivacyDesc')} />
          <BenefitRow title={t('auth.benefitCancel')} description={t('auth.benefitCancelDesc')} />
        </GlassCard>

        <View style={styles.actions}>
          <GlassButton
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleConnect}
            loading={connecting || isLoading}
            icon={<ArrowRight size={18} color="#FFFFFF" />}
          >
            {t('auth.connectGoogle')}
          </GlassButton>
          <GlassButton
            variant="ghost"
            fullWidth
            onPress={() => router.back()}
            icon={<X size={16} color={Colors.text.tertiary} />}
          >
            {t('auth.maybeLater')}
          </GlassButton>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const BenefitRow = ({ title, description }: { title: string; description: string }) => (
  <View style={styles.benefitRow}>
    <Text style={[Typography.bodyMedium, { color: Colors.gold.metallic }]}>{title}</Text>
    <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginTop: 2 }]}>{description}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    flex: 1,
    paddingHorizontal: Spacing[6],
    paddingVertical: Spacing[8],
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1, borderColor: 'rgba(255, 215, 0, 0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing[8],
  },
  title: { textAlign: 'center', marginTop: Spacing[4] },
  subtitle: { textAlign: 'center', color: Colors.text.secondary, marginTop: Spacing[3] },
  benefits: { width: '100%', padding: Spacing[5], gap: Spacing[4] },
  benefitRow: {},
  actions: { width: '100%', gap: Spacing[3] },
});
