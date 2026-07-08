import { create } from 'zustand';
import type { CallResult } from '@/data/models/types';
import { MOCK_RESULTS } from '@/data/mock/mockResults';
import { loadJson, saveJson, STORAGE_KEYS } from '@/data/services/storage';

/**
 * 통화 히스토리 저장소.
 *
 * 백엔드에 단일 통화 상세 API(GET /calls/{id})가 없으므로(05 항목 3), 세션 중
 * 앱이 누적한 CallResult를 로컬(AsyncStorage)에 보관한다. 시드 목데이터(MOCK_RESULTS)와
 * 합쳐 히스토리/홈 최근내역/월간 카운트의 데이터 소스로 쓴다.
 */
interface CallState {
  saved: CallResult[]; // 사용자가 만든(영구 저장) 결과
  results: CallResult[]; // saved + 목데이터 (최신순)
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addResult: (r: CallResult) => void;
  getResult: (id: number) => CallResult | undefined;
  clearSaved: () => void;
}

function recompute(saved: CallResult[]): CallResult[] {
  return [...saved, ...MOCK_RESULTS].sort(
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
