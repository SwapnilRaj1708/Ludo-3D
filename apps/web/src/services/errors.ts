/**
 * Error reporting abstraction. By default errors go to the console; a
 * monitoring vendor (e.g. Sentry) can be plugged in with `setErrorReporter`
 * without touching call sites. Reports never include game state or PII.
 */
export interface ErrorReport {
  error: unknown;
  context: string;
  extra?: Record<string, string | number | boolean>;
}

export type ErrorReporter = (report: ErrorReport) => void;

let reporter: ErrorReporter = ({ error, context, extra }) => {
  console.error(`[${context}]`, error, extra ?? '');
};

export function setErrorReporter(next: ErrorReporter) {
  reporter = next;
}

export function reportError(error: unknown, context: string, extra?: ErrorReport['extra']) {
  try {
    reporter({ error, context, extra });
  } catch {
    /* reporting must never throw */
  }
}

/** Installs window-level handlers once; returns an uninstall function. */
export function installGlobalErrorHandlers(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onError = (e: ErrorEvent) => reportError(e.error ?? e.message, 'window.error');
  const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason, 'unhandledrejection');
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
