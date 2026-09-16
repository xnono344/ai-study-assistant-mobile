/**
 * Settings — fully translated (EN/FR/AR). French default for Morocco.
 */

import { View, Text, StyleSheet, ScrollView, Switch, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import {
  Globe, Smartphone, LogOut, Trash2, Download, Bell, Shield, Info, Star, ExternalLink, Mail, Sparkles, RefreshCw,
} from 'lucide-react-native';
import { GlassCard } from '../../components/ui/GlassCard';
import { NexusLogo } from '../../components/ui/NexusLogo';
import { useAuth } from '../../hooks/useAuth';
import { useEntitlements } from '../../hooks/useEntitlements';
import { useT } from '../../hooks/useT';
import { purchasePackage, restorePurchases, getCustomerPortalUrl } from '../../lib/subscription';
import { setLanguage } from '../../lib/i18n';
import { api, getErrorMessage } from '../../lib/api';
import { useState, useEffect } from 'react';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing, Radius } from '../../constants/spacing';

const NOTIF_KEY = 'nexus_notification_prefs';
const BIOMETRIC_KEY = 'nexus_biometric_enabled';

// SECURITY: Mask the local part of an email so a shoulder-surfer or
// screenshot doesn't expose the full address. e.g. `alice@x.com` → `a****@x.com`.
const maskEmail = (email: string | undefined): string => {
  if (!email) return '';
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  return `${user[0]}${'*'.repeat(Math.min(user.length - 1, 5))}@${domain}`;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { t, i18n } = useT();
  const { user, signOut, disconnectGoogle } = useAuth();
  const { isPremium, isInGracePeriod, manualSync } = useEntitlements();
  const [language, setLang] = useState<'en' | 'fr' | 'ar'>(
    (i18n.language as 'en' | 'fr' | 'ar') || 'fr'
  );
  const [notifications, setNotifications] = useState({
    studyReminder: true,
    streakAlert: true,
    weeklyDigest: false,
  });
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  // Restore persisted toggles on mount. Stored values win over the in-memory
  // defaults so a user's choices survive app restarts.
  useEffect(() => {
    (async () => {
      try {
        const notifStored = await SecureStore.getItemAsync(NOTIF_KEY);
        if (notifStored) {
          const parsed = JSON.parse(notifStored);
          setNotifications((prev) => ({ ...prev, ...parsed }));
        }
      } catch {}
      try {
        const bioStored = await SecureStore.getItemAsync(BIOMETRIC_KEY);
        if (bioStored === 'true') setBiometricEnabled(true);
      } catch {}
    })();
  }, []);

  const handleNotifToggle = (key: keyof typeof notifications, value: boolean) => {
    setNotifications((n) => {
      const updated = { ...n, [key]: value };
      // Fire-and-forget — the UI update matters more than the write, and a
      // SecureStore failure shouldn't revert the user's preference.
      SecureStore.setItemAsync(NOTIF_KEY, JSON.stringify(updated)).catch(() => {});
      // Sync to backend (graceful failure — the local write is the source of
      // truth for this screen, and a network blip shouldn't revert the UI).
      api.notifications.updatePreferences(updated).catch((e) => {
        if (__DEV__) console.warn('[settings] notification sync failed:', e?.message ?? e);
      });
      return updated;
    });
  };

  const handleLanguageChange = async (lng: 'en' | 'fr' | 'ar') => {
    setLang(lng);
    await setLanguage(lng);
  };

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert(t('settings.biometricUnavailable'), t('settings.biometricUnavailableBody'));
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('settings.biometricLock'),
      });
      if (!result.success) return;
      setBiometricEnabled(true);
      // Note: Biometric lock requires integration with a top-level auth gate
      // (e.g. in app/_layout.tsx) that calls LocalAuthentication.authenticateAsync
      // on mount and on AppState change to 'active'. This toggle stores the
      // preference only. See TODO_BIOMETRIC_GATING.md for full implementation.
      SecureStore.setItemAsync(BIOMETRIC_KEY, 'true').catch(() => {});
    } else {
      setBiometricEnabled(false);
      SecureStore.setItemAsync(BIOMETRIC_KEY, 'false').catch(() => {});
    }
  };

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const result = await purchasePackage('monthly_premium');
      if (result) {
        await manualSync();
        Alert.alert(t('settings.welcomeToPremium'), t('settings.welcomeToPremiumBody'));
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setPurchasing(true);
    try {
      const result = await restorePurchases();
      if (result) {
        await manualSync();
        Alert.alert(t('common.success'), t('settings.welcomeToPremiumBody'));
      } else {
        Alert.alert(t('settings.noPurchasesFound'), t('settings.noPurchasesBody'));
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleManageSubscription = async () => {
    const url = await getCustomerPortalUrl();
    if (url) Linking.openURL(url);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.deleteAccountTitle'),
      t('settings.deleteAccountBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Use the shared API client so the auth token + X-Session-Id
              // header are sent automatically (raw fetch would skip the
              // bearer token and 401 the signed-in user).
              await api.account.delete();
              await signOut();
            } catch (e: any) {
              const { title, message } = getErrorMessage(e);
              Alert.alert(t(title), t(message));
            }
          },
        },
      ]
    );
  };

  const handleDisconnectGoogle = () => {
    Alert.alert(
      t('settings.disconnectGoogle'),
      t('settings.disconnectGoogleSubtitle'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.disconnectGoogle'),
          style: 'destructive',
          onPress: () => {
            // Same fire-and-forget pattern as signOut — keeps React 19
            // strict mode quiet if disconnect rejects.
            disconnectGoogle().catch((e) => {
              if (__DEV__) console.warn('[settings] disconnect failed:', e?.message ?? e);
            });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <NexusLogo size={40} />
          <View style={{ flex: 1 }}>
            <Text style={[Typography.displaySmall, { color: Colors.gold.metallic, fontSize: 28 }]}>
              {t('settings.title')}
            </Text>
            {user?.email && (
              <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]} numberOfLines={1}>
                {maskEmail(user.email)}
              </Text>
            )}
          </View>
        </View>

        {/* Account */}
        <Section title={t('settings.account')}>
          {!user?.isAnonymous && user?.googleConnected && (
            <SettingRow
              icon={LogOut}
              color={Colors.error}
              title={t('settings.disconnectGoogle')}
              subtitle={t('settings.disconnectGoogleSubtitle')}
              onPress={handleDisconnectGoogle}
              destructive
            />
          )}
          <SettingRow
            icon={LogOut}
            color={Colors.text.secondary}
            title={t('settings.signOut')}
            subtitle={t('settings.signOutSubtitle')}
            onPress={() => {
              // Fire-and-forget — signOut does its own per-step try/catch,
              // but wrap the call so a stray rejection can't bubble up as an
              // unhandled promise rejection in React 19 strict mode.
              signOut().catch((e) => {
                if (__DEV__) console.warn('[settings] signOut failed:', e?.message ?? e);
              });
            }}
          />
        </Section>

        {/* Subscription */}
        <Section title={t('settings.subscription')}>
          {isPremium || isInGracePeriod ? (
            <>
              <SettingRow
                icon={Sparkles}
                color={Colors.gold.metallic}
                title={isInGracePeriod ? t('settings.renewPremium') : t('settings.premiumActive')}
                subtitle={isInGracePeriod ? t('settings.renewSubtitle') : t('settings.premiumActiveSubtitle')}
                onPress={handleManageSubscription}
              />
              <SettingRow
                icon={Star}
                color={Colors.text.secondary}
                title={t('settings.manageSubscription')}
                subtitle={t('settings.manageSubtitle')}
                onPress={handleManageSubscription}
                showChevron
              />
            </>
          ) : (
            <>
              <SettingRow
                icon={Star}
                color={Colors.gold.metallic}
                title={purchasing ? t('common.loading') : t('settings.upgradeToPremium')}
                subtitle={t('settings.premiumSubtitle')}
                onPress={purchasing ? undefined : handlePurchase}
              />
              <SettingRow
                icon={RefreshCw}
                color={Colors.text.secondary}
                title={purchasing ? t('common.loading') : t('settings.restorePurchases')}
                subtitle={t('settings.restoreSubtitle')}
                onPress={purchasing ? undefined : handleRestore}
              />
            </>
          )}
        </Section>

        {/* Appearance */}
        <Section title={t('settings.appearance')}>
          <View style={styles.langRow}>
            <Text style={[Typography.bodyMedium, { color: '#FFFFFF' }]}>
              <Globe size={16} color={Colors.text.tertiary} />  {t('settings.language')}
            </Text>
            <View style={styles.langOptions}>
              {([
                { code: 'en', label: 'English' },
                { code: 'fr', label: 'Français' },
                { code: 'ar', label: 'العربية' },
              ] as const).map((lng) => (
                <Pressable
                  key={lng.code}
                  onPress={() => handleLanguageChange(lng.code)}
                  style={[styles.langChip, language === lng.code && styles.langChipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={lng.label}
                  accessibilityState={{ selected: language === lng.code }}
                >
                  <Text style={[
                    Typography.labelSmall,
                    { color: language === lng.code ? Colors.gold.metallic : Colors.text.tertiary },
                  ]}>
                    {lng.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Section>

        {/* Notifications */}
        <Section title={t('settings.notifications')}>
          <ToggleRow
            icon={Bell}
            title={t('settings.studyReminder')}
            subtitle={t('settings.studyReminderSubtitle')}
            value={notifications.studyReminder}
            onChange={(v) => handleNotifToggle('studyReminder', v)}
          />
          <ToggleRow
            icon={Bell}
            title={t('settings.streakAlert')}
            subtitle={t('settings.streakAlertSubtitle')}
            value={notifications.streakAlert}
            onChange={(v) => handleNotifToggle('streakAlert', v)}
          />
          <ToggleRow
            icon={Bell}
            title={t('settings.weeklyDigest')}
            subtitle={t('settings.weeklyDigestSubtitle')}
            value={notifications.weeklyDigest}
            onChange={(v) => handleNotifToggle('weeklyDigest', v)}
          />
        </Section>

        {/* Security */}
        <Section title={t('settings.security')}>
          <ToggleRow
            icon={Smartphone}
            title={t('settings.biometricLock')}
            subtitle={t('settings.biometricSubtitle')}
            value={biometricEnabled}
            onChange={handleBiometricToggle}
          />
          <SettingRow
            icon={Shield}
            color={Colors.text.secondary}
            title={t('settings.privacyPolicy')}
            onPress={() => Linking.openURL('https://nexusstudy.app/privacy')}
            showChevron
          />
          <SettingRow
            icon={Shield}
            color={Colors.text.secondary}
            title={t('settings.termsOfService')}
            onPress={() => Linking.openURL('https://nexusstudy.app/terms')}
            showChevron
          />
          <SettingRow
            icon={Mail}
            color={Colors.text.secondary}
            title={t('settings.contactSupport')}
            onPress={() => Linking.openURL('mailto:support@nexusstudy.app')}
            showChevron
          />
        </Section>

        {/* Data */}
        <Section title={t('settings.data')}>
          <SettingRow
            icon={Download}
            color={Colors.text.secondary}
            title={t('settings.exportData')}
            subtitle={t('settings.exportSubtitle')}
            onPress={() => Alert.alert(t('settings.exportComingSoon'), t('settings.exportComingSoonBody'))}
          />
          <SettingRow
            icon={Trash2}
            color={Colors.error}
            title={t('settings.deleteAccount')}
            subtitle={t('settings.deleteAccountSubtitle')}
            onPress={handleDeleteAccount}
            destructive
          />
        </Section>

        {/* About */}
        <Section title={t('settings.about')}>
          <SettingRow
            icon={Info}
            color={Colors.text.secondary}
            title={t('settings.version')}
            value="0.1.0"
          />
          <SettingRow
            icon={Star}
            color={Colors.gold.metallic}
            title={t('settings.rateApp')}
            onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.nexusstudy.app')}
            showChevron
          />
          <SettingRow
            icon={ExternalLink}
            color={Colors.text.secondary}
            title={t('settings.visitWebsite')}
            onPress={() => Linking.openURL('https://nexusstudy.app')}
            showChevron
          />
          <SettingRow
            icon={Sparkles}
            color={Colors.gold.metallic}
            title={t('settings.showOnboardingAgain')}
            onPress={() => router.push('/(auth)/onboarding')}
            showChevron
          />
        </Section>

        <Text style={styles.footer}>
          {t('settings.footer')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={{ marginTop: Spacing[4] }}>
    <Text style={[Typography.labelSmall, { color: Colors.text.tertiary, marginBottom: Spacing[2], paddingHorizontal: Spacing[1] }]}>
      {title.toUpperCase()}
    </Text>
    <GlassCard variant="default">
      {children}
    </GlassCard>
  </View>
);

const SettingRow = ({
  icon: Icon,
  color = Colors.text.secondary,
  title,
  subtitle,
  value,
  onPress,
  destructive,
  showChevron,
}: {
  icon: any;
  color?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    accessibilityRole="button"
    accessibilityLabel={title}
  >
    <View style={[styles.rowIcon, { backgroundColor: `${color}15` }]}>
      <Icon size={18} color={color} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[
        Typography.bodyMedium,
        { color: destructive ? Colors.error : '#FFFFFF' },
      ]}>
        {title}
      </Text>
      {subtitle && (
        <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginTop: 2 }]}>
          {subtitle}
        </Text>
      )}
    </View>
    {value && (
      <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary }]}>{value}</Text>
    )}
    {showChevron && <ExternalLink size={14} color={Colors.text.tertiary} />}
  </Pressable>
);

const ToggleRow = ({
  icon: Icon,
  title,
  subtitle,
  value,
  onChange,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) => (
  <View style={styles.row}>
    <View style={[styles.rowIcon, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
      <Icon size={18} color={Colors.purple[300]} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[Typography.bodyMedium, { color: '#FFFFFF' }]}>{title}</Text>
      {subtitle && (
        <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginTop: 2 }]}>
          {subtitle}
        </Text>
      )}
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: 'rgba(255, 255, 255, 0.1)', true: Colors.purple[500] }}
      thumbColor={value ? '#FFFFFF' : '#999'}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: Spacing[4],
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[3],
    gap: Spacing[3],
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langRow: {
    paddingVertical: Spacing[3],
    gap: Spacing[3],
  },
  langOptions: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  langChip: {
    flex: 1,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
  },
  langChipActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderColor: Colors.gold.metallic,
  },
  footer: {
    color: Colors.text.tertiary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing[8],
  },
});
