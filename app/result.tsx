import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, View } from 'react-native';
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
import { extractKeywords } from '@/core/utils/keywords';
import { formatRelativeDate } from '@/core/utils/format';
import {
  riskColor,
  riskColorFaint,
  riskLabel,
  riskLevelFromScore,
  toPercent,
} from '@/core/utils/riskLevel';
import { evidenceBullets, recommendedAction } from '@/data/mock/infoContent';
import { fetchCallDetail, fetchCallMessages, type CallDetail } from '@/data/services/callsApi';
import { useCallStore } from '@/state/callStore';
import { useSettingsStore } from '@/state/settingsStore';
import { useTranscriptStore } from '@/state/transcriptStore';

type Tab = 'summary' | 'chat' | 'evidence';

/** 대화 내용 탭 표시용 발화 1건(백엔드 조회 또는 로컬 fallback 공통 형태) */
interface ChatMessage {
  turnIndex: number;
  content: string;
  keywords?: string[];
}

/** 백엔드 목록 항목 + 상세를 합친 결과 화면 뷰모델 */
interface ResultView {
  category: string; // phishing_type
  score: number; // 0..1 (목록 risk_score)
  matchedPatterns: string[];
  coreEvidence: string;
  createdAt: string;
}

export default function Result() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; score?: string; tab?: string }>();
  const id = Number(params.id);
  const initialTab: Tab = params.tab === 'chat' || params.tab === 'evidence' ? params.tab : 'summary';
  // 분석 직후엔 목록 재조회 전이라 point가 없을 수 있어, 넘어온 score를 초기값으로 사용.
  const paramScore = Number(params.score);

  const calls = useCallStore((s) => s.calls);
  const loaded = useCallStore((s) => s.loaded);
  const fetchCalls = useCallStore((s) => s.fetchCalls);
  const dangerThreshold = useSettingsStore((s) => s.dangerThreshold);
  // 통화별 전사(로컬 저장) — 백엔드 조회가 실패했을 때만 쓰는 fallback.
  const hydrateTranscripts = useTranscriptStore((s) => s.hydrate);
  const localTurns = useTranscriptStore((s) => (Number.isFinite(id) ? s.byLog[id] : undefined)) ?? [];

  const [tab, setTab] = useState<Tab>(initialTab);
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 대화 내용: 백엔드 GET /calls/{id}/messages 가 주 소스. null=아직 못 받아옴(로컬 fallback 사용).
  const [backendMessages, setBackendMessages] = useState<ChatMessage[] | null>(null);

  // 목록이 아직 없으면 백엔드에서 받아온다(딥링크/새로고침 대비).
  useEffect(() => {
    if (!loaded) void fetchCalls();
  }, [loaded, fetchCalls]);

  // 로컬 전사 저장분 로드 — 백엔드 조회가 실패할 때만 쓰는 fallback이라 미리 준비해둔다.
  useEffect(() => {
    void hydrateTranscripts();
  }, [hydrateTranscripts]);

  // 대화 내용(전사) 조회: 통화 종료 직후 백엔드가 마지막 발화까지 저장을 마칠 시간이
  // 필요할 수 있어(실시간 경로), 재시도 없이 1회만 조회하고 실패하면 로컬 fallback을 쓴다.
  useEffect(() => {
    let alive = true;
    if (!Number.isFinite(id)) return;
    fetchCallMessages(id)
      .then((res) => {
        if (!alive) return;
        const mapped: ChatMessage[] = res.messages
          .map((m) => ({
            turnIndex: m.turn_index,
            content: (m.content ?? '').trim(),
            keywords: extractKeywords(m.content ?? '', 4),
          }))
          .filter((m) => m.content.length > 0);
        setBackendMessages(mapped);
      })
      .catch(() => {
        if (alive) setBackendMessages(null);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const localMessages: ChatMessage[] = localTurns.map((t) => ({
    turnIndex: t.turnIndex,
    content: t.content,
    keywords: t.keywords,
  }));
  const chatMessages = backendMessages && backendMessages.length > 0 ? backendMessages : localMessages;

  // 상세(근거) 조회
  useEffect(() => {
    let alive = true;
    if (!Number.isFinite(id)) {
      setError('잘못된 통화 ID입니다.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    fetchCallDetail(id)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const listItem = calls.find((c) => c.id === id);

  const view: ResultView = {
    category: detail?.phishing_type || listItem?.phishing_type || '분석 결과',
    score: listItem?.risk_score ?? (Number.isFinite(paramScore) ? paramScore : 0),
    matchedPatterns: detail?.matched_patterns ?? [],
    coreEvidence: detail?.core_evidence ?? '',
    createdAt: listItem?.called_at ?? '',
  };

  const level = riskLevelFromScore(view.score, dangerThreshold);
  const headerColor = riskColor(level, colors);
  const isRisk = level !== 'safe';

  const onShare = () => {
    void Share.share({
      message:
        `[VoiceGuard 분석 결과]\n` +
        `유형: ${view.category}\n` +
        `위험도: ${toPercent(view.score)}% (${riskLabel(level)})\n` +
        `근거: ${view.coreEvidence}\n` +
        `일시: ${formatRelativeDate(view.createdAt)}`,
    });
  };

  if (loading && !detail) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <SafeAreaView edges={['top']} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error && !detail) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <SafeAreaView edges={['top']} />
        <AppText color={colors.danger} style={{ fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
          통화 상세를 불러오지 못했습니다.{'\n'}{error}
        </AppText>
        <Pressable onPress={() => router.replace('/')} style={{ marginTop: 16 }}>
          <AppText weight="700" color={colors.primary} style={{ fontSize: 15 }}>
            홈으로
          </AppText>
        </Pressable>
      </View>
    );
  }

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
              {toPercent(view.score)}%
            </AppText>
            <AppText weight="700" color="#FFFFFF" style={{ fontSize: 15, marginTop: 2 }}>
              {view.category}
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

          {tab === 'summary' ? <SummaryTab view={view} isRisk={isRisk} /> : null}
          {tab === 'chat' ? <ChatTab turns={chatMessages} /> : null}
          {tab === 'evidence' ? <EvidenceTab view={view} level={level} /> : null}
        </Card>
      </ScrollView>
    </View>
  );
}

function SummaryTab({ view, isRisk }: { view: ResultView; isRisk: boolean }) {
  const { colors } = useTheme();
  const bullets = isRisk ? evidenceBullets(view.matchedPatterns) : [];

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
              {view.coreEvidence || '분석된 위험 근거가 없습니다.'}
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
            ? recommendedAction(view.category)
            : '정상적인 통화로 보입니다. 다만 개인정보·인증번호 요구에는 항상 주의하세요.'}
        </AppText>
      </View>
    </View>
  );
}

/**
 * 대화 내용(전사) 탭.
 * 백엔드 GET /calls/{id}/messages 로 저장된 전체 발화를 turn_index 순서대로 표시한다.
 * (화자 구분은 신뢰성이 낮아 라벨/좌우 구분 없이 발화 순서대로 그대로 출력)
 * 조회 실패 시에만 로컬 저장분(fallback)을 대신 보여주며, 그마저 없으면 안내문을 표시한다.
 */
function ChatTab({ turns }: { turns: ChatMessage[] }) {
  const { colors } = useTheme();

  if (turns.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 26, gap: 8 }}>
        <IconCircle name="file" color={colors.textMuted} bg={colors.cardAlt} size={44} radius={12} iconSize={22} />
        <AppText weight="700" color={colors.textSecondary} style={{ fontSize: 14 }}>
          저장된 대화 내용이 없습니다
        </AppText>
        <AppText color={colors.textMuted} style={{ fontSize: 12.5, textAlign: 'center', lineHeight: 19 }}>
          분석이 아직 끝나지 않았거나, 대화 내역을 불러오지 못했습니다.
        </AppText>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {turns.map((t) => (
        <View
          key={t.turnIndex}
          style={{
            backgroundColor: colors.cardAlt,
            paddingHorizontal: 14,
            paddingVertical: 11,
            borderRadius: 12,
          }}
        >
          <HighlightedText
            text={t.content}
            keywords={t.keywords ?? []}
            baseColor={colors.text}
            highlightColor={colors.primary}
            weightHighlight="700"
            style={{ fontSize: 14, lineHeight: 22 }}
          />
        </View>
      ))}
    </View>
  );
}

function EvidenceTab({ view, level }: { view: ResultView; level: 'safe' | 'warning' | 'danger' }) {
  const { colors } = useTheme();
  const main = riskColor(level, colors);
  // 백엔드는 단어 위치를 주지 않으므로 핵심근거 문장에서 키워드를 근사 추출.
  const keywords = extractKeywords(view.coreEvidence, 6);

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
            해당 통화는{'\n'}"{view.category}"으로{'\n'}의심됩니다
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
              {toPercent(view.score)}
            </AppText>
          </View>
        </View>
      </View>

      {/* 탐지된 패턴 */}
      {view.matchedPatterns.length > 0 ? (
        <View>
          <AppText weight="800" style={{ fontSize: 18 }}>
            탐지된 위험 패턴
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
            {view.matchedPatterns.map((p) => (
              <KeywordChip key={p} text={p} />
            ))}
          </View>
        </View>
      ) : null}

      {/* 의심되는 주요 단어 (근거 문장에서 근사) */}
      {keywords.length > 0 ? (
        <View>
          <AppText weight="800" style={{ fontSize: 18 }}>
            의심되는 주요 단어
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
            {keywords.map((k) => (
              <KeywordChip key={k} text={k} />
            ))}
          </View>
        </View>
      ) : null}

      {/* 핵심 근거 문장 */}
      {view.coreEvidence ? (
        <View>
          <AppText weight="800" style={{ fontSize: 18 }}>
            핵심 근거
          </AppText>
          <View style={{ backgroundColor: colors.cardAlt, borderRadius: 16, padding: 16, marginTop: 14 }}>
            <HighlightedText
              text={view.coreEvidence}
              keywords={keywords}
              baseColor={colors.textSecondary}
              highlightColor={colors.text}
              weightHighlight="700"
              style={{ fontSize: 14, lineHeight: 24 }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
