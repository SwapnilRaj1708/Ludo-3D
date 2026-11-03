'use client';

import { create } from 'zustand';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger' | 'celebrate';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastStore {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone, durationMs?: number) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;
const MAX_VISIBLE = 3;

export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],
  push: (message, tone = 'neutral', durationMs = 2600) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }].slice(-MAX_VISIBLE) }));
    if (durationMs > 0) setTimeout(() => get().dismiss(id), durationMs);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));
