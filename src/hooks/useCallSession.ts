import { useCallback, useEffect, useRef, useState } from 'react';
import { categorizeType, extractKeywords } from '@/core/utils/keywords';
import { riskLevelFromScore, type RiskLevel } from '@/core/utils/riskLevel';
import type { AnalysisEvent, CallResult, TranscriptTurn } from '@/data/models/types';
import type { Scenario } from '@/data/mock/mockScenarios';
import { createSttService, type SttService } from '@/data/services/sttService';
import { createAnalyzeConnection, type AnalyzeConnection } from '@/data/services/wsService';
import { useSettingsStore } from '@/state/settingsStore';

export interface CallSessionState {
  turns: TranscriptTurn[];
  score: number; // 현재 누적 위험도
  level: RiskLevel;
  matchedPatterns: string[];
  coreEvidence: string;
  elapsedSec: number;
  running: boolean;
  finished: boolean;
  error: string | null; // 백엔드 연결/분석 오류 (실사용 시 표시)
}

/**
 * STT(목/실제) → WS(목/실제) 오케스트레이션.
 * 발화 인식마다 WS로 전송하고, 응답으로 위험도/근거/자막을 갱신한다.
 * 강한 경고 임계값을 처음 넘으면 onDangerCross 콜백을 1회 호출한다.
 */
export function useCallSession(
  scenario: Scenario,
  opts: { speed?: number; onDangerCross?: (s: CallSessionState) => void } = {},
) {
  const dangerThreshold = useSettingsStore((s) => s.dangerThreshold);
  const [state, setState] = useState<CallSessionState>({
    turns: [],
    score: 0,
    level: 'safe',
    matchedPatterns: [],
    coreEvidence: '',
    elapsedSec: 0,
    running: false,
    finished: false,
    error: null,
  });

  // 세션은 start() 시점에 1회 생성(실제 WS 소켓이 렌더마다 새로 열리는 것 방지)
  const connRef = useRef<AnalyzeConnection | null>(null);
  const sttRef = useRef<SttService | null>(null);
  const speed = opts.speed ?? 1;
  const turnCounter = useRef(0);
  const maxScore = useRef(0);
  const warned = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number>(0);
  const onDanger = useRef(opts.onDangerCross);
  onDanger.current = opts.onDangerCross;

  const handleEvent = useCallback(
    (e: AnalysisEvent) => {
      if (e.type === 'error') {
        setState((prev) => ({ ...prev, error: e.message }));
        return;
      }
      if (e.type === 'analysis_ack' || e.type === 'phishing_detected') {
        const score = e.risk_score;
        maxScore.current = Math.max(maxScore.current, score);
        const matched = e.type === 'phishing_detected' ? e.matched_patterns : [];
        const evidence = e.type === 'phishing_detected' ? e.core_evidence : '';
        const turnIdx = e.message?.turn_index;

        setState((prev) => {
          const level = riskLevelFromScore(score, dangerThreshold);
          const turns = turnIdx
            ? prev.turns.map((t) => (t.turnIndex === turnIdx ? { ...t, riskScore: score } : t))
            : prev.turns;
          const next: CallSessionState = {
            ...prev,
            turns,
            score,
            level,
            matchedPatterns: matched.length ? matched : prev.matchedPatterns,
            coreEvidence: evidence || prev.coreEvidence,
          };
          if (!warned.current && level === 'danger') {
            warned.current = true;
            setTimeout(() => onDanger.current?.(next), 0);
          }
          return next;
        });
      }
    },
    [dangerThreshold],
  );

  const start = useCallback(() => {
    const conn = createAnalyzeConnection();
    const stt = createSttService(scenario, speed);
    connRef.current = conn;
    sttRef.current = stt;
    conn.onEvent(handleEvent);
    conn.start(scenario.phone);

    stt.onTurn((t) => {
      turnCounter.current += 1;
      const idx = turnCounter.current;
      const turn: TranscriptTurn = {
        turnIndex: idx,
        role: t.role,
        isMine: t.isMine,
        content: t.content,
        atSec: t.atSec,
        keywords: t.isMine ? [] : extractKeywords(t.content, 4),
      };
      setState((prev) => ({ ...prev, turns: [...prev.turns, turn] }));
      conn.sendMessage(t.role, t.content, idx);
    });
    stt.onEnd(() => {
      setState((prev) => ({ ...prev, finished: true }));
    });

    startedAt.current = Date.now();
    timer.current = setInterval(() => {
      setState((prev) => ({ ...prev, elapsedSec: Math.floor((Date.now() - startedAt.current) / 1000) }));
    }, 1000);

    stt.start();
    setState((prev) => ({ ...prev, running: true }));
  }, [handleEvent, scenario, speed]);

  const stop = useCallback(() => {
    sttRef.current?.stop();
    connRef.current?.close();
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setState((prev) => ({ ...prev, running: false }));
  }, []);

  const buildResult = useCallback(
    (id: number): CallResult => {
      const fullText = state.turns.map((t) => `${t.role}: ${t.content}`).join('\n');
      return {
        id,
        name: scenario.phone,
        category: categorizeType(state.matchedPatterns, fullText),
        finalScore: maxScore.current,
        matchedPatterns: state.matchedPatterns,
        coreEvidence: state.coreEvidence || '분석된 위험 근거가 없습니다.',
        keywords: extractKeywords(fullText, 6),
        turns: state.turns,
        source: scenario.source,
        createdAt: new Date().toISOString(),
        durationSec: state.elapsedSec,
      };
    },
    [scenario.phone, scenario.source, state],
  );

  useEffect(() => {
    return () => {
      sttRef.current?.stop();
      connRef.current?.close();
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return { state, start, stop, buildResult };
}
