import { USE_MOCK_STT } from '@/core/config/env';

/**
 * 웹 파일 STT — 브라우저에서 도는 Whisper(@huggingface/transformers, WASM/WebGPU).
 * 서버 없이 실제 전사. 최초 1회 모델 다운로드(브라우저 캐시). 실패 시 null → 목 폴백.
 */
export interface FileTranscript {
  text: string;
  segments: { text: string; t0: number; t1: number }[];
}

export const fileSttEnabled = !USE_MOCK_STT;

/* eslint-disable @typescript-eslint/no-explicit-any */
let transcriber: any = null;
let tfModule: any = null;

// transformers.js는 onnxruntime-web의 dynamic import 때문에 Metro 번들이 불가.
// → 브라우저 네이티브 module 스크립트로 CDN에서 런타임 로드(번들에 포함 안 됨).
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

function loadTransformers(): Promise<any> {
  if (tfModule) return Promise.resolve(tfModule);
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.__vgTransformers) {
      tfModule = w.__vgTransformers;
      return resolve(tfModule);
    }
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent =
      `import * as T from '${TRANSFORMERS_CDN}';` +
      `window.__vgTransformers = T;` +
      `window.dispatchEvent(new Event('vg-tf-ready'));`;
    window.addEventListener(
      'vg-tf-ready',
      () => {
        tfModule = w.__vgTransformers;
        resolve(tfModule);
      },
      { once: true },
    );
    s.onerror = () => reject(new Error('transformers 로드 실패'));
    document.head.appendChild(s);
  });
}

async function getTranscriber(onProgress?: (p: number) => void): Promise<any> {
  if (transcriber) return transcriber;
  const T = await loadTransformers();
  transcriber = await T.pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
    progress_callback: (p: any) => {
      if (p?.status === 'progress' && typeof p.progress === 'number') onProgress?.(p.progress / 100);
    },
  });
  return transcriber;
}

/** 오디오 파일(uri/blob) → 16kHz 모노 Float32 (Whisper 입력 규격) */
async function decodeTo16kMono(uri: string): Promise<Float32Array> {
  const resp = await fetch(uri);
  const arrayBuf = await resp.arrayBuffer();
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ac = new AC();
  const decoded: AudioBuffer = await ac.decodeAudioData(arrayBuf);

  const len = decoded.length;
  const channels = decoded.numberOfChannels;
  let mono = decoded.getChannelData(0);
  if (channels > 1) {
    mono = new Float32Array(len);
    for (let c = 0; c < channels; c++) {
      const d = decoded.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += d[i] / channels;
    }
  }

  const srcRate = decoded.sampleRate;
  try {
    ac.close?.();
  } catch {
    /* ignore */
  }
  if (srcRate === 16000) return mono;

  // 16kHz로 리샘플
  const dstLen = Math.max(1, Math.round((len * 16000) / srcRate));
  const OAC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const off = new OAC(1, dstLen, 16000);
  const tmp = off.createBuffer(1, len, srcRate);
  tmp.copyToChannel(mono, 0);
  const src = off.createBufferSource();
  src.buffer = tmp;
  src.connect(off.destination);
  src.start();
  const rendered: AudioBuffer = await off.startRendering();
  return rendered.getChannelData(0);
}

export async function ensureWhisperModel(onProgress?: (p: number) => void): Promise<string> {
  await getTranscriber(onProgress);
  return 'web';
}

export async function transcribeAudioFile(
  uri: string,
  cb: { onModelProgress?: (p: number) => void; onTranscribeProgress?: (p: number) => void } = {},
): Promise<FileTranscript | null> {
  if (!fileSttEnabled) return null;
  try {
    const t = await getTranscriber(cb.onModelProgress);
    const audio = await decodeTo16kMono(uri);
    cb.onTranscribeProgress?.(0.1);
    const out: any = await t(audio, {
      language: 'korean',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });
    cb.onTranscribeProgress?.(1);
    const chunks: any[] = out?.chunks ?? [];
    return {
      text: String(out?.text ?? '').trim(),
      segments: chunks.map((c) => ({
        text: c.text,
        t0: Math.round((c.timestamp?.[0] ?? 0) * 100),
        t1: Math.round((c.timestamp?.[1] ?? 0) * 100),
      })),
    };
  } catch {
    return null;
  }
}
