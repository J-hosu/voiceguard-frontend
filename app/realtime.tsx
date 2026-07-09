import { useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, ScrollView, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/AppText';
import { HighlightedText } from '@/components/HighlightedText';
import { Icon, type IconName } from '@/components/Icon';
import { RiskGauge } from '@/components/RiskGauge';
import { fixedColors } from '@/core/theme/colors';
import { formatDuration } from '@/core/utils/format';
import { categorizeType } from '@/core/utils/keywords';
import { riskHeadline, type RiskLevel } from '@/core/utils/riskLevel';
import { getScenario } from '@/data/mock/mockScenarios';
import { useCallSession } from '@/hooks/useCallSession';
import { useCallStore } from '@/state/callStore';

const LEVEL_COLOR: Record<RiskLevel, string> = {
  safe: '#34C77B',
  warning: fixedColors.amber,
  danger: fixedColors.rec,
};

function CallActionButton({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, width: '33.3%', marginBottom: 20 }}>
      <View
        style={{
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: 'rgba(255,255,255,0.09)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={23} color="#DFE5EE" />
      </View>
      <AppText color="#B3BCC9" style={{ fontSize: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

export default function Realtime() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scenario?: string; view?: string }>();
  const scenario = useMemo(() => getScenario(params.scenario), [params.scenario]);
  const addResult = useCallStore((s) => s.addResult);
  const scrollRef = useRef<ScrollView>(null);
  const view = params.view === 'chat' ? 'chat' : 'call';

  const { state, start, stop, buildResult } = useCallSession(scenario, {
    onDangerCross: (s) => {
      if (Platform.OS !== 'web') {
        Vibration.vibrate([0, 400, 200, 400]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
      router.push({
        pathname: '/warning',
        params: {
          score: String(s.score),
          patterns: s.matchedPatterns.join('|'),
          category: categorizeType(s.matchedPatterns, s.turns.map((t) => t.content).join(' ')),
        },
      });
    },
  });

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [state.turns.length]);

  const levelColor = LEVEL_COLOR[state.level];
  const fullText = state.turns.map((t) => t.content).join(' ');
  const type = categorizeType(state.matchedPatterns, fullText);
  const keywordCount = new Set(state.turns.flatMap((t) => t.keywords ?? [])).size;
  const recentKeywords = Array.from(new Set(state.turns.flatMap((t) => t.keywords ?? []))).slice(-3);

  const endCall = () => {
    stop();
    const id = Math.floor(Date.now());
    const result = buildResult(id);
    addResult(result);
    router.replace(`/result?id=${id}`);
  };

  const switchView = (v: 'call' | 'chat') =>
    router.setParams({ view: v, scenario: scenario.id });

  return (
    <View style={{ flex: 1, backgroundColor: view === 'chat' ? fixedColors.callBgChat : fixedColors.callBg }}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        {/* 상단 뷰 전환 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 10 }}>
          <Pressable hitSlop={10} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <Icon name="chevron-left" size={26} color="#E8ECF2" />
          </Pressable>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: 3 }}>
            {(['call', 'chat'] as const).map((v) => (
              <Pressable
                key={v}
                onPress={() => switchView(v)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 18,
                  backgroundColor: view === v ? 'rgba(255,255,255,0.16)' : 'transparent',
                }}
              >
                <AppText weight="700" color={view === v ? '#FFFFFF' : '#8A96A6'} style={{ fontSize: 12.5 }}>
                  {v === 'call' ? '통화 화면' : '대화 내용'}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>

        {view === 'call' ? (
          <>
            {/* 발신자 */}
            <View style={{ alignItems: 'center', paddingTop: 18 }}>
              <View
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  backgroundColor: '#2B3543',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <Icon name="user" size={40} color="#8A96A6" />
              </View>
              <AppText color="#9AA5B3" style={{ fontSize: 14 }}>
                알 수 없음
              </AppText>
              <AppText weight="800" color="#FFFFFF" style={{ fontSize: 27, marginTop: 5 }}>
                {scenario.phone}
              </AppText>
              <AppText color={fixedColors.callTextSub} style={{ fontSize: 13, marginTop: 6 }}>
                {formatDuration(state.elapsedSec)}
              </AppText>
            </View>

            {/* VoiceGuard 검사 오버레이 배지 */}
            <View
              style={{
                marginHorizontal: 24,
                marginTop: 18,
                backgroundColor: fixedColors.callCard,
                borderWidth: 1.5,
                borderColor: levelColor,
                borderRadius: 16,
                padding: 15,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <RiskGauge score={state.score} size={54} color={levelColor} textColor={levelColor} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Icon name="shield-check" size={13} color="#AEB8C6" />
                  <AppText weight="600" color="#AEB8C6" style={{ fontSize: 11, letterSpacing: 0.3 }}>
                    VOICEGUARD AI 검사
                  </AppText>
                </View>
                <AppText weight="800" color={levelColor} style={{ fontSize: 16, marginTop: 4 }}>
                  {state.level === 'safe' ? '분석 중' : `• ${riskHeadline(state.level)}`}
                </AppText>
                <AppText color={fixedColors.callTextDim} style={{ fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                  {recentKeywords.length ? recentKeywords.join(' · ') : '위험 신호를 분석하고 있습니다'}
                </AppText>
              </View>
            </View>

            <View style={{ flex: 1 }} />

            {/* 통화 액션 그리드 (데모용 장식) */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 26 }}>
              <CallActionButton icon="record" label="녹음" />
              <CallActionButton icon="video" label="영상통화" />
              <CallActionButton icon="bluetooth" label="블루투스" />
              <CallActionButton icon="volume" label="스피커" />
              <CallActionButton icon="volume-x" label="음소거" />
              <CallActionButton icon="grid" label="키패드" />
            </View>

            {/* 종료 버튼 */}
            <View style={{ alignItems: 'center', paddingVertical: 18 }}>
              <Pressable
                onPress={endCall}
                style={{
                  width: 66,
                  height: 66,
                  borderRadius: 33,
                  backgroundColor: fixedColors.hangup,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                accessibilityLabel="통화 종료"
              >
                <Icon name="phone-off" size={28} color="#FFFFFF" />
              </Pressable>
              <AppText color={fixedColors.callTextDim} style={{ fontSize: 12, marginTop: 8 }}>
                통화 종료 → 결과 보기
              </AppText>
            </View>
          </>
        ) : (
          <>
            {/* 대화 헤더 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 12, gap: 10 }}>
              <View style={{ flex: 1 }}>
                <AppText weight="800" color="#FFFFFF" style={{ fontSize: 16 }}>
                  실시간 대화 내용
                </AppText>
                <AppText color="#8794A4" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {scenario.phone} · {formatDuration(state.elapsedSec)} 통화 중
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fixedColors.rec }} />
                <AppText weight="700" color={fixedColors.rec} style={{ fontSize: 12 }}>
                  REC
                </AppText>
              </View>
            </View>

            {/* 요약 배지 */}
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 12,
                backgroundColor: fixedColors.callCard,
                borderWidth: 1.5,
                borderColor: levelColor,
                borderRadius: 14,
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <RiskGauge score={state.score} size={44} color={levelColor} textColor={levelColor} />
              <View style={{ flex: 1 }}>
                <AppText weight="800" color="#FFFFFF" style={{ fontSize: 14 }}>
                  {state.level === 'safe' ? '분석 중' : `${riskHeadline(state.level)} · ${type} 의심`}
                </AppText>
                <AppText color={fixedColors.callTextDim} style={{ fontSize: 12, marginTop: 3 }}>
                  {keywordCount > 0 ? `위험 키워드 ${keywordCount}건이 감지되었습니다` : '실시간으로 대화를 분석 중입니다'}
                </AppText>
              </View>
            </View>

            {/* 채팅 로그 */}
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 14 }}
              showsVerticalScrollIndicator={false}
            >
              {state.turns.map((t) => (
                <View key={t.turnIndex} style={{ alignItems: t.isMine ? 'flex-end' : 'flex-start' }}>
                  <AppText color="#8794A4" style={{ fontSize: 11, marginBottom: 5 }}>
                    {t.isMine ? '나' : '상대방'} · {formatDuration(t.atSec)}
                  </AppText>
                  <View
                    style={{
                      maxWidth: '80%',
                      backgroundColor: t.isMine ? '#2563EB' : fixedColors.callBubbleOther,
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
                      baseColor={t.isMine ? '#FFFFFF' : '#D7DCE3'}
                      highlightColor={fixedColors.amber}
                      highlightBg="rgba(245,166,35,0.22)"
                      style={{ fontSize: 13.5, lineHeight: 20 }}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* 푸터 */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                paddingHorizontal: 18,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: '#2A3442',
              }}
            >
              <Icon name="activity" size={18} color="#2563EB" />
              <AppText color="#9AA5B3" style={{ fontSize: 13, flex: 1 }}>
                {state.finished
                  ? '분석 완료 · 통화 화면에서 종료를 누르세요'
                  : 'AI가 실시간으로 대화를 분석하고 있습니다...'}
              </AppText>
              <Pressable onPress={endCall} hitSlop={8}>
                <AppText weight="700" color={fixedColors.rec} style={{ fontSize: 13 }}>
                  종료
                </AppText>
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}
