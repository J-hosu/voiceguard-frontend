# 02. API 연동 (실제 백엔드 기준)

> **이 문서만이 유효한 API 기준입니다.** 기능명세서 §6, 프론트 스펙 §3.2의 엔드포인트는 **초안이며 실제로 없습니다.**
> 아래는 `API_SPEC.md`(실구현) 기준으로 프론트가 소비할 방식만 정리한 것입니다.
> 코드 예시는 Dart(참고용)이며, 실제 TypeScript 타입은 `src/data/models/types.ts`, WS/분석 로직은 `src/data/services/`에 구현되어 있습니다.
> 참고: 실제 `GET /calls` 응답은 `CallLog`(id, device_id, name, status, risk_score, risk_level, detected_label, core_evidence, created_at, updated_at) — 문서의 category/source 필드는 없어 앱에서 근사 도출함.

---

## 0. 기본 주소

```text
HTTP: http://127.0.0.1:8000      (데모: ngrok/cloudflared HTTPS URL로 대체)
WS:   ws://127.0.0.1:8000        (데모: wss://... 로 대체)
```

- 인증 없음(MVP 로컬 데모). `core/config/env.dart`에서 baseUrl 일원화.

## 백엔드가 제공하는 것 / 제공하지 않는 것 (요약)

| 필요 기능 | 실제 백엔드 | 프론트 대응 |
| --- | --- | --- |
| 헬스체크 | `GET /health` ✅ | 연결 확인용 |
| 히스토리 목록 | `GET /calls` ✅ (응답 스키마 미명시 ⚠️) | 스키마 확인 요청 필요 |
| 실시간 분석 | `WS /ws/calls/analyze` ✅ (**텍스트 입력**) | 온디바이스 STT 후 텍스트 전송 |
| 음성 파일 업로드/파일 STT | ❌ 없음 | **[확정] 온디바이스 STT 우회** (요청 보류) |
| 단일 통화 상세(`GET /calls/{id}`) | ❌ 없음 | 세션 중 앱 메모리 누적 or 백엔드 요청 |
| 근거 상세(의심 단어/문장 하이라이트) | ❌ 없음(카테고리·문장 1개만) | 백엔드 요청 |
| 권장행동 텍스트 | ❌ WS 응답에 없음 | 유형별 정적 매핑 or 백엔드 요청 |
| CSV/JSON 내보내기 | ❌ 없음 | 앱에서 로컬 생성 |
| 월간 통계 / 필터 카운트 | ❌ 없음 | `GET /calls`로 앱에서 집계 |

> ❌ 항목의 상세·요청문은 `05_BACKEND_REQUESTS.md`.

---

## 1. REST 엔드포인트

### 1-1. `GET /health`
연결/터널 상태 확인.
```json
{ "status": "ok" }
```

### 1-2. `GET /calls` — 히스토리 목록
히스토리 화면·홈 "최근 분석 내역"·월간 통계의 **유일한 데이터 소스**.

> ⚠️ **응답 스키마가 API_SPEC.md에 명시돼 있지 않습니다.** 아래는 화면이 필요로 하는 **예상 필드**이며, 실제 필드명은 백엔드 확인 필수(`05_BACKEND_REQUESTS.md` 항목 2). 모델은 방어적으로(널 허용) 작성하세요.

화면이 필요로 하는 항목:
```jsonc
// 기대 형태 (확인 필요)
[
  {
    "id": 1,
    "name": "테스트 통화",
    "category": "수사기관 사칭형",   // 유형 라벨
    "risk_score": 0.84,
    "risk_level": "high",           // low/medium/high (백엔드 기준)
    "source": "realtime",           // realtime | file (있으면 좋음)
    "created_at": "2025-..."
  }
]
```

### 1-3. (참고) 학습 데이터 엔드포인트 — 앱 범위 밖
`POST /training-cases/import-json`, `GET /training-cases` 는 데이터 주입/관리용입니다. **앱에서 호출하지 않습니다.**

---

## 2. WebSocket — 실시간 분석 `/ws/calls/analyze`

핵심 흐름: **connect → `start` → `call_started` 수신 → (STT 발화마다) `message` → `analysis_ack`/`phishing_detected` 수신 → 종료 시 close.**

```text
[앱]  connect ws://.../ws/calls/analyze
[앱]  → { "type":"start", "device_id":1, "name":"테스트 통화" }
[서버]← { "type":"call_started", "call":{ "id":1, "device_id":1, "name":"테스트 통화" } }

  (온디바이스 STT가 발화 1턴을 인식할 때마다)
[앱]  → { "type":"message", "role":"speaker_a", "content":"검찰입니다. 계좌가...", "turn_index":1 }
[서버]← { "type":"analysis_ack", "is_phishing":false, "risk_score":0.2, "risk_level":"low" }
        ...또는...
[서버]← { "type":"phishing_detected", "is_phishing":true, "risk_score":0.84,
          "risk_level":"high", "matched_patterns":["수사기관/공공기관 사칭"],
          "core_evidence":"검찰 사칭 표현이 탐지되었습니다.", "notification":{} }

[서버]← { "type":"error", "message":"...먼저 start 메시지로 통화 기록을 생성해야 합니다." }
```

### 클라이언트 → 서버 메시지

