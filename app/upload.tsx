import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { IconCircle } from '@/components/IconCircle';
import { InfoBanner } from '@/components/InfoBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/core/theme/theme';
import { buildResultFromScenario } from '@/data/mock/mockResults';
import { scenarioLoan } from '@/data/mock/mockScenarios';
import { useCallStore } from '@/state/callStore';

function formatSize(bytes?: number | null): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}

export default function Upload() {
  const { colors } = useTheme();
  const router = useRouter();
  const addResult = useCallStore((s) => s.addResult);
  const [file, setFile] = useState<{ name: string; size?: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      setFile({ name: a.name, size: a.size ?? undefined });
      setProgress(0);
    }
  };

  const analyze = () => {
    const target = file ?? { name: 'call_demo.m4a', size: 4.2 * 1024 * 1024 };
    if (!file) setFile(target);
    setAnalyzing(true);
    setProgress(0);
    timer.current = setInterval(() => {
      setProgress((p) => {
        const next = p + 8;
        if (next >= 100) {
          if (timer.current) clearInterval(timer.current);
          // 온디바이스 STT 우회: 스크립트 전사본을 분석 파이프라인에 통과시켜 결과 생성
          const id = Math.floor(Date.now());
          const base = buildResultFromScenario(scenarioLoan, { id, daysAgo: 0 });
          addResult({ ...base, source: 'file', createdAt: new Date().toISOString() });
          setTimeout(() => router.replace(`/result?id=${id}`), 250);
          return 100;
        }
        return next;
      });
    }, 180);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScreenHeader title="음성 파일 분석" />
        <View style={{ flex: 1, paddingHorizontal: 20, gap: 18 }}>
          {/* 드롭존 */}
          <View
            style={{
              backgroundColor: colors.primary,
              borderRadius: 20,
              padding: 30,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 62,
                height: 62,
                borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Icon name="upload" size={30} color="#FFFFFF" />
            </View>
            <AppText weight="800" color="#FFFFFF" style={{ fontSize: 18 }}>
              여기로 파일을 올려주세요
            </AppText>
            <AppText weight="600" color="rgba(255,255,255,0.85)" style={{ fontSize: 12.5, marginTop: 7 }}>
              MP3 · WAV · 3~5분 · 50MB 이하
            </AppText>
            <Button
              title="파일 선택"
              variant="white"
              onPress={pick}
              style={{ marginTop: 18, minHeight: 44, paddingHorizontal: 28, alignSelf: 'center' }}
            />
          </View>

          {/* 업로드/전사 상태 */}
          {file ? (
            <View>
              <AppText weight="800" style={{ fontSize: 16, marginBottom: 11 }}>
                {analyzing ? '전사 진행률' : '선택한 파일'}
              </AppText>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <IconCircle name="file" color={colors.primary} bg={colors.primaryFaint} size={40} radius={11} iconSize={20} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="700" style={{ fontSize: 14.5 }} numberOfLines={1}>
                      {file.name}
                    </AppText>
                    <AppText color={colors.textMuted} style={{ fontSize: 12, marginTop: 2 }}>
                      {formatSize(file.size)}
                    </AppText>
                  </View>
                  <AppText weight="800" color={colors.primary} style={{ fontSize: 16 }}>
                    {progress}%
                  </AppText>
                </View>
                <View style={{ height: 7, borderRadius: 4, backgroundColor: colors.cardAlt, marginTop: 13, overflow: 'hidden' }}>
                  <View style={{ width: `${progress}%`, height: '100%', borderRadius: 4, backgroundColor: colors.primary }} />
                </View>
              </Card>
            </View>
          ) : null}

          <InfoBanner text="업로드 후 온디바이스 STT로 텍스트를 변환하고 위험도를 분석합니다. 30초~1분 정도 걸릴 수 있어요." />
        </View>

        <View style={{ padding: 20 }}>
          <Button
            title={analyzing ? '분석 중...' : '분석 시작'}
            onPress={analyze}
            loading={analyzing}
            style={{ minHeight: 56 }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
