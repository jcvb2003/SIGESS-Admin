import { formatDateTime as fmt } from '@/shared/utils/date';

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Nunca";
  return fmt(value);
}
