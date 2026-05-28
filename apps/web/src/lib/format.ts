/**
 * Format money in INR with Indian number system grouping.
 */
export function formatINR(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '--';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '--';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num);
}

/**
 * Format weight in grams with 3 decimal places.
 */
export function formatWeight(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '--';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '--';
  return `${num.toFixed(3)} g`;
}

/**
 * Format date for display.
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}
