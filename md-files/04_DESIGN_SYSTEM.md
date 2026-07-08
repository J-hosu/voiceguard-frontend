# 04. 디자인 시스템

> 핵심 원칙: **위험도를 색으로 직관 구분**하되, 보이스피싱 피해가 고령층에 많으므로
> **색상 + 아이콘 + 텍스트 라벨을 항상 함께** 사용(색맹·저시력 대응).
> 아래 Dart 코드 조각은 참고용이며, 실제 구현은 RN `src/core/theme/`(색·테마)와 `src/core/utils/riskLevel.ts`(등급 매핑)에 있음.
> ⚠️ 실제 색은 최종 디자인 HTML 기준으로 **Primary = `#2563EB`**(본 문서의 `#1A73E8` 아님).

## 1. 색상 팔레트

| 이름 | HEX | 용도 |
| --- | --- | --- |
| Primary Blue | `#1A73E8` | 브랜드/버튼/앱바 |
| Safe Green | `#1E8E3E` | 정상 판정 배지·아이콘 |
| Warning Amber | `#F9A825` | 주의(위험도 70~84%) |
| Danger Red | `#D93025` | 강한 경고(85%↑)·위험 경고 모달 |
| Surface Light | `#FAFAFA` | 라이트 배경 |
| Surface Dark | `#121212` | 다크 배경(One UI 다크 대응) |

```dart
// core/theme/app_colors.dart
class AppColors {
  static const primary   = Color(0xFF1A73E8);
  static const safe      = Color(0xFF1E8E3E);
  static const warning   = Color(0xFFF9A825);
  static const danger    = Color(0xFFD93025);
  static const surfaceLight = Color(0xFFFAFAFA);
  static const surfaceDark  = Color(0xFF121212);
}

// RiskLevel → 색/라벨/아이콘 (단일 매핑)
// safe    → safe(초록),  "정상", Icons.check_circle
// warning → warning(주황), "주의", Icons.warning_amber
// danger  → danger(빨강), "위험", Icons.error
```

## 2. 타이포그래피

- 폰트: 시스템 기본(Noto Sans KR) 또는 **Pretendard** (가독성·무료 라이선스). `google_fonts`로 Noto Sans KR가 간편.
- 제목: 20~24sp, Bold / 본문: 14~16sp / **경고 문구: 18sp 이상**(고령 가독성).
- "큰 글씨 모드" 설정 시 배율(예: 1.15~1.3x)을 `MediaQuery.textScaler`로 적용.

## 3. 컴포넌트 가이드

| 컴포넌트 | 규칙 |
| --- | --- |
| 버튼 | Material 3 `FilledButton`(주요), `OutlinedButton`(보조). **최소 터치 48dp.** |
| 카드 | 히스토리/결과 요약. **좌측 위험도 색 스트라이프**로 등급 표시. |
| 칩(Chip) | 탐지 키워드, 위험 등급(정상/주의/위험) 배지. |
| 위험도 게이지 | 원형 %게이지(`percent_indicator`). 색은 등급 색. 화면 4는 소형 배지형, 화면 7은 대형. |
| 타임라인 | 위험도 추이 막대/영역 그래프(`fl_chart`). |
| 경고 모달 | 풀스크린, danger 배경, 대형 아이콘, 큰 텍스트. |

### 공통 위젯(권장 구현)
- `RiskBadge(level)` — 색+아이콘+텍스트 세트(재사용, 접근성 보장).
- `RiskGauge(score, size)` — 원형 게이지.
- `KeywordChip(text)` — 탐지 키워드 칩.
- `CallCard(call)` — 좌측 색 스트라이프 + 유형/시각/위험도/소스.

## 4. 접근성 (요구사항)

- 경고 발생 시 **화면 색 + 진동(Vibration) + 알림음** 동시.
- 다크모드 시스템 설정 자동 대응(`ThemeMode.system`).
- 위험 정보는 **절대 색만으로 전달하지 않음** — 항상 텍스트 라벨 병기.
- "큰 글씨 모드" 옵션 제공(설정 화면).
- 경고/본문은 충분한 명암비 유지.
