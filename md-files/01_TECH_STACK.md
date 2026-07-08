# 01. 기술 스택 (확정)

> **결론: React Native + Expo (SDK 57, TypeScript).** 기존 초안의 Flutter에서 변경.
> 변경 사유: ① 개발 PC에 Flutter 미설치(Node/Java만 있음) ② 최우선 목표가 "모든 화면을 목데이터로 내 폰에서 즉시 테스트"인데, **Expo Go = QR 스캔 즉시 실행**(APK 빌드·Android SDK·USB 디버깅 불필요)이라 이 목표에 최적 ③ APK/실기기 배포는 **EAS 클라우드 빌드**로 로컬 Android SDK 없이 가능.

## 프레임워크 / 언어

- React Native 0.86 + Expo SDK 57, TypeScript, expo-router(파일 기반), Zustand(상태).
- 타겟: Android (Galaxy S21+/테스트 S24 Ultra). Expo Go로 개발, EAS로 APK.

## 핵심 아키텍처 결정 (프레임워크 무관 · 그대로 유효)

- **백엔드는 STT를 하지 않음** → 음성→텍스트는 앱이 **온디바이스**로 수행하고, WS로는 "텍스트 발화"만 전송. (프레임워크와 무관한 진짜 조정 포인트)
- STT는 추상화(`src/data/services/sttService.ts`): 기본은 시나리오 재생(목, Expo Go 호환), 실제는 dev build에서 `expo-speech-recognition`으로 교체.
- WS도 추상화(`wsService.ts`): 기본은 앱 내부 목 분석기(백엔드 불필요), `USE_MOCK_WS=false`로 실제 백엔드 연결.

## 패키지 (설치 완료)

| 용도 | 패키지 |
| --- | --- |
| 라우팅 | expo-router |
| 상태 | zustand |
| 로컬 저장 | @react-native-async-storage/async-storage |
| 아이콘 | @expo/vector-icons |
| 게이지/그래픽 | react-native-svg |
| 파일 선택 | expo-document-picker |
| 햅틱/진동 | expo-haptics + RN Vibration |
| 오디오 | expo-audio (경고음 확장용) |
| 온디바이스 STT(실제) | expo-speech-recognition *(dev build 시 추가)* |

## 설정 메모

- HTTP 평문 차단(Android 9+): 실기기+실백엔드는 ngrok/cloudflared `wss://` 권장. 로컬 LAN IP도 가능.
- `baseUrl`은 `src/core/config/env.ts` 한 곳에서 관리.
- 권한(app.json): RECORD_AUDIO, POST_NOTIFICATIONS, VIBRATE.
- 실기기 테스트 권장(STT/마이크는 에뮬레이터 불안정). 목모드는 어디서든 동작.
