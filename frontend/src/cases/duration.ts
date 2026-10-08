export type DurationParts = { days: number; hours: number; minutes: number };

export const toSeconds = ({ days, hours, minutes }: DurationParts): number =>
  days * 86_400 + hours * 3_600 + minutes * 60;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** 120 -> "2 minutes", 129600 -> "1 day 12 hours". Leftover seconds below a minute are dropped. */
export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const parts = [
    days > 0 && plural(days, 'day'),
    hours > 0 && plural(hours, 'hour'),
    minutes > 0 && plural(minutes, 'minute'),
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : '0 minutes';
}
