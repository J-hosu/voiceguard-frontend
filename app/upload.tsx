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
import { categorizeType, extractKeywords } from '@/core/utils/keywords';
import type { CallResult, TranscriptTurn } from '@/data/models/types';
import { analyzeAudioFile } from '@/data/services/uploadAudio';
import { useCallStore } from '@/state/callStore';

function formatSize(bytes?: number | null): string {
  if (!bytes) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function Upload() {
  const { colors } = useTheme();
  const router = useRouter();
  const addResult = useCallStore((s) => s.addResult);
  const [file, setFile] = useState<{ name: string; size?: number; uri?: string; mime?: string } | null>(
    null,
  );
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
      setFile({ name: a.name, size: a.size ?? undefined, uri: a.uri, mime: a.mimeType ?? undefined });
      setProgress(0);
      setPhase('');
    }
  };

  const startProgressAnim = () => {
    timer.current = setInterval(() => {
      setProgress((p) => (p < 90 ? p + 3 : p));
    }, 220);
  };
  const stopProgressAnim = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const analyze = async () => {
    if (!file?.uri) {
      Alert.alert('파일 선택 필요', '분석할 음성 파일(mp3/wav/m4a)을 먼저 선택하세요.');
      return;
    }
    setAnalyzing(true);
    setProgress(0);
    startProgressAnim();

    try {
      // 원본 오디오를 백엔드로 업로드 → 백엔드가 CLOVA 화자분리 전사 + 위험도 채점을 한 번에 수행.
      // (프론트는 CLOVA를 직접 부르지 않음 = API 키 미노출)
      setPhase('업로드 · 화자분리 · 위험도 분석 중');
      const analysis = await analyzeAudioFile({ uri: file.uri, name: file.name, mime: file.mime });
      if (analysis.segments.length === 0) throw new Error('전사된 발화가 없습니다. 파일을 확인하세요.');

      // 화자 라벨별로 좌/우 표시 구분 (첫 화자=좌, 둘째 화자=우)
      const speakerSide = new Map<string, boolean>();
      const turns: TranscriptTurn[] = analysis.segments.map((s, i) => {
        if (!speakerSide.has(s.speaker)) speakerSide.set(s.speaker, speakerSide.size % 2 === 1);
        return {
          turnIndex: i + 1,
          role: s.speaker,
          isMine: speakerSide.get(s.speaker) ?? false,
          content: s.text,
          atSec: Math.round(s.start / 1000),
          keywords: extractKeywords(s.text, 4),
        };
      });

      stopProgressAnim();
      setProgress(100);

      const fullText = turns.map((t) => t.content).join('\n');
      const id = Math.floor(Date.now());
      const result: CallResult = {
        id,
        name: file.name,
        category: categorizeType(analysis.matchedPatterns, fullText),
        finalScore: analysis.riskScore,
        matchedPatterns: analysis.matchedPatterns,
        coreEvidence: analysis.coreEvidence || '분석된 위험 근거가 없습니다.',
        keywords: extractKeywords(fullText, 6),
        turns,
        source: 'file',
        createdAt: new Date().toISOString(),
        durationSec: Math.round((analysis.segments[analysis.segments.length - 1]?.end ?? 0) / 1000),
      };
      addResult(result);
      setTimeout(() => router.replace(`/result?id=${id}`), 250);
    } catch (e) {
      stopProgressAnim();
      setAnalyzing(false);
      setProgress(0);
      setPhase('');
      Alert.alert('분석 실패', `${e instanceof Error ? e.message : e}`);
    }
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
              MP3 · WAV · M4A · 3~5분 · 50MB 이하
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
                {analyzing ? phase || '처리 중' : '선택한 파일'}
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

          <InfoBanner text="업로드하면 CLOVA로 화자를 구분해 전사한 뒤, 백엔드 AI가 위험도를 분석합니다. 파일 길이에 따라 시간이 걸릴 수 있어요." />
        </View>

        <View style={{ padding: 20 }}>
          <Button
            title={analyzing ? phase || '분석 중...' : '분석 시작'}
            onPress={analyze}
            loading={analyzing}
            style={{ minHeight: 56 }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
