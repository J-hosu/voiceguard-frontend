# VoiceGuard AI — Frontend (앱)

통화 속 **보이스피싱을 실시간으로 탐지·설명·경고**하는 안드로이드 앱. 차별점은 "왜 위험한지"를 근거와 함께 보여주는 **설명 중심(Explainable) UX**.

## 기술 스택 (확정)

| 영역 | 스펙 |
| --- | --- |
| 프레임워크 | **React Native + Expo (SDK 57)**, TypeScript |
| 라우팅 | expo-router (파일 기반) |
| 상태관리 | Zustand |
| 타겟 | Android (Galaxy S21+ / 테스트 S24 Ultra) |
| 백엔드 | FastAPI (별도 저장소, **수정 금지**) — REST + WebSocket |

> 기존 문서는 Flutter를 제안했으나, ① 이 PC에 Flutter 미설치 ② "모든 페이지를 목데이터로 폰에서 바로 테스트" 목표에는 **Expo Go(QR 스캔 즉시 실행)** 가 최적이라 RN/Expo로 변경함. 자세한 사유는 프로젝트 루트 `변경사항_보고.txt` 참조.

## 지금 바로 폰에서 실행 (목데이터, 백엔드 불필요)

```bash
npm install            # 최초 1회 (.npmrc에 legacy-peer-deps 설정됨)
npm start              # Metro 실행 → 터미널에 QR 코드
```

1. 폰에 **Expo Go** 앱 설치 (Play 스토어).
2. 폰과 PC가 **같은 Wi-Fi**에 연결.
3. Expo Go로 터미널의 **QR 코드 스캔** → 앱이 바로 실행됨.
   - 방화벽으로 안 붙으면 `npx expo start --tunnel` 사용.

기본값(`src/core/config/env.ts`)이 **완전 목모드**(`USE_MOCK_WS=true`, `USE_MOCK_STT=true`)라 백엔드 없이 모든 화면이 동작한다. 실시간 감지는 스크립트 시나리오가 재생되며 위험도가 정상→주의→위험으로 상승하고 임계값에서 경고 모달이 뜬다.

## 실제 백엔드 / WS 경로 테스트

- 실제 FastAPI 백엔드를 켜거나, 포함된 **임시 목 백엔드**를 사용:
  ```bash
  npm --prefix mock-backend install   # 최초 1회
  npm run mock-backend                # http://localhost:8000 (GET /health, /calls, WS /ws/calls/analyze)
  ```
- `src/core/config/env.ts` 에서 `USE_MOCK_WS=false`, `BASE_URL_WS`를 서버 주소로 변경.
  - 폰 실기기에서 접속하려면 `127.0.0.1` 대신 PC의 LAN IP(예: `ws://192.168.0.x:8000`) 또는 ngrok/cloudflared의 `wss://` 주소 사용.

## APK로 빌드해 폰에 설치 (사이드로딩)

로컬 Android SDK 없이 **EAS 클라우드 빌드**로 APK 생성:

```bash
npm i -g eas-cli
eas login                                   # Expo 계정(무료)
eas build -p android --profile preview      # 빌드 완료 후 APK 다운로드 링크 제공
```

APK를 폰으로 옮겨 설치(출처를 알 수 없는 앱 허용). 온디바이스 실시간 STT는 이 빌드(dev/preview build)에서 활성화 가능 — 아래 참조.

## 실제 온디바이스 STT (구현 완료 · dev build에서 동작)

STT는 이미 연결돼 있습니다. **Expo Go에서는 자동으로 목(시나리오 재생)** 으로 폴백하고, **dev/preview build에서는 실제로 동작**합니다(`executionEnvironment`로 감지).

- **실시간(기능2)**: `expo-speech-recognition` = 폰 내장 음성인식. **모델 준비 불필요.** 침묵 시 자동 재시작 루프 포함. (`src/data/services/sttService.ts`)
- **파일(기능1)**: `whisper.rn` = 온디바이스 Whisper. **최초 1회 모델 다운로드**(`WHISPER_MODEL`, 기본 `ggml-base.bin` ≈148MB → 오프라인 캐시). (`src/data/services/fileStt.ts`)
  - whisper.cpp는 **16kHz WAV 입력** 전제 → mp3/m4a는 전사 실패 시 목으로 폴백(향후 ffmpeg 트랜스코딩 여지).

### dev build로 실제 STT 켜기 (Expo Go 대체)

```bash
npm i -g eas-cli && eas login
eas build -p android --profile development     # 개발용 dev client APK
# 폰에 설치 후:
npx expo start --dev-client                    # QR 스캔 → 실제 STT 동작
```

- `USE_MOCK_STT`(env.ts) 기본값 `false` = "가능하면 실제, Expo Go면 목". 항상 목으로 강제하려면 `true`.
- 한국어 파일 정확도를 더 원하면 `WHISPER_MODEL`을 `ggml-small.bin`(≈488MB)로 교체.

> 실제 통신사 통화 오디오 가로채기는 Android 정책상 불가 → 스피커폰+마이크 감지 데모로 대체(기능명세서 §13).

## 폴더 구조

```text
app/                     # expo-router 화면 (파일 = 라우트)
  _layout.tsx            # 루트 스택 + 스토어 하이드레이션
  index.tsx              # 온보딩 여부 분기
  onboarding.tsx         # 화면 1
  (tabs)/                # 하단 탭: 홈 / 히스토리 / 정보
  upload.tsx             # 화면 3 (파일 분석, 온디바이스 STT 우회)
  realtime.tsx           # 화면 4·5 (통화 감지 + 대화 내용)
  warning.tsx            # 화면 6 (전면 경고 모달)
  result.tsx             # 화면 7·8 (요약/대화/근거 탭)
  prevention.tsx         # 화면 10 (예방 정보)
  settings.tsx           # 설정
src/
  core/{theme,config,utils}   # 색·타이포·env·위험등급/키워드/포맷
  components/                 # 공용 위젯 (RiskBadge/RiskGauge/CallCard 등)
  data/{models,services,mock} # 타입·WS/STT/분석기·목데이터
  hooks/useCallSession.ts     # STT→WS 오케스트레이션
  state/                      # zustand 스토어 (settings/calls/app)
mock-backend/                 # 임시 목 백엔드 (테스트용, 앱과 별개)
md-files/                     # 기획/연동 문서
```

## 보안

`.env`, `*.pem`, 서명 키 등은 `.gitignore`로 차단. 절대 커밋 금지. **백엔드 코드는 수정하지 않음.**
