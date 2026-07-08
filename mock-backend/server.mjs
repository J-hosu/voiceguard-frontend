/**
 * 임시 목 백엔드 (테스트 전용).
 *
 * 실제 백엔드(voiceguard-backend, FastAPI)의 계약을 그대로 흉내낸다:
 *   - GET  /health              → { status: "ok" }
 *   - GET  /calls               → CallLog[] (목데이터)
 *   - WS   /ws/calls/analyze    → start / message → call_started / analysis_ack / phishing_detected
 *
 * 규칙 신호/점수는 voiceguard-backend/app/services/rag_detector.py 를 옮겨온 근사치.
 * 앱에서 USE_MOCK_WS=false 로 두고 BASE_URL_WS 를 이 서버로 가리키면 "실제 WS 경로"를 테스트할 수 있다.
 *
 * 실행: npm run mock-backend  (먼저 `npm --prefix mock-backend install` 로 ws 설치)
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;

const PATTERNS = [
  { name: '수사기관/공공기관 사칭', regex: [/검찰/, /경찰/, /금융감독원/, /금감원/, /법원/, /수사관/], weight: 0.42,
    evidence: '검찰·금감원 등 수사기관/공공기관을 사칭하는 표현이 탐지되었습니다.' },
  { name: '범죄 연루 압박', regex: [/범죄.*연루/, /대포통장/, /명의.*도용/, /구속/, /체포/, /영장/], weight: 0.28,
    evidence: '계좌가 범죄에 연루되었다며 압박하는 정황이 확인되었습니다.' },
  { name: '금전 이체 유도', regex: [/안전계좌/, /이체/, /송금/, /입금/, /현금.*인출/, /강제.?상환/], weight: 0.26,
    evidence: '안전계좌 이체 등 금전을 요구·유도하는 표현이 탐지되었습니다.' },
  { name: '개인정보/인증 요구', regex: [/주민등록번호/, /계좌번호/, /비밀번호/, /인증번호/, /OTP/i], weight: 0.22,
    evidence: '계좌번호·인증번호 등 민감한 개인정보를 요구하고 있습니다.' },
  { name: '앱 설치/원격제어 유도', regex: [/앱.*설치/, /원격/, /원격제어/, /URL/i, /링크.*클릭/], weight: 0.18,
    evidence: '앱 설치·원격제어를 유도하는 표현이 탐지되었습니다.' },
  { name: '긴급성/비밀 유지 압박', regex: [/지금.*바로/, /즉시/, /오늘.*안/, /비밀/, /말하지.*마/], weight: 0.14,
    evidence: '즉시 처리·비밀 유지를 강요하는 압박 정황이 있습니다.' },
  { name: '대출/신용 빙자', regex: [/저금리/, /신용.?평점/, /신용.?등급/, /대출/, /연장/, /우회/], weight: 0.4,
    evidence: '저금리 대출·신용평점 하락을 빙자해 상환/이체를 압박하고 있습니다.' },
];

function riskLevel(score) {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

function analyze(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const matched = [];
  let score = 0;
  for (const p of PATTERNS) {
    if (p.regex.some((r) => r.test(cleaned))) {
      matched.push(p.name);
      score += p.weight;
    }
  }
  score = Math.min(score, 0.96);
  const primary = PATTERNS.find((p) => p.name === matched[0]);
  return {
    is_phishing: score >= 0.6,
    risk_score: Math.round(score * 10000) / 10000,
    risk_level: riskLevel(score),
    matched_patterns: matched,
    core_evidence: primary ? primary.evidence : '특별한 위험 신호가 발견되지 않았습니다.',
  };
}

const MOCK_CALLS = [
  { id: 3, device_id: 1, name: '010-7412-5290', status: 'phishing', risk_score: 0.84, risk_level: 'high', detected_label: 1, core_evidence: '수사기관 사칭 표현이 탐지되었습니다.', created_at: '2026-07-09 14:20:00', updated_at: '2026-07-09 14:22:00' },
  { id: 2, device_id: 1, name: '010-3928-1174', status: 'phishing', risk_score: 0.73, risk_level: 'medium', detected_label: 1, core_evidence: '저금리 대출 빙자 정황이 확인되었습니다.', created_at: '2026-07-07 11:05:00', updated_at: '2026-07-07 11:07:00' },
  { id: 1, device_id: 1, name: '1588-1234', status: 'normal', risk_score: 0.12, risk_level: 'low', detected_label: 0, core_evidence: '', created_at: '2026-07-03 09:12:00', updated_at: '2026-07-03 09:13:00' },
];

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (req.url?.startsWith('/calls')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(MOCK_CALLS));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ detail: 'not found' }));
});

const wss = new WebSocketServer({ server, path: '/ws/calls/analyze' });
let nextCallId = 100;

wss.on('connection', (ws) => {
  let logId = null;
  const accumulated = [];

  ws.on('message', (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: '메시지를 해석할 수 없습니다.' }));
      return;
    }
    const type = payload.type ?? 'message';

    if (type === 'start') {
      logId = nextCallId++;
      const now = new Date().toISOString();
      ws.send(JSON.stringify({
        type: 'call_started',
        call: { id: logId, device_id: payload.device_id ?? 1, name: String(payload.name ?? '실시간 통화'),
          status: 'normal', risk_score: 0, risk_level: 'low', detected_label: 0, core_evidence: '', created_at: now, updated_at: now },
      }));
      return;
    }

    if (type !== 'message') {
      ws.send(JSON.stringify({ type: 'error', message: '지원하지 않는 메시지 타입입니다.' }));
      return;
    }
    if (logId === null) {
      ws.send(JSON.stringify({ type: 'error', message: '통화 발화를 보내기 전에 먼저 start 메시지로 통화 기록을 생성해야 합니다.' }));
      return;
    }

    accumulated.push(`${payload.role ?? 'unknown'}: ${payload.content ?? ''}`);
    const result = analyze(accumulated.join('\n'));
    const message = { id: payload.turn_index ?? accumulated.length, log_id: logId, turn_index: payload.turn_index ?? accumulated.length,
      role: payload.role ?? 'unknown', content: payload.content ?? '', created_at: new Date().toISOString() };

    if (result.is_phishing) {
      ws.send(JSON.stringify({ type: 'phishing_detected', log_id: logId, message, is_phishing: true,
        risk_score: result.risk_score, risk_level: result.risk_level, matched_patterns: result.matched_patterns,
        core_evidence: result.core_evidence, retrieved_cases: [], notification: {} }));
    } else {
      ws.send(JSON.stringify({ type: 'analysis_ack', log_id: logId, message, is_phishing: false,
        risk_score: result.risk_score, risk_level: result.risk_level }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[mock-backend] http://localhost:${PORT}  (GET /health, GET /calls, WS /ws/calls/analyze)`);
});
