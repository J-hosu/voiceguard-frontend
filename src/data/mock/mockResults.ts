import { categorizeType, extractKeywords } from '@/core/utils/keywords';
import { analyze } from '@/data/services/analyzer';
import type { CallResult, TranscriptTurn } from '@/data/models/types';
import {
  scenarioLoan,
  scenarioNormal,
  scenarioProsecutor,
  type Scenario,
} from './mockScenarios';

/** daysAgo 전 시각의 ISO 문자열 */
function isoDaysAgo(days: number, hour = 14, min = 20): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

/** 시나리오 → CallResult (분석기/키워드 사전 재사용) */
export function buildResultFromScenario(
  scenario: Scenario,
  opts: { id: number; scoreOverride?: number; daysAgo: number; hour?: number; min?: number },
): CallResult {
  const turns: TranscriptTurn[] = scenario.turns.map((t, i) => ({
    turnIndex: i + 1,
    role: t.role,
    isMine: t.isMine,
    content: t.content,
    atSec: t.atSec,
    keywords: t.isMine ? [] : extractKeywords(t.content, 4),
  }));

  const fullText = scenario.turns.map((t) => `${t.role}: ${t.content}`).join('\n');
  const result = analyze(fullText);
  const last = scenario.turns[scenario.turns.length - 1];

  return {
    id: opts.id,
    name: scenario.phone,
    category: categorizeType(result.matchedPatterns, fullText),
    finalScore: opts.scoreOverride ?? result.riskScore,
    matchedPatterns: result.matchedPatterns,
    coreEvidence: result.coreEvidence,
    keywords: extractKeywords(fullText, 6),
    turns,
    source: scenario.source,
    createdAt: isoDaysAgo(opts.daysAgo, opts.hour, opts.min),
    durationSec: (last?.atSec ?? 30) + 5,
  };
}

const scenarioKidnap: Scenario = {
  id: 'kidnap',
  title: '납치·협박형',
  phone: '010-2251-8890',
  source: 'realtime',
  turns: [
    { atSec: 2, isMine: false, role: 'speaker_a', content: '당신 딸을 데리고 있다. 지금 경찰에 신고하면 아이가 위험해진다.' },
    { atSec: 9, isMine: true, role: 'speaker_b', content: '네? 그게 무슨 소리예요?' },
    { atSec: 15, isMine: false, role: 'speaker_a', content: '지금 즉시 안전계좌로 송금하지 않으면 큰일 난다. 비밀로 해라.' },
  ],
};

const scenarioDelivery: Scenario = {
  id: 'delivery',
  title: '정상 통화',
  phone: '010-4412-7781',
  source: 'realtime',
  turns: [
    { atSec: 2, isMine: false, role: 'speaker_a', content: '안녕하세요, 택배 배송 관련해서 부재중이라 연락드렸습니다.' },
    { atSec: 8, isMine: true, role: 'speaker_b', content: '아 네, 문 앞에 놓아주세요.' },
    { atSec: 13, isMine: false, role: 'speaker_a', content: '네 알겠습니다. 좋은 하루 되세요.' },
  ],
};

/** 데모용 시드 히스토리 (모든 항목이 상세 열람 가능) */
export const MOCK_RESULTS: CallResult[] = [
  buildResultFromScenario(scenarioProsecutor, { id: 9001, scoreOverride: 0.84, daysAgo: 0, hour: 14, min: 20 }),
  buildResultFromScenario(scenarioLoan, { id: 9002, scoreOverride: 0.73, daysAgo: 2, hour: 11, min: 5 }),
  buildResultFromScenario(scenarioKidnap, { id: 9003, scoreOverride: 0.92, daysAgo: 4, hour: 20, min: 41 }),
  buildResultFromScenario(scenarioNormal, { id: 9004, scoreOverride: 0.12, daysAgo: 6, hour: 9, min: 12 }),
  buildResultFromScenario(scenarioDelivery, { id: 9005, scoreOverride: 0.06, daysAgo: 8, hour: 16, min: 30 }),
  buildResultFromScenario(scenarioProsecutor, { id: 9006, scoreOverride: 0.86, daysAgo: 12, hour: 10, min: 2 }),
];
