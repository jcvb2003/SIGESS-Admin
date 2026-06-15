type Level = 'info' | 'warn' | 'error';

export function log(level: Level, fn: string, msg: string, ctx?: Record<string, unknown>): void {
  const entry = { level, fn, msg, ts: new Date().toISOString(), ...ctx };
  if (level === 'error') console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}
