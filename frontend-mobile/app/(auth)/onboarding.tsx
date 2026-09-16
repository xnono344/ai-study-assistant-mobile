/**
 * Onboarding — first launch flow with welcome + connect Google + permissions.
 * Fully translated (EN/FR/AR).
 */

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, SlideInRight } from 'react-native-reanimated';
import { Sparkles, BookOpen, Bell, Brain } from 'lucide-react-native';
import { NexusLogo } from '../../components/ui/NexusLogo';
import { GlassButton } from '../../components/ui/GlassButton';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing } from '../../constants/spacing';
import { useT } from '../../hooks/useT';

const STEPS = [
  { id: 'welcome', icon: Sparkles, titleKey: 'onboarding.step1Title', subtitleKey: 'onboarding.step1Subtitle', colorKey: 'purple' as const },
  { id: 'google', icon: Brain, titleKey: 'onboarding.step2Title', subtitleKey: 'onboarding.step2Subtitle', colorKey: 'gold' as const },
  { id: 'features', icon: BookOpen, titleKey: 'onboarding.step3Title', subtitleKey: 'onboarding.step3Subtitle', colorKey: 'blue' as const },
  { id: 'notifications', icon: Bell, titleKey: 'onboarding.step4Title', subtitleKey: 'onboarding.step4Subtitle', colorKey: 'success' as const },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useT();
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const dotColor = current.colorKey === 'purple' ? Colors.purple[400]
    : current.colorKey === 'gold' ? Colors.gold.metallic
    : current.colorKey === 'blue' ? '#60A5FA'
    : Colors.success;

  const handleNext = () => {
    if (isLast) {
      router.replace('/(auth)/signin');
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(600)} style={styles.logoContainer}>
          <NexusLogo size={120} showWordmark />
        </Animated.View>

        <Animated.View
          key={current.id}
          entering={SlideInRight.duration(400).springify()}
          exiting={FadeOut.duration(200)}
          style={styles.stepContainer}
        >
          <View style={[styles.iconCircle, { backgroundColor: `${dotColor}20`, borderColor: `${dotColor}40` }]}>
            <Icon size={48} color={dotColor} strokeWidth={1.5} />
          </View>
          <Text style={[Typography.displaySmall, styles.title]}>
            {t(current.titleKey)}
          </Text>
          <Text style={[Typography.bodyLarge, styles.subtitle]}>
            {t(current.subtitleKey)}
          </Text>
        </Animated.View>

        {/* Dots indicator */}
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === step ? dotColor : 'rgba(255, 255, 255, 0.2)',
                  width: i === step ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          {step > 0 && (
            <GlassButton variant="secondary" onPress={() => setStep((s) => s - 1)}>
              {t('common.back')}
            </GlassButton>
          )}
          <GlassButton
            variant={isLast ? 'gold' : 'primary'}
            onPress={handleNext}
            fullWidth
            size="lg"
          >
            {isLast ? t('common.getStarted') : t('common.next')}
          </GlassButton>
        </View>

        {step === 0 && (
          <GlassButton
            variant="ghost"
            onPress={() => router.replace('/(auth)/signin')}
            fullWidth
            style={{ marginTop: Spacing[2] }}
          >
            {t('common.skip')}
          </GlassButton>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[8],
    paddingBottom: Spacing[8],
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing[8],
  },
  stepContainer: {
    alignItems: 'center',
    width: '100%',
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[6],
    borderWidth: 1,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing[4],
  },
  subtitle: {
    textAlign: 'center',
    paddingHorizontal: Spacing[2],
    color: Colors.text.secondary,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: Spacing[8],
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  actions: {
    width: '100%',
    gap: Spacing[3],
  },
});
