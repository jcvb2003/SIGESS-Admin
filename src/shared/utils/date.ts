const BRT = 'America/Sao_Paulo';

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // Date-only strings ("2026-06-15") are parsed as UTC midnight by the spec,
  // causing off-by-one in UTC-3. Rewrite to local noon to avoid the shift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  return new Date(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRT,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDate(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRT,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(toDate(value));
}
