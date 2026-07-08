import { categorizeType, extractKeywords } from '@/core/utils/keywords';
import type { CallResult, TranscriptTurn } from '@/data/models/types';
import { analyze } from './analyzer';
import type { FileTranscript } from './fileStt';

/** Whisper 전사 결과(세그먼트) → CallResult (분석기/키워드 사전 재사용) */
export function buildResultFromTranscript(
  transcript: FileTranscript,
  opts: { id: number; source: 'realtime' | 'file'; phone: string },
): CallResult {
  const segs =
    transcript.segments.length > 0
      ? transcript.segments
      : [{ text: transcript.text, t0: 0, t1: 0 }];

  const turns: TranscriptTurn[] = segs
    .filter((s) => s.text && s.text.trim())
    .map((s, i) => ({
      turnIndex: i + 1,
      role: 'speaker_a',
      isMine: false, // 온디바이스 화자분리 불가 → 단일 화자
      content: s.text.trim(),
      atSec: Math.round((s.t0 ?? 0) / 100), // whisper t0: 1/100초
      keywords: extractKeywords(s.text, 4),
    }));

  const full = transcript.text || turns.map((t) => t.content).join(' ');
  const result = analyze(full);
  const last = turns[turns.length - 1];

  return {
    id: opts.id,
    name: opts.phone,
    category: categorizeType(result.matchedPatterns, full),
    finalScore: result.riskScore,
    matchedPatterns: result.matchedPatterns,
    coreEvidence: result.coreEvidence,
    keywords: extractKeywords(full, 6),
    turns,
    source: opts.source,
    createdAt: new Date().toISOString(),
    durationSec: last ? last.atSec + 3 : 0,
  };
}
