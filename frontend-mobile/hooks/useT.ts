/**
 * useT — convenience hook for i18n translations.
 * Falls back to English if translation is missing.
 *
 * Usage:
 *   const { t } = useT();
 *   <Text>{t('dashboard.title')}</Text>
 *   <Text>{t('auth.welcomeBack', { name: 'Ahmed' })}</Text>
 *   <Text>{t('lessons.lessonsCount', { count: 5 })}</Text>
 */

import { useTranslation } from 'react-i18next';

export function useT() {
  const { t, i18n } = useTranslation();
  return { t, i18n, locale: i18n.language };
}
