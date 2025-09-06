import { differenceInMinutes, differenceInHours, differenceInDays, differenceInMonths, differenceInYears } from 'date-fns';

export function formatTimeAgo(date: Date): string {
  const now = new Date();

  const years = differenceInYears(now, date);
  if (years >= 1) return `${years}yr`;

  const months = differenceInMonths(now, date);
  if (months >= 1) return `${months}mo`;

  const days = differenceInDays(now, date);
  if (days >= 1) return `${days}d`;

  const hours = differenceInHours(now, date);
  if (hours >= 1) return `${hours}hr`;

  const minutes = differenceInMinutes(now, date);
  if (minutes >= 1) return `${minutes}min`;

  return '1min'; // round down: anything < 1 min shows as 1min
}
