/**
 * Auth stack — sign-in, connect Google, onboarding, legal.
 */

import { Stack } from 'expo-router';
import { Colors } from '../../constants/colors';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="signin" />
      <Stack.Screen name="connect-google" />
      <Stack.Screen name="callback" />
      <Stack.Screen name="legal" />
    </Stack>
  );
}
