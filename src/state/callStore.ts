import { create } from 'zustand';
import type { CallResult } from '@/data/models/types';
import { loadJson, saveJson, STORAGE_KEYS } from '@/data/services/storage';

/**
 * 통화 히스토리 저장소.
 *
 * 백엔드에 단일 통화 상세 API(GET /calls/{id})가 없으므로, 세션 중 앱이 누적한
 * CallResult(실제 백엔드 분석 결과)를 로컬(AsyncStorage)에 보관해 히스토리/홈
 * 최근내역/월간 카운트의 데이터 소스로 쓴다. (시드 목데이터 제거 — 실사용)
 */
interface CallState {
  saved: CallResult[]; // 사용자가 만든(영구 저장) 결과
  results: CallResult[]; // 최신순 정렬 결과
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addResult: (r: CallResult) => void;
  getResult: (id: number) => CallResult | undefined;
  clearSaved: () => void;
}

function recompute(saved: CallResult[]): CallResult[] {
  return [...saved].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export const useCallStore = create<CallState>((set, get) => ({
  saved: [],
  results: recompute([]),
  hydrated: false,
  hydrate: async () => {
    const saved = (await loadJson<CallResult[]>(STORAGE_KEYS.results)) ?? [];
    set({ saved, results: recompute(saved), hydrated: true });
  },
  addResult: (r) => {
    const saved = [r, ...get().saved];
    void saveJson(STORAGE_KEYS.results, saved);
    set({ saved, results: recompute(saved) });
  },
  getResult: (id) => get().results.find((r) => r.id === id),
  clearSaved: () => {
    void saveJson(STORAGE_KEYS.results, []);
    set({ saved: [], results: recompute([]) });
  },
}));
