import { USE_MOCK_STT } from '@/core/config/env';
import type { Scenario } from '@/data/mock/mockScenarios';

/**
 * 온디바이스 STT 추상화.
 *
 * - USE_MOCK_STT=true(기본): 스크립트 시나리오를 시간축에 맞춰 재생(Expo Go 데모).
 * - 실제 STT: 개발 빌드(dev build)에서 `expo-speech-recognition`으로 교체.
 *   교체 지점은 RealSttService 주석 참고. Expo Go에서는 네이티브 STT가 불가하므로
 *   기본값은 목 재생이다(01_TECH_STACK/05_BACKEND_REQUESTS의 온디바이스 STT 방침).
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
  onError() {
    // 목 재생에는 에러 없음
  }

  start() {
    this.stopped = false;
    for (const turn of this.scenario.turns) {
      const t = setTimeout(() => {
        if (this.stopped) return;
        this.turnCb?.({
          role: turn.role,
          content: turn.content,
          isMine: turn.isMine,
          atSec: turn.atSec,
        });
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

/**
 * 실제 온디바이스 STT (dev build 전용). Expo Go에서는 사용 불가.
 *
 * 활성화 방법:
 *   1) `npx expo install expo-speech-recognition`
 *   2) app.json plugins에 "expo-speech-recognition" 추가 후 dev build
 *   3) env.ts의 USE_MOCK_STT=false
 *   4) 아래 주석 코드를 ExpoSpeechRecognitionModule 이벤트로 연결
 *      (onResult의 최종 결과 1건 = 1턴 → turn_index 증가시켜 WS message 전송)
 */
class RealSttService implements SttService {
  private errCb: ((m: string) => void) | null = null;
  onTurn() {}
  onEnd() {}
  onError(cb: (m: string) => void) {
    this.errCb = cb;
  }
  start() {
    this.errCb?.(
      '실제 온디바이스 STT는 개발 빌드(dev build)에서만 동작합니다. 데모는 목 모드(USE_MOCK_STT=true)를 사용하세요.',
    );
  }
  stop() {}
}

export function createSttService(scenario: Scenario, speed = 1): SttService {
  return USE_MOCK_STT ? new MockSttService(scenario, speed) : new RealSttService();
}
