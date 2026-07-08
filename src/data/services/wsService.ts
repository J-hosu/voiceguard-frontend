import {
  BASE_URL_WS,
  DEVICE_ID,
  USE_MOCK_WS,
  WS_ANALYZE_PATH,
} from '@/core/config/env';
import type { AnalysisEvent, CallLog } from '@/data/models/types';
import { analyze } from './analyzer';

/**
 * 실시간 분석 연결 추상화.
 * - 흐름: connect → start → call_started → (발화마다) sendMessage → ack/detected
 * - USE_MOCK_WS=true(기본): 앱 내부 목 분석기 사용(백엔드 불필요)
 * - USE_MOCK_WS=false: 실제 WebSocket(ws/wss)로 백엔드 연결
 */
export interface AnalyzeConnection {
  onEvent(cb: (e: AnalysisEvent) => void): void;
  start(name: string): void;
  sendMessage(role: string, content: string, turnIndex: number): void;
  close(): void;
}

/** 백엔드 없이 앱 내부에서 분석 (Expo Go 데모 기본값) */
class MockAnalyzeConnection implements AnalyzeConnection {
  private cb: ((e: AnalysisEvent) => void) | null = null;
  private accumulated: string[] = [];
  private logId = Math.floor(Date.now() / 1000) % 100000;
  private closed = false;

  onEvent(cb: (e: AnalysisEvent) => void) {
    this.cb = cb;
  }

  private emit(e: AnalysisEvent) {
    if (!this.closed) this.cb?.(e);
  }

  start(name: string) {
    const now = new Date().toISOString();
    const call: CallLog = {
      id: this.logId,
      device_id: DEVICE_ID,
      name,
      status: 'normal',
      risk_score: 0,
      risk_level: 'low',
      detected_label: 0,
      core_evidence: '',
      created_at: now,
      updated_at: now,
    };
    setTimeout(() => this.emit({ type: 'call_started', call }), 120);
  }

  sendMessage(role: string, content: string, turnIndex: number) {
    this.accumulated.push(`${role}: ${content}`);
    const result = analyze(this.accumulated.join('\n'));
    const message = {
      id: turnIndex,
      log_id: this.logId,
      turn_index: turnIndex,
      role,
      content,
      created_at: new Date().toISOString(),
    };
    // 네트워크 지연 흉내
    setTimeout(() => {
      if (result.isPhishing) {
        this.emit({
          type: 'phishing_detected',
          log_id: this.logId,
          is_phishing: true,
          risk_score: result.riskScore,
          risk_level: result.riskLevel,
          matched_patterns: result.matchedPatterns,
          core_evidence: result.coreEvidence,
          notification: {},
          message,
        });
      } else {
        this.emit({
          type: 'analysis_ack',
          log_id: this.logId,
          is_phishing: false,
          risk_score: result.riskScore,
          risk_level: result.riskLevel,
          message,
        });
      }
    }, 180);
  }

  close() {
    this.closed = true;
    this.cb = null;
  }
}

/** 실제 WebSocket 연결 */
class RealAnalyzeConnection implements AnalyzeConnection {
  private ws: WebSocket;
  private cb: ((e: AnalysisEvent) => void) | null = null;
  private queue: object[] = [];
  private ready = false;

  constructor() {
    this.ws = new WebSocket(`${BASE_URL_WS}${WS_ANALYZE_PATH}`);
    this.ws.onopen = () => {
      this.ready = true;
      this.queue.forEach((m) => this.ws.send(JSON.stringify(m)));
      this.queue = [];
    };
    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as AnalysisEvent;
        this.cb?.(data);
      } catch {
        this.cb?.({ type: 'error', message: '응답을 해석할 수 없습니다.' });
      }
    };
    this.ws.onerror = () => {
      this.cb?.({ type: 'error', message: '서버에 연결할 수 없습니다.' });
    };
  }

  private send(msg: object) {
    if (this.ready) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }

  onEvent(cb: (e: AnalysisEvent) => void) {
    this.cb = cb;
  }

  start(name: string) {
    this.send({ type: 'start', device_id: DEVICE_ID, name });
  }

  sendMessage(role: string, content: string, turnIndex: number) {
    this.send({ type: 'message', role, content, turn_index: turnIndex });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
    this.cb = null;
  }
}

export function createAnalyzeConnection(): AnalyzeConnection {
  return USE_MOCK_WS ? new MockAnalyzeConnection() : new RealAnalyzeConnection();
}
