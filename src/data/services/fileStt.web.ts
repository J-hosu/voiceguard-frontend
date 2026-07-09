/**
 * 웹 전용 파일 STT 스텁 — whisper.rn(네이티브)이 웹에 없으므로 비활성.
 * 업로드 화면은 fileSttEnabled=false를 보고 목(시나리오) 분석으로 폴백한다.
 */
export interface FileTranscript {
  text: string;
  segments: { text: string; t0: number; t1: number }[];
}

export const fileSttEnabled = false;

export async function ensureWhisperModel(): Promise<string> {
  throw new Error('웹에서는 온디바이스 Whisper를 사용할 수 없습니다.');
}

export async function transcribeAudioFile(): Promise<FileTranscript | null> {
  return null;
}
