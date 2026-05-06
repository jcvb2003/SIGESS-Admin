export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("pt-BR");
}
