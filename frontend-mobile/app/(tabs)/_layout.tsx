/**
 * Tabs layout — MagicalTabBar at bottom, Stack-based nav for each tab.
 */

import { useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { MagicalTabBar } from '../../components/common/MagicalTabBar';
import { Colors } from '../../constants/colors';

export default function TabsLayout() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tabWidth = width / 5;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' }, // Hide default, use MagicalTabBar
          sceneStyle: { backgroundColor: Colors.background },
        }}
        screenListeners={{
          state: (e) => {
            const route = e.data.state.routes[e.data.state.index];
            setActiveTab(route.name);
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="lessons" options={{ title: 'Lessons' }} />
        <Tabs.Screen name="practice" options={{ title: 'Practice' }} />
        <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
      <MagicalTabBar
        activeTab={activeTab}
        onTabPress={(name) => {
          setActiveTab(name);
          // Map the user-facing tab name ('dashboard') to the actual route
          // name ('index') before navigating. Done via switch instead of
          // template-literal HREF concatenation so expo-router 5 typed routes
          // can validate the target at build time.
          const routeName = name === 'dashboard' ? 'index' : name;
          router.navigate(`/(tabs)/${routeName}` as any);
        }}
        tabWidth={tabWidth}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});