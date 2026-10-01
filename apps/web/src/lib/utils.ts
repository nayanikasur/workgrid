import { clsx, type ClassValue } from 'clsx';
import { format, formatDistanceToNowStrict, isPast, isToday, isTomorrow } from 'date-fns';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError, errorMessage } from './api';

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

export const timeAgo = (iso: string) => `${formatDistanceToNowStrict(new Date(iso))} ago`;

export function dueLabel(iso: string): { text: string; overdue: boolean } {
  const date = new Date(iso);
  if (isToday(date)) return { text: 'Today', overdue: false };
  if (isTomorrow(date)) return { text: 'Tomorrow', overdue: false };
  return { text: format(date, 'MMM d'), overdue: isPast(date) };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Suggests a project key from its name: "Website Redesign" → "WR", "Mobile" → "MOB". */
export function suggestKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const key = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 3);
  return key.replace(/^[0-9]+/, '').slice(0, 6);
}

/** Maps a server validation error onto form fields; anything else becomes a toast. */
export function handleFormError<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>) {
  if (err instanceof ApiError && err.details && Object.keys(err.details).length > 0) {
    for (const [field, messages] of Object.entries(err.details)) {
      setError(field as Path<T>, { message: messages[0] });
    }
    return;
  }
  toast.error(errorMessage(err));
}