**`start`** (통화 세션 시작, 발화 전 최초 1회 필수)
```jsonc
{ "type":"start", "device_id":1, "name":"테스트 통화" }
```
- `device_id`: **발급 방법이 정의돼 있지 않음** → MVP는 고정값(예: 1) 사용, 규칙은 확인 요청(`05` 항목 8).
- `start` 전에 `message`를 보내면 `error` 응답.

**`message`** (발화 1턴 분석 요청)
```jsonc
{ "type":"message", "role":"speaker_a", "content":"<STT 텍스트>", "turn_index":1 }
```
- `content`: **앱이 온디바이스 STT로 만든 텍스트.** 서버는 STT를 하지 않음.
- `turn_index`: 1부터 증가. STT "최종 결과" 1건 = 1턴.
- `role`: 예시엔 `speaker_a`만 등장. 화자 구분이 어려우므로 캡처 발화를 `speaker_a`로 통일 권장(규칙 확인은 `05` 항목 7).

### 서버 → 클라이언트 이벤트

| type | 의미 | 주요 필드 |
| --- | --- | --- |
| `call_started` | 세션 생성됨 | `call.id`, `call.device_id`, `call.name` |
| `analysis_ack` | 정상(위험 낮음) | `is_phishing:false`, `risk_score`, `risk_level` |
| `phishing_detected` | 피싱 탐지 | `is_phishing:true`, `risk_score`, `risk_level`, `matched_patterns[]`, `core_evidence`, `notification{}` |
| `error` | 오류 | `message` |

- `matched_patterns`: 문자열 배열(예: `["수사기관/공공기관 사칭"]`). 화면의 "핵심 근거"·"탐지 키워드 칩"에 사용.
- `core_evidence`: 근거 문장 1개.
- `notification`: 스키마 미정의(빈 객체). 무시하되 형태 확인 요청(`05` 항목 10).

### 연결/재연결 지침
- `web_socket_channel`로 스트림 구독. 끊기면 재연결 후 다시 `start` 필요(세션 재개 규칙 미정 → `05` 항목 9). 재연결 시 **새 call로 취급**될 수 있음에 유의.
- 종료: 사용자가 "종료" 누르면 socket close.

---

## 3. 위험도 등급 매핑 (⚠️ 3중 불일치 — 반드시 확인)

세 문서의 기준이 다릅니다. **UI 표기는 하나의 소스(`core/utils/risk_level.dart`)로 통일**하세요.

| 출처 | 기준 |
| --- | --- |
| `API_SPEC.md` (`risk_level`) | low `<0.45` / medium `0.45~0.75` / high `≥0.75` |
| 기능명세서 §10 (UI UX 기준) | 주의 `70%↑` / 강한 경고 `85%↑` |
| Figma | 12%=정상, 73%=주의, 84%·92%=위험 |

### 권장 처리 (확정 전 기본값)
- **경고 트리거·라벨은 기능명세서 §10(70/85) 기준을 UI 진실 소스로 채택**하고, `risk_score`에서 직접 계산.
- 백엔드 `risk_level`(low/medium/high)은 참고용으로만 보관(디버깅/정합성 확인).
- 이 결정은 백엔드와 **정렬 확인 필요**(`05` 항목 5).

```dart
// core/utils/risk_level.dart  (단일 소스)
enum RiskLevel { safe, warning, danger } // 정상 / 주의 / 강한경고(위험)

RiskLevel riskLevelFromScore(double score) {
  if (score >= 0.85) return RiskLevel.danger;   // 강한 경고 → 경고 모달
  if (score >= 0.70) return RiskLevel.warning;  // 주의
  return RiskLevel.safe;                          // 정상
}
```

> 참고: Figma 히스토리에서 84%가 "위험(빨강)"으로 표시된 반면 §10은 85%가 강한 경고입니다. 이 1%p 경계와 "보이스피싱 의심(빨강 헤더)" 표기 시점은 디자인 확인 항목입니다(`05` 항목 5).

---

## 4. 데이터 모델 스케치 (Dart)

```dart
// data/models/analysis_event.dart
sealed class AnalysisEvent {}

class CallStarted extends AnalysisEvent {
  final int callId; final int deviceId; final String name;
  CallStarted(this.callId, this.deviceId, this.name);
}

class AnalysisAck extends AnalysisEvent {
  final bool isPhishing; final double riskScore; final String riskLevel;
  AnalysisAck(this.isPhishing, this.riskScore, this.riskLevel);
}

class PhishingDetected extends AnalysisEvent {
  final double riskScore; final String riskLevel;
  final List<String> matchedPatterns; final String coreEvidence;
  PhishingDetected(this.riskScore, this.riskLevel, this.matchedPatterns, this.coreEvidence);
}

class AnalysisError extends AnalysisEvent {
  final String message; AnalysisError(this.message);
}

// data/models/call.dart  (GET /calls — 필드는 백엔드 확인 후 확정)
class Call {
  final int id;
  final String? name;
  final String? category;   // 유형
  final double? riskScore;
  final String? riskLevel;  // low/medium/high
  final String? source;     // realtime/file
  final DateTime? createdAt;
  // fromJson은 널 방어적으로
}
```

> `analysis_result.dart`(통화 요약)은 **서버가 아니라 앱이** 세션 동안 누적한 발화/이벤트로 구성합니다. 자세한 이유는 `05` 항목 3.
