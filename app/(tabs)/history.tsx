import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { CallCard } from '@/components/CallCard';
import { Card } from '@/components/Card';
import { useTheme } from '@/core/theme/theme';
import { riskColorText, riskColorFaint, riskLevelFromScore, type RiskLevel } from '@/core/utils/riskLevel';
import { useCallStore } from '@/state/callStore';
import { useSettingsStore } from '@/state/settingsStore';

type Filter = 'all' | RiskLevel;

export default function History() {
  const { colors } = useTheme();
  const router = useRouter();
  const results = useCallStore((s) => s.results);
  const dangerThreshold = useSettingsStore((s) => s.dangerThreshold);
  const [filter, setFilter] = useState<Filter>('all');

  const withLevel = results.map((r) => ({
    r,
    level: riskLevelFromScore(r.finalScore, dangerThreshold),
  }));
  const counts = {
    danger: withLevel.filter((x) => x.level === 'danger').length,
    warning: withLevel.filter((x) => x.level === 'warning').length,
    safe: withLevel.filter((x) => x.level === 'safe').length,
  };
  const shown = withLevel.filter((x) => filter === 'all' || x.level === filter);

  const boxes: { key: RiskLevel; label: string; count: number }[] = [
    { key: 'danger', label: '위험', count: counts.danger },
    { key: 'warning', label: '주의', count: counts.warning },
    { key: 'safe', label: '정상', count: counts.safe },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 }}>
          <AppText weight="800" style={{ fontSize: 26 }}>
            히스토리
          </AppText>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {boxes.map((b) => {
              const active = filter === b.key;
              const textCol = riskColorText(b.key, colors);
              return (
                <Pressable
                  key={b.key}
                  style={{ flex: 1 }}
                  onPress={() => setFilter(active ? 'all' : b.key)}
                >
                  <View
                    style={{
                      backgroundColor: riskColorFaint(b.key, colors),
                      borderRadius: 14,
                      paddingVertical: 16,
                      alignItems: 'center',
                      borderWidth: 2,
                      borderColor: active ? textCol : 'transparent',
                    }}
                  >
                    <AppText weight="800" color={textCol} style={{ fontSize: 24 }}>
                      {b.count}
                    </AppText>
                    <AppText weight="600" color={textCol} style={{ fontSize: 12.5, marginTop: 2 }}>
                      {b.label}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {filter !== 'all' ? (
            <Pressable onPress={() => setFilter('all')} style={{ alignSelf: 'flex-start' }}>
              <AppText weight="600" color={colors.primary} style={{ fontSize: 13 }}>
                전체 보기 ✕
              </AppText>
            </Pressable>
          ) : null}

          {shown.length === 0 ? (
            <Card>
              <AppText color={colors.textMuted} style={{ fontSize: 13, textAlign: 'center' }}>
                해당하는 통화 내역이 없습니다.
              </AppText>
            </Card>
          ) : (
            shown.map(({ r }) => (
              <CallCard key={r.id} result={r} onPress={() => router.push(`/result?id=${r.id}`)} />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
