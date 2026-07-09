import { USE_MOCK_STT } from '@/core/config/env';
import type { Scenario } from '@/data/mock/mockScenarios';
import { MockSttService, type RecognizedTurn, type SttService } from './sttMock';

export type { RecognizedTurn, SttService } from './sttMock';

export const isExpoGo = false; // 웹

/* eslint-disable @typescript-eslint/no-explicit-any */
function getSpeechRecognition(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

/** 브라우저 내장 음성인식(Web Speech API) 기반 실시간 STT. 크롬/엣지 지원, ko-KR. */
class WebSpeechSttService implements SttService {
  private rec: any = null;
  private turnCb: ((t: RecognizedTurn) => void) | null = null;
  private endCb: (() => void) | null = null;
  private errCb: ((m: string) => void) | null = null;
  private stopped = false;
  private startedAt = 0;

  onTurn(cb: (t: RecognizedTurn) => void) {
    this.turnCb = cb;
  }
  onEnd(cb: () => void) {
    this.endCb = cb;
  }
  onError(cb: (m: string) => void) {
    this.errCb = cb;
  }

  start() {
    const SR = getSpeechRecognition();
    if (!SR) {
      this.errCb?.('이 브라우저는 음성 인식을 지원하지 않습니다. (크롬/엣지 권장)');
      return;
    }
    this.stopped = false;
    this.startedAt = Date.now();
    this.rec = new SR();
    this.rec.lang = 'ko-KR';
    this.rec.continuous = true;
    this.rec.interimResults = true;

    this.rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const text = String(r[0]?.transcript ?? '').trim();
          if (text) {
            this.turnCb?.({
              role: 'speaker_a',
              content: text,
              isMine: false,
              atSec: Math.round((Date.now() - this.startedAt) / 1000),
            });
          }
        }
      }
    };
    this.rec.onerror = (e: any) => {
      if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') {
        this.errCb?.(String(e.error));
      }
    };
    this.rec.onend = () => {
      if (!this.stopped) {
        try {
          this.rec.start(); // 자동 종료 시 재시작(연속 인식)
        } catch {
          /* ignore */
        }
      }
    };
    try {
      this.rec.start();
    } catch {
      this.errCb?.('마이크 접근에 실패했습니다. 권한을 확인하세요.');
    }
  }

  stop() {
    this.stopped = true;
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
  }
}

export function createSttService(scenario: Scenario, speed = 1): SttService {
  // USE_MOCK_STT=true거나 브라우저 미지원이면 목, 아니면 실제 브라우저 음성인식
  if (USE_MOCK_STT || !getSpeechRecognition()) return new MockSttService(scenario, speed);
  return new WebSpeechSttService();
}
