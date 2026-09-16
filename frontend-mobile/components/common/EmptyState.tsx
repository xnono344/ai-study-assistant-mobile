/**
 * EmptyState — reusable empty/placeholder state for screens and lists.
 * Centered icon (emoji or string), title, optional subtitle, and optional
 * action area for a CTA button.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing } from '../../constants/spacing';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  subtitle,
  action,
}) => (
  <View
    style={styles.container}
    accessible
    accessibilityRole="summary"
    accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
  >
    {icon ? <Text style={styles.icon}>{icon}</Text> : null}
    <Text style={[Typography.headlineSmall, styles.title]}>{title}</Text>
    {subtitle ? (
      <Text style={[Typography.bodyMedium, styles.subtitle]}>{subtitle}</Text>
    ) : null}
    {action ? <View style={styles.action}>{action}</View> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing[8],
    paddingHorizontal: Spacing[8],
  },
  icon: {
    fontSize: 64,
    marginBottom: Spacing[3],
  },
  title: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginTop: Spacing[2],
  },
  action: {
    marginTop: Spacing[4],
    alignSelf: 'stretch',
  },
});
