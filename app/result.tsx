import { useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { HighlightedText } from '@/components/HighlightedText';
import { Icon } from '@/components/Icon';
import { IconCircle } from '@/components/IconCircle';
import { KeywordChip } from '@/components/KeywordChip';
import { useTheme } from '@/core/theme/theme';
import { formatRelativeDate, formatDuration } from '@/core/utils/format';
import {
  riskColor,
  riskColorFaint,
  riskLabel,
  riskLevelFromScore,
  toPercent,
} from '@/core/utils/riskLevel';
import { evidenceBullets, recommendedAction } from '@/data/mock/infoContent';
import { useCallStore } from '@/state/callStore';
import { useSettingsStore } from '@/state/settingsStore';
import type { CallResult } from '@/data/models/types';

type Tab = 'summary' | 'chat' | 'evidence';

export default function Result() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const getResult = useCallStore((s) => s.getResult);
  const dangerThreshold = useSettingsStore((s) => s.dangerThreshold);
  const [tab, setTab] = useState<Tab>('summary');

  const result = getResult(Number(params.id));

  if (!result) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <SafeAreaView edges={['top']} />
        <AppText color={colors.textMuted} style={{ fontSize: 14, textAlign: 'center' }}>
          통화 상세를 찾을 수 없습니다.{'\n'}(앱 재시작 후에는 목데이터/저장된 기록만 열람 가능)
        </AppText>
        <Pressable onPress={() => router.replace('/')} style={{ marginTop: 16 }}>
          <AppText weight="700" color={colors.primary} style={{ fontSize: 15 }}>
            홈으로
          </AppText>
        </Pressable>
      </View>
    );
  }

  const level = riskLevelFromScore(result.finalScore, dangerThreshold);
  const headerColor = riskColor(level, colors);
  const isRisk = level !== 'safe';

  const onShare = () => {
    void Share.share({
      message:
        `[VoiceGuard 분석 결과]\n` +
        `유형: ${result.category}\n` +
        `위험도: ${toPercent(result.finalScore)}% (${riskLabel(level)})\n` +
        `근거: ${result.coreEvidence}\n` +
        `키워드: ${result.keywords.join(', ') || '없음'}\n` +
        `일시: ${formatRelativeDate(result.createdAt)}`,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      {/* 헤더 */}
      <View style={{ backgroundColor: headerColor }}>
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable hitSlop={10} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
                <Icon name="chevron-left" size={26} color="#FFFFFF" />
              </Pressable>
              <AppText weight="800" color="#FFFFFF" style={{ fontSize: 19 }}>
                분석 결과
              </AppText>
            </View>
            <Pressable hitSlop={10} onPress={onShare} accessibilityLabel="공유">
              <Icon name="share" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 34 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={isRisk ? 'shield-alert' : 'shield-check'} size={16} color="#FFFFFF" />
              <AppText weight="600" color="#FFFFFF" style={{ fontSize: 13.5 }}>
                {isRisk ? '보이스피싱 의심' : '정상 통화'}
              </AppText>
            </View>
            <AppText weight="800" color="#FFFFFF" style={{ fontSize: 54, letterSpacing: -1, marginTop: 2 }}>
              {toPercent(result.finalScore)}%
            </AppText>
            <AppText weight="700" color="#FFFFFF" style={{ fontSize: 15, marginTop: 2 }}>
              {result.category}
            </AppText>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView style={{ flex: 1, marginTop: -20 }} contentContainerStyle={{ padding: 18, paddingTop: 0 }} showsVerticalScrollIndicator={false}>
        <Card padding={15} style={{ borderRadius: 22 }}>
          {/* 탭 */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 15 }}>
            {([
              ['summary', '요약'],
              ['chat', '대화 내용'],
              ['evidence', '탐지 근거'],
            ] as const).map(([key, label]) => {
              const active = tab === key;
              return (
                <Pressable key={key} style={{ flex: 1 }} onPress={() => setTab(key)}>
                  <View
                    style={{
                      paddingVertical: 9,
                      borderRadius: 11,
                      alignItems: 'center',
                      backgroundColor: active ? colors.primaryFaint : 'transparent',
                      borderWidth: active ? 0 : 1,
                      borderColor: colors.border,
                    }}
                  >
                    <AppText weight={active ? '700' : '600'} color={active ? colors.primary : colors.textSecondary} style={{ fontSize: 13.5 }}>
                      {label}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {tab === 'summary' ? <SummaryTab result={result} isRisk={isRisk} /> : null}
          {tab === 'chat' ? <ChatTab result={result} /> : null}
          {tab === 'evidence' ? <EvidenceTab result={result} level={level} /> : null}
        </Card>
      </ScrollView>
    </View>
  );
}

function SummaryTab({ result, isRisk }: { result: CallResult; isRisk: boolean }) {
  const { colors } = useTheme();
  const bullets = isRisk ? evidenceBullets(result.matchedPatterns) : [];

  return (
    <View style={{ gap: 15 }}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16 }}>
        <AppText weight="800" style={{ fontSize: 16, marginBottom: 14 }}>
          핵심 근거
        </AppText>
        {isRisk ? (
          <View style={{ gap: 14 }}>
            {bullets.map((b, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconCircle name="alert-octagon" color={colors.danger} bg={colors.dangerFaint} size={38} radius={10} iconSize={19} />
                <AppText weight="700" style={{ fontSize: 14.5, flex: 1 }}>
                  {b}
                </AppText>
              </View>
            ))}
            <AppText color={colors.textSecondary} style={{ fontSize: 13, lineHeight: 20, marginTop: 2 }}>
              {result.coreEvidence}
            </AppText>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconCircle name="check-circle" color={colors.safe} bg={colors.safeFaint} size={38} radius={10} iconSize={19} />
            <AppText weight="600" color={colors.textSecondary} style={{ fontSize: 13.5, flex: 1 }}>
              특별한 보이스피싱 위험 신호가 발견되지 않았습니다.
            </AppText>
          </View>
        )}
      </View>

      <View style={{ backgroundColor: colors.primaryFaint, borderRadius: 14, padding: 15 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <Icon name="volume" size={17} color={colors.primary} />
          <AppText weight="800" color={colors.primary} style={{ fontSize: 14 }}>
            권장 행동
          </AppText>
        </View>
        <AppText weight="500" color={colors.primary} style={{ fontSize: 13, lineHeight: 20 }}>
          {isRisk
            ? recommendedAction(result.category)
            : '정상적인 통화로 보입니다. 다만 개인정보·인증번호 요구에는 항상 주의하세요.'}
        </AppText>
      </View>
    </View>
  );
}

function ChatTab({ result }: { result: CallResult }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      {result.turns.length === 0 ? (
        <AppText color={colors.textMuted} style={{ fontSize: 13, textAlign: 'center' }}>
          저장된 대화 내용이 없습니다.
        </AppText>
      ) : (
        result.turns.map((t) => (
          <View key={t.turnIndex} style={{ alignItems: t.isMine ? 'flex-end' : 'flex-start' }}>
            <AppText color={colors.textMuted} style={{ fontSize: 11, marginBottom: 5 }}>
              {t.isMine ? '나' : '상대방'} · {formatDuration(t.atSec)}
            </AppText>
            <View
              style={{
                maxWidth: '82%',
                backgroundColor: t.isMine ? colors.primary : colors.cardAlt,
                paddingHorizontal: 13,
                paddingVertical: 11,
                borderRadius: 14,
                borderTopRightRadius: t.isMine ? 4 : 14,
                borderTopLeftRadius: t.isMine ? 14 : 4,
              }}
            >
              <HighlightedText
                text={t.content}
                keywords={t.keywords ?? []}
                baseColor={t.isMine ? '#FFFFFF' : colors.text}
                highlightColor={colors.warningText}
                highlightBg={colors.warningFaint}
                style={{ fontSize: 13.5, lineHeight: 20 }}
              />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function EvidenceTab({ result, level }: { result: CallResult; level: 'safe' | 'warning' | 'danger' }) {
  const { colors } = useTheme();
  const main = riskColor(level, colors);
  const sentences = result.turns.filter((t) => !t.isMine && (t.keywords?.length ?? 0) > 0);

  return (
    <View style={{ gap: 22 }}>
      {/* 범죄 유형 */}
      <View>
        <AppText weight="800" style={{ fontSize: 18 }}>
          범죄 유형
        </AppText>
        <View
          style={{
            backgroundColor: riskColorFaint(level, colors),
            borderRadius: 16,
            padding: 18,
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <AppText weight="700" style={{ fontSize: 15, lineHeight: 22, flex: 1 }}>
            해당 통화는{'\n'}"{result.category}"으로{'\n'}의심됩니다
          </AppText>
          <View
            style={{
              width: 66,
              height: 66,
              borderRadius: 33,
              backgroundColor: main,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText weight="600" color="#FFFFFF" style={{ fontSize: 11 }}>
              {riskLabel(level)}
            </AppText>
            <AppText weight="800" color="#FFFFFF" style={{ fontSize: 22 }}>
              {toPercent(result.finalScore)}
            </AppText>
          </View>
        </View>
      </View>

      {/* 의심되는 주요 단어 */}
      {result.keywords.length > 0 ? (
        <View>
          <AppText weight="800" style={{ fontSize: 18 }}>
            의심되는 주요 단어
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
            {result.keywords.map((k) => (
              <KeywordChip key={k} text={k} />
            ))}
          </View>
        </View>
      ) : null}

      {/* 주요 단어를 사용한 문장 */}
      {sentences.length > 0 ? (
        <View>
          <AppText weight="800" style={{ fontSize: 18 }}>
            주요 단어를 사용한 문장
          </AppText>
          <View style={{ gap: 10, marginTop: 14 }}>
            {sentences.map((t) => (
              <View key={t.turnIndex} style={{ backgroundColor: colors.cardAlt, borderRadius: 16, padding: 16 }}>
                <HighlightedText
                  text={t.content}
                  keywords={t.keywords ?? []}
                  baseColor={colors.textSecondary}
                  highlightColor={colors.text}
                  weightHighlight="700"
                  style={{ fontSize: 14, lineHeight: 24 }}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
