import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
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
import { fileSttEnabled, transcribeAudioFile } from '@/data/services/fileStt';
import { buildResultFromTranscript } from '@/data/services/resultBuilder';
import { useCallStore } from '@/state/callStore';

function formatSize(bytes?: number | null): string {
  if (!bytes) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function Upload() {
  const { colors } = useTheme();
  const router = useRouter();
  const addResult = useCallStore((s) => s.addResult);
  const [file, setFile] = useState<{ name: string; size?: number; uri?: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      setFile({ name: a.name, size: a.size ?? undefined, uri: a.uri });
      setProgress(0);
      setPhase('');
    }
  };

  // 목 폴백: 진행률 애니메이션 후 시나리오 결과로 이동
  const runMockAnalysis = (id: number) => {
    setPhase('분석 중');
    timer.current = setInterval(() => {
      setProgress((p) => {
        const next = p + 8;
        if (next >= 100) {
          if (timer.current) clearInterval(timer.current);
          const base = buildResultFromScenario(scenarioLoan, { id, daysAgo: 0 });
          addResult({ ...base, source: 'file', createdAt: new Date().toISOString() });
          setTimeout(() => router.replace(`/result?id=${id}`), 250);
          return 100;
        }
        return next;
      });
    }, 180);
  };

  const analyze = async () => {
    const id = Math.floor(Date.now());
    setAnalyzing(true);
    setProgress(0);

    if (fileSttEnabled) {
      if (!file?.uri) {
        setAnalyzing(false);
        Alert.alert('파일 선택 필요', '온디바이스 STT로 분석할 오디오 파일을 먼저 선택하세요.');
        return;
      }
      setPhase('음성 인식 모델 준비 중');
      const transcript = await transcribeAudioFile(file.uri, {
        onModelProgress: (p) => setProgress(Math.round(p * 100)),
        onTranscribeProgress: (p) => {
          setPhase('음성 전사 중');
          setProgress(Math.round(p * 100));
        },
      });
      if (transcript && transcript.text.trim()) {
        const result = buildResultFromTranscript(transcript, { id, source: 'file', phone: file.name });
        addResult(result);
        router.replace(`/result?id=${id}`);
        return;
      }
      Alert.alert(
        '온디바이스 전사 실패',
        'WAV(16kHz) 형식이 아니거나 인식에 실패했습니다. 데모 시나리오로 대체합니다.',
      );
    }

    // Expo Go / 목모드 / 전사 실패 → 목 시나리오
    if (!file) setFile({ name: 'call_demo.wav', size: 4.2 * 1024 * 1024 });
    runMockAnalysis(id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScreenHeader title="음성 파일 분석" />
        <View style={{ flex: 1, paddingHorizontal: 20, gap: 18 }}>
          <View style={{ backgroundColor: colors.primary, borderRadius: 20, padding: 30, alignItems: 'center' }}>
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

          {file ? (
            <View>
              <AppText weight="800" style={{ fontSize: 16, marginBottom: 11 }}>
                {analyzing ? (phase || '처리 중') : '선택한 파일'}
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

          <InfoBanner
            text={
              fileSttEnabled
                ? '온디바이스 Whisper로 파일을 전사한 뒤 위험도를 분석합니다. 최초 1회 모델 다운로드가 필요하며, 전사에 시간이 걸릴 수 있어요.'
                : '데모(목) 모드: 업로드 후 온디바이스 STT로 텍스트를 변환하고 위험도를 분석합니다. (실제 전사는 dev build에서 동작)'
            }
          />
        </View>

        <View style={{ padding: 20 }}>
          <Button
            title={analyzing ? (phase || '분석 중...') : '분석 시작'}
            onPress={analyze}
            loading={analyzing}
            style={{ minHeight: 56 }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
