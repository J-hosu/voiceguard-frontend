import * as FileSystem from 'expo-file-system/legacy';
import { USE_MOCK_STT, WHISPER_MODEL } from '@/core/config/env';
import { isExpoGo } from './sttService';

/**
 * 파일 STT (온디바이스 Whisper, whisper.rn).
 *
 * - dev/preview build에서만 동작. Expo Go/USE_MOCK_STT면 비활성(호출 측이 목으로 폴백).
 * - 모델(WHISPER_MODEL)은 최초 1회 다운로드해 앱 저장소에 캐시 → 이후 오프라인.
 * - whisper.cpp는 16kHz WAV 입력을 전제한다. 업로드 파일이 mp3/m4a면 전사에 실패할 수 있고,
 *   그 경우 null을 반환해 호출 측이 목 시나리오로 폴백한다(향후 ffmpeg 트랜스코딩으로 확장 여지).
 */
export const fileSttEnabled = !isExpoGo && !USE_MOCK_STT;

export interface FileTranscript {
  text: string;
  segments: { text: string; t0: number; t1: number }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let whisperCtx: any = null;

/** 모델 파일 보장(없으면 다운로드). 진행률 0..1 콜백. 로컬 경로 반환. */
export async function ensureWhisperModel(onProgress?: (p: number) => void): Promise<string> {
  const dir = `${FileSystem.documentDirectory}models/`;
  const path = `${dir}${WHISPER_MODEL.name}`;
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists && (info.size ?? 0) > 1_000_000) return path;

  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dl = FileSystem.createDownloadResumable(WHISPER_MODEL.url, path, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });
  const res = await dl.downloadAsync();
  if (!res?.uri) throw new Error('모델 다운로드 실패');
  return res.uri;
}

/** 오디오 파일 전사. 실패 시 null(호출 측이 폴백). */
export async function transcribeAudioFile(
  uri: string,
  cb: { onModelProgress?: (p: number) => void; onTranscribeProgress?: (p: number) => void } = {},
): Promise<FileTranscript | null> {
  if (!fileSttEnabled) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Whisper: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Whisper = require('whisper.rn');
  } catch {
    return null;
  }

  try {
    const modelPath = await ensureWhisperModel(cb.onModelProgress);
    if (!whisperCtx) {
      whisperCtx = await Whisper.initWhisper({ filePath: modelPath });
    }
    const { promise } = whisperCtx.transcribe(uri, {
      language: WHISPER_MODEL.language,
      onProgress: (n: number) => cb.onTranscribeProgress?.(n / 100),
    });
    const r = await promise;
    return {
      text: (r?.result ?? '').trim(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      segments: (r?.segments ?? []).map((s: any) => ({ text: s.text, t0: s.t0, t1: s.t1 })),
    };
  } catch {
    return null;
  }
}
