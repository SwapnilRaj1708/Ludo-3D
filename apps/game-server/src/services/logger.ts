/** Minimal structured logger (JSON lines in production, readable in dev). */
type Fields = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', fields: Fields, message: string) {
  if (process.env.NODE_ENV === 'test' && level === 'info') return;
  const line =
    process.env.NODE_ENV === 'production'
      ? JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...fields })
      : `[${level}] ${message} ${Object.keys(fields).length ? JSON.stringify(fields) : ''}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

export const logger = {
  info: (fields: Fields, message: string) => emit('info', fields, message),
  warn: (fields: Fields, message: string) => emit('warn', fields, message),
  error: (fields: Fields, message: string) => emit('error', fields, message),
};
