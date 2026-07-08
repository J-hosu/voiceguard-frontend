import Constants, { ExecutionEnvironment } from 'expo-constants';
import { USE_MOCK_STT } from '@/core/config/env';
import type { Scenario } from '@/data/mock/mockScenarios';

/**
 * 온디바이스 실시간 STT 추상화.
 *
 * - dev/preview build: `expo-speech-recognition`(폰 내장 음성인식, 모델 준비 불필요)로 실제 마이크 인식.
 * - Expo Go: 네이티브 모듈이 없어 자동으로 스크립트 시나리오 재생(목)으로 폴백.
 * - USE_MOCK_STT=true: 환경과 무관하게 항상 목.
 *
 * 실제 통신사 통화 오디오는 Android 정책상 수집 불가 → 스피커폰+마이크 데모(기능명세서 §13).
 * 온디바이스 화자분리는 불가 → 인식 발화는 단일 화자(speaker_a, 상대방)로 처리.
 */
export interface RecognizedTurn {
  role: string;
  content: string;
  isMine: boolean;
  atSec: number;
}

export interface SttService {
  start(): void;
  stop(): void;
  onTurn(cb: (t: RecognizedTurn) => void): void;
  onEnd(cb: () => void): void;
  onError(cb: (msg: string) => void): void;
}

/** Expo Go 여부 (네이티브 STT 불가) */
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** 스크립트 시나리오 재생(목) */
class MockSttService implements SttService {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private turnCb: ((t: RecognizedTurn) => void) | null = null;
  private endCb: (() => void) | null = null;
  private stopped = false;

  constructor(
    private scenario: Scenario,
    private speed = 1,
  ) {}

  onTurn(cb: (t: RecognizedTurn) => void) {
    this.turnCb = cb;
  }
  onEnd(cb: () => void) {
    this.endCb = cb;
  }
  onError() {}

  start() {
    this.stopped = false;
    for (const turn of this.scenario.turns) {
      const t = setTimeout(() => {
        if (this.stopped) return;
        this.turnCb?.({ role: turn.role, content: turn.content, isMine: turn.isMine, atSec: turn.atSec });
      }, (turn.atSec * 1000) / this.speed);
      this.timers.push(t);
    }
    const last = this.scenario.turns[this.scenario.turns.length - 1];
    const endT = setTimeout(
      () => {
        if (!this.stopped) this.endCb?.();
      },
      ((last ? last.atSec + 4 : 4) * 1000) / this.speed,
    );
    this.timers.push(endT);
  }

  stop() {
    this.stopped = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

/** 폰 내장 음성인식(expo-speech-recognition) 기반 실제 STT */
class RealSttService implements SttService {
  private turnCb: ((t: RecognizedTurn) => void) | null = null;
  private endCb: (() => void) | null = null;
  private errCb: ((m: string) => void) | null = null;
  private subs: { remove: () => void }[] = [];
  private stopped = false;
  private startedAt = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private SR: any = null;

  onTurn(cb: (t: RecognizedTurn) => void) {
    this.turnCb = cb;
  }
  onEnd(cb: () => void) {
    this.endCb = cb;
  }
  onError(cb: (m: string) => void) {
    this.errCb = cb;
  }

  private loadModule() {
    if (this.SR) return this.SR;
    // 네이티브 모듈은 dev build에만 존재 → 동적 require + try/catch
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.SR = require('expo-speech-recognition');
    return this.SR;
  }

  async start() {
    this.stopped = false;
    this.startedAt = Date.now();
    let SR;
    try {
      SR = this.loadModule();
    } catch {
      this.errCb?.('음성 인식 모듈을 불러올 수 없습니다. (dev build 필요)');
      return;
    }
    const mod = SR.ExpoSpeechRecognitionModule;
    try {
      const perm = await mod.requestPermissionsAsync();
      if (!perm.granted) {
        this.errCb?.('마이크·음성 인식 권한이 필요합니다.');
        return;
      }
    } catch {
      // 권한 API가 없으면 무시하고 시도
    }

    this.subs.push(
      SR.addSpeechRecognitionListener('result', (e: { isFinal?: boolean; results?: { transcript?: string }[] }) => {
        const text = e.results?.[0]?.transcript?.trim();
        if (e.isFinal && text) {
          this.turnCb?.({
            role: 'speaker_a',
            content: text,
            isMine: false,
            atSec: Math.round((Date.now() - this.startedAt) / 1000),
          });
        }
      }),
    );
    this.subs.push(
      SR.addSpeechRecognitionListener('error', (e: { error?: string; message?: string }) => {
        if (e.error !== 'no-speech') this.errCb?.(e.message || e.error || '음성 인식 오류');
      }),
    );
    this.subs.push(
      SR.addSpeechRecognitionListener('end', () => {
        // 안드로이드는 침묵 시 자동 종료 → 계속 듣기 위해 재시작
        if (!this.stopped) {
          try {
            this.beginListening(mod);
          } catch {
            /* ignore */
          }
        }
      }),
    );

    this.beginListening(mod);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private beginListening(mod: any) {
    mod.start({
      lang: 'ko-KR',
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: false,
    });
  }

  stop() {
    this.stopped = true;
    try {
      this.SR?.ExpoSpeechRecognitionModule?.stop();
    } catch {
      /* ignore */
    }
    this.subs.forEach((s) => {
      try {
        s.remove();
      } catch {
        /* ignore */
      }
    });
    this.subs = [];
  }
}

export function createSttService(scenario: Scenario, speed = 1): SttService {
  if (USE_MOCK_STT || isExpoGo) return new MockSttService(scenario, speed);
  return new RealSttService();
}
