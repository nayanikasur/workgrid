import { PRIORITY_LABELS, type TaskDTO, type TaskPriority, type TaskStatus } from '@workgrid/shared';
import { AlertOctagon, Circle, CircleCheck, CircleDashed, CircleDot, CircleEllipsis, Minus, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRIORITY_ICONS = { none: Minus, low: SignalLow, medium: SignalMedium, high: SignalHigh, urgent: AlertOctagon };

export function PriorityIcon({ priority, className }: { priority: TaskPriority; className?: string }) {
  const Icon = PRIORITY_ICONS[priority];
  return (
    <span title={PRIORITY_LABELS[priority]} className="inline-flex">
      <Icon aria-label={PRIORITY_LABELS[priority]} className={cn('size-4', priority === 'urgent' ? 'text-danger' : priority === 'none' ? 'text-subtle' : 'text-muted', className)} />
    </span>
  );
}

const STATUS_ICONS = { backlog: CircleDashed, todo: Circle, in_progress: CircleDot, in_review: CircleEllipsis, done: CircleCheck };
const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: 'text-subtle',
  todo: 'text-muted',
  in_progress: 'text-warning',
  in_review: 'text-brand-fg',
  done: 'text-success',
};

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const Icon = STATUS_ICONS[status];
  return <Icon aria-hidden className={cn('size-4 shrink-0', STATUS_COLORS[status], className)} />;
}

/** Inserts or replaces a task in a cached list. Idempotent, so API responses and socket echoes can both call it. */
export function upsertTask(list: TaskDTO[] | undefined, task: TaskDTO): TaskDTO[] {
  if (!list) return [task];
  return list.some((t) => t.id === task.id) ? list.map((t) => (t.id === task.id ? task : t)) : [...list, task];
}
