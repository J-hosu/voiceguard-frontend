/**
 * 앱 환경 설정 (한 곳에서 관리).
 *
 * - 실제 백엔드와 붙일 때는 USE_MOCK_WS를 false로 바꾸고 BASE_URL_WS를
 *   데모용 ngrok/cloudflared 주소(wss://...)로 교체한다.
 * - 기본값은 "완전 목데이터" 모드: 백엔드 없이 앱만으로 동작한다(Expo Go 데모).
 */

/** true면 백엔드 없이 앱 내부 목 분석기로 동작(기본, Expo Go 데모용) */
export const USE_MOCK_WS = true;

/**
 * true면 항상 스크립트 시나리오 재생(강제 목).
 * false(기본)면 "가능하면 실제 온디바이스 STT" — 단, Expo Go에서는 네이티브 모듈이 없어
 * 자동으로 목으로 폴백한다(executionEnvironment로 감지). 실제 STT는 dev build에서 동작.
 */
export const USE_MOCK_STT = false;

/**
 * 파일 분석용 온디바이스 Whisper 모델.
 * 기본은 다국어 base(약 148MB) — 최초 1회 다운로드 후 오프라인 캐시.
 * 한국어 정확도를 더 원하면 'ggml-small.bin'(약 488MB)로 교체.
 */
export const WHISPER_MODEL = {
  name: 'ggml-base.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  language: 'ko',
};

/** 실제 백엔드 주소 (USE_MOCK_WS=false일 때 사용) */
export const BASE_URL_HTTP = 'http://127.0.0.1:8000';
export const BASE_URL_WS = 'ws://127.0.0.1:8000';

/** WS 엔드포인트 경로 */
export const WS_ANALYZE_PATH = '/ws/calls/analyze';

/** start 메시지에 쓸 고정 device_id (백엔드 발급 규칙 미정 → MVP 고정값) */
export const DEVICE_ID = 1;
