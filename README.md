# VoiceGuard AI — Frontend

통화 중 **보이스피싱을 실시간으로 탐지·경고**하는 안드로이드 앱의 프론트엔드 저장소입니다.

## 상태

🚧 **구현 전** — 담당자 가이드라인 및 디자인 확정 대기 중.
현재는 저장소 초기화 단계이며, 실제 앱 구현은 별도 가이드라인·디자인에 따라 진행됩니다.

## 확정 스펙 (스펙 문서 v1.0 기준)

| 영역 | 스펙 |
| --- | --- |
| 프레임워크 | Flutter (Dart) |
| 타겟 | Android (Galaxy S21+ 이상, 테스트: S24 Ultra) |
| minSdk / targetSdk | 26 (Android 8.0) / 34 (Android 14) |
| 백엔드 연동 | HTTPS REST (3~5초 오디오 청크 업로드), 여유 시 WebSocket |
| 백엔드 | FastAPI (별도 저장소) |

## 개발 환경 준비 (예정)

```bash
# 1. Flutter SDK 설치 후
flutter doctor

# 2. 이 폴더에서 Flutter 프로젝트 초기화
flutter create --project-name voiceguard_frontend .

# 3. 실행 (S24 Ultra USB 디버깅 연결 상태)
flutter run
```

> ⚠️ 마이크·오디오 테스트가 필요하므로 에뮬레이터보다 **실기기** 사용을 권장합니다.

## 보안

`.env`, `*.pem`, `*.key`, 서명 키 등 민감 파일은 `.gitignore`로 차단되어 있습니다. **절대 커밋하지 마세요.**
