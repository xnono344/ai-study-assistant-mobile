/**
 * 404 / Not Found screen.
 * Respects the active i18n locale so the user sees their language.
 */

import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Compass } from 'lucide-react-native';
import { GlassButton } from '../components/ui/GlassButton';
import { useT } from '../hooks/useT';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Spacing } from '../constants/spacing';

export default function NotFoundScreen() {
  const router = useRouter();
  const { t } = useT();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Compass size={64} color={Colors.gold.metallic} />
        <Text style={[Typography.displaySmall, { color: Colors.gold.metallic, marginTop: Spacing[4], textAlign: 'center' }]}>
          404
        </Text>
        <Text style={[Typography.headlineSmall, { color: '#FFFFFF', marginTop: Spacing[2], textAlign: 'center' }]}>
          {t('notFound.title')}
        </Text>
        <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary, marginTop: Spacing[2], textAlign: 'center' }]}>
          {t('notFound.subtitle')}
        </Text>
        <GlassButton
          variant="primary"
          onPress={() => router.replace('/(tabs)')}
          style={{ marginTop: Spacing[6] }}
        >
          {t('notFound.goHome')}
        </GlassButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[8],
  },
});