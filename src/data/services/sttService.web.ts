import type { Scenario } from '@/data/mock/mockScenarios';
import { MockSttService, type SttService } from './sttMock';

export type { RecognizedTurn, SttService } from './sttMock';

/**
 * 웹 전용 STT — 항상 목(시나리오 재생).
 * 웹에는 네이티브 음성인식/whisper 모듈이 없으므로, 데모는 시나리오 재생으로 안정 동작.
 * (원하면 향후 브라우저 Web Speech API로 실제 인식 확장 가능)
 */
export const isExpoGo = true; // 웹은 네이티브 불가 → 목 취급

export function createSttService(scenario: Scenario, speed = 1): SttService {
  return new MockSttService(scenario, speed);
}
