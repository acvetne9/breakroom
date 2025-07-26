import { formatDistanceToNow } from 'date-fns';

export function formatTimeAgo(date: Date): string {
  const distance = formatDistanceToNow(date, { addSuffix: false });
  
  // Convert to shorter format
  return distance
    .replace('about ', '')
    .replace('less than a minute', '1min')
    .replace('minute', 'min')
    .replace('minutes', 'min')
    .replace('hour', 'hr')
    .replace('hours', 'hr')
    .replace('day', 'd')
    .replace('days', 'd')
    .replace('month', 'mo')
    .replace('months', 'mo')
    .replace('year', 'yr')
    .replace('years', 'yr')
    .replace(/\s+/g, '');
}