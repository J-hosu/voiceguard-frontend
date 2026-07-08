import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/core/theme/theme';
import { useAppStore } from '@/state/appStore';
import { useCallStore } from '@/state/callStore';
import { useSettingsStore } from '@/state/settingsStore';

export default function RootLayout() {
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateApp = useAppStore((s) => s.hydrate);
  const hydrateCalls = useCallStore((s) => s.hydrate);
  const { colors, isDark } = useTheme();

  useEffect(() => {
    void hydrateSettings();
    void hydrateApp();
    void hydrateCalls();
  }, [hydrateSettings, hydrateApp, hydrateCalls]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="upload" />
          <Stack.Screen name="realtime" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="result" />
          <Stack.Screen name="prevention" />
          <Stack.Screen name="settings" />
          <Stack.Screen
            name="warning"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
