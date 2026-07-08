/**
 * 앱 환경 설정 (한 곳에서 관리).
 *
 * - 실제 백엔드와 붙일 때는 USE_MOCK_WS를 false로 바꾸고 BASE_URL_WS를
 *   데모용 ngrok/cloudflared 주소(wss://...)로 교체한다.
 * - 기본값은 "완전 목데이터" 모드: 백엔드 없이 앱만으로 동작한다(Expo Go 데모).
 */

/** true면 백엔드 없이 앱 내부 목 분석기로 동작(기본, Expo Go 데모용) */
export const USE_MOCK_WS = true;

/** true면 온디바이스 STT 대신 스크립트 시나리오를 재생(Expo Go 데모용) */
export const USE_MOCK_STT = true;

/** 실제 백엔드 주소 (USE_MOCK_WS=false일 때 사용) */
export const BASE_URL_HTTP = 'http://127.0.0.1:8000';
export const BASE_URL_WS = 'ws://127.0.0.1:8000';

/** WS 엔드포인트 경로 */
export const WS_ANALYZE_PATH = '/ws/calls/analyze';

/** start 메시지에 쓸 고정 device_id (백엔드 발급 규칙 미정 → MVP 고정값) */
export const DEVICE_ID = 1;
