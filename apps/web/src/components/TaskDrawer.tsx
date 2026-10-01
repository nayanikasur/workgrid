import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type CommentDTO,
  type MemberDTO,
  type TaskDTO,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskInput,
} from '@workgrid/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Send, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { keys, useOrg } from '@/lib/org';
import { timeAgo } from '@/lib/utils';
import { Avatar, Button, Spinner } from './ui';

interface Props {
  task: TaskDTO;
  members: MemberDTO[];
  onUpdate: (id: string, patch: UpdateTaskInput) => void;
  onDelete: (task: TaskDTO) => Promise<void>;
  onClose: () => void;
}

const FIELD = 'h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-line-strong focus:border-brand focus:outline-none disabled:hover:border-transparent';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-2">
      <span className="text-xs font-medium text-subtle">{label}</span>
      {children}
    </div>
  );
}

function Comments({ task }: { task: TaskDTO }) {
  const { org, base, can } = useOrg();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const queryKey = keys.comments(org.slug, task.id);

  const { data: comments, isPending } = useQuery({
    queryKey,
    queryFn: async () => (await api.get<{ comments: CommentDTO[] }>(`${base}/tasks/${task.id}/comments`)).comments,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const { comment } = await api.post<{ comment: CommentDTO }>(`${base}/tasks/${task.id}/comments`, { body });
      // The socket echo may land first; only append if it hasn't.
      queryClient.setQueryData<CommentDTO[]>(queryKey, (old = []) => (old.some((c) => c.id === comment.id) ? old : [...old, comment]));
      setBody('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <section>
      <h3 className="mb-3 text-xs font-medium tracking-wide text-subtle uppercase">Comments</h3>
      {isPending ? (
        <Spinner />
      ) : (
        <ul className="space-y-4">
          {comments?.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={c.author.name} color={c.author.avatarColor} />
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-semibold">{c.author.name}</span> <span className="text-subtle">{timeAgo(c.createdAt)}</span>
                </p>
                <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap">{c.body}</p>
              </div>
            </li>
          ))}
          {comments?.length === 0 && <li className="text-sm text-subtle">No comments yet.</li>}
        </ul>
      )}
      {can('comment:create') && (
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment…"
            aria-label="Write a comment"
            className="h-9 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm placeholder:text-subtle focus:border-brand focus:outline-none"
          />
          <Button type="submit" size="icon" className="size-9" loading={sending} disabled={!body.trim()} aria-label="Send comment">
            {!sending && <Send className="size-4" />}
          </Button>
        </form>
      )}
    </section>
  );
}

export function TaskDrawer({ task, members, onUpdate, onDelete, onClose }: Props) {
  const { can } = useOrg();
  const editable = can('task:update');
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const labelText = task.labels.join(', ');
  const [labels, setLabels] = useState(labelText);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Pull in edits made by teammates while the drawer is open.
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setDescription(task.description), [task.description]);
  useEffect(() => setLabels(labelText), [labelText]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveTitle = () => {
    const next = title.trim();
    if (!next) setTitle(task.title);
    else if (next !== task.title) onUpdate(task.id, { title: next });
  };
  const saveLabels = () => {
    const next = [...new Set(labels.split(',').map((l) => l.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
    if (next.join() !== task.labels.join()) onUpdate(task.id, { labels: next });
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await onDelete(task);
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Task ${task.key}`}
        className="animate-slide scrollbar-thin absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto border-l border-line bg-raised shadow-pop"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-raised px-5 py-3">
          <span className="text-xs font-medium text-subtle">{task.key}</span>
          <div className="flex items-center gap-1">
            {can('task:delete') &&
              (confirming ? (
                <Button variant="danger" size="sm" loading={deleting} onClick={remove} onBlur={() => setConfirming(false)}>
                  Confirm delete
                </Button>
              ) : (
                <Button variant="ghost" size="icon" onClick={() => setConfirming(true)} aria-label="Delete task">
                  <Trash2 className="size-4" />
                </Button>
              ))}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
        </header>

        <div className="space-y-6 p-5">
          <textarea
            value={title}
            disabled={!editable}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
            rows={2}
            aria-label="Title"
            className="w-full resize-none rounded-md bg-transparent text-lg leading-snug font-semibold focus:outline-none"
          />

          <div className="space-y-1.5">
            <Row label="Status">
              <select aria-label="Status" disabled={!editable} value={task.status} onChange={(e) => onUpdate(task.id, { status: e.target.value as TaskStatus })} className={FIELD}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Priority">
              <select aria-label="Priority" disabled={!editable} value={task.priority} onChange={(e) => onUpdate(task.id, { priority: e.target.value as TaskPriority })} className={FIELD}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Assignee">
              <select aria-label="Assignee" disabled={!editable} value={task.assigneeId ?? ''} onChange={(e) => onUpdate(task.id, { assigneeId: e.target.value || null })} className={FIELD}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Due date">
              <input
                type="date"
                aria-label="Due date"
                disabled={!editable}
                value={task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : ''}
                // Noon local time keeps the calendar day stable across time zones.
                onChange={(e) => onUpdate(task.id, { dueDate: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null })}
                className={FIELD}
              />
            </Row>
            <Row label="Labels">
              <input
                aria-label="Labels"
                disabled={!editable}
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                onBlur={saveLabels}
                placeholder="frontend, bug"
                className={`${FIELD} placeholder:text-subtle`}
              />
            </Row>
          </div>

          <section>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">Description</h3>
            <textarea
              value={description}
              disabled={!editable}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== task.description && onUpdate(task.id, { description })}
              rows={5}
              placeholder={editable ? 'Add more detail…' : 'No description'}
              aria-label="Description"
              className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-sm leading-relaxed placeholder:text-subtle focus:border-brand focus:outline-none disabled:opacity-70"
            />
          </section>

          <Comments task={task} />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
