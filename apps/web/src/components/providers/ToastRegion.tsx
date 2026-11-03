'use client';

import { uiStyles } from '@/components/ui';
import { useToastStore } from '@/stores/toastStore';

export function ToastRegion() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className={uiStyles.toastRegion} role="status" aria-live="polite" data-testid="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={uiStyles.toast} data-tone={toast.tone}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
