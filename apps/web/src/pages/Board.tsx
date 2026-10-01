import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  STATUS_LABELS,
  TASK_STATUSES,
  type CommentDTO,
  type MemberDTO,
  type PresenceUser,
  type TaskDTO,
  type TaskStatus,
  type UpdateTaskInput,
} from '@workgrid/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MessageSquare, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useUser } from '@/auth/AuthProvider';
import { TaskDrawer } from '@/components/TaskDrawer';
import { PriorityIcon, StatusIcon, upsertTask } from '@/components/task-bits';
import { Avatar, Badge, PageLoader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { keys, useOrg } from '@/lib/org';
import { useMembers, useProjects, useTasks } from '@/lib/queries';
import { getSocket } from '@/lib/socket';
import { cn, dueLabel } from '@/lib/utils';
import { NotFoundPage } from './NotFound';

/** Matches the API's spacing between neighbouring tasks. */
const POSITION_STEP = 1024;

/** Joins the project's socket room and folds live events into the query cache. */
function useBoardRealtime(projectId: string): PresenceUser[] {
  const { org, realtimeReady } = useOrg();
  const queryClient = useQueryClient();
  const [presence, setPresence] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!realtimeReady) return;
    const socket = getSocket();
    const tasksKey = keys.tasks(org.slug, projectId);

    const onUpsert = (task: TaskDTO) => {
      if (task.projectId === projectId) queryClient.setQueryData<TaskDTO[]>(tasksKey, (old) => upsertTask(old, task));
    };
    const onDeleted = ({ id }: { id: string }) => queryClient.setQueryData<TaskDTO[]>(tasksKey, (old) => old?.filter((t) => t.id !== id));
    const onComment = (comment: CommentDTO) =>
      // Only patch threads that are already loaded; others fetch fresh when opened.
      queryClient.setQueryData<CommentDTO[]>(keys.comments(org.slug, comment.taskId), (old) =>
        old && !old.some((c) => c.id === comment.id) ? [...old, comment] : old,
      );
    const onPresence = (payload: { projectId: string; users: PresenceUser[] }) => {
      if (payload.projectId === projectId) setPresence(payload.users);
    };

    socket.on('task:created', onUpsert);
    socket.on('task:updated', onUpsert);
    socket.on('task:deleted', onDeleted);
    socket.on('comment:created', onComment);
    socket.on('presence:update', onPresence);
    socket.emit('project:join', projectId);
    // Catch up on anything that changed while the socket was away.
    void queryClient.invalidateQueries({ queryKey: tasksKey });

    return () => {
      socket.emit('project:leave', projectId);
      socket.off('task:created', onUpsert);
      socket.off('task:updated', onUpsert);
      socket.off('task:deleted', onDeleted);
      socket.off('comment:created', onComment);
      socket.off('presence:update', onPresence);
      setPresence([]);
    };
  }, [realtimeReady, org.slug, projectId, queryClient]);

  return presence;
}

function TaskCard({ task, assignee, onOpen }: { task: TaskDTO; assignee?: MemberDTO; onOpen: () => void }) {
  const due = task.dueDate ? dueLabel(task.dueDate) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="rounded-lg border border-line bg-surface p-3 shadow-xs transition-colors hover:border-line-strong"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-subtle">{task.key}</span>
        <PriorityIcon priority={task.priority} className="size-3.5" />
      </div>
      <p className={cn('text-sm leading-snug font-medium break-words', task.status === 'done' && 'text-muted line-through decoration-subtle')}>{task.title}</p>
      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <Badge key={l}>{l}</Badge>
          ))}
        </div>
      )}
      {(due || task.commentCount > 0 || assignee) && (
        <div className="mt-2.5 flex items-center gap-3 text-xs text-subtle">
          {due && (
            <span className={cn('inline-flex items-center gap-1', due.overdue && task.status !== 'done' && 'font-medium text-danger')}>
              <CalendarDays className="size-3.5" />
              {due.text}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3.5" />
              {task.commentCount}
            </span>
          )}
          {assignee && <Avatar name={assignee.user.name} color={assignee.user.avatarColor} size="xs" className="ml-auto" />}
        </div>
      )}
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = title.trim();
    if (!value) return setOpen(false);
    setTitle('');
    await onAdd(value); // stays open so several tasks can be added in a row
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-subtle hover:bg-hover hover:text-fg">
        <Plus className="size-3.5" /> Add task
      </button>
    );
  }
  return (
    <form onSubmit={submit}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title.trim() && setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && (setTitle(''), setOpen(false))}
        placeholder="Task title, then Enter"
        aria-label="New task title"
        className="h-9 w-full rounded-lg border border-brand bg-surface px-3 text-sm placeholder:text-subtle focus:outline-none"
      />
    </form>
  );
}

export function BoardPage() {
  const projectId = useParams().projectId!;
  const { org, base, can } = useOrg();
  const me = useUser();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');

  const { data: projects } = useProjects();
  const { data: members = [] } = useMembers();
  const { data: tasks, isPending, isError } = useTasks(projectId);
  const presence = useBoardRealtime(projectId);

  const project = projects?.find((p) => p.id === projectId);
  const tasksKey = keys.tasks(org.slug, projectId);
  const canEdit = can('task:update');
  const memberByUser = useMemo(() => new Map(members.map((m) => [m.user.id, m])), [members]);

  const columns = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = (tasks ?? []).filter(
      (t) =>
        (!query || t.title.toLowerCase().includes(query) || t.key.toLowerCase().includes(query)) &&
        (assigneeFilter === 'all' || (assigneeFilter === 'none' ? !t.assigneeId : t.assigneeId === assigneeFilter)),
    );
    return Object.fromEntries(
      TASK_STATUSES.map((status) => [status, visible.filter((t) => t.status === status).sort((a, b) => a.position - b.position)]),
    ) as Record<TaskStatus, TaskDTO[]>;
  }, [tasks, search, assigneeFilter]);

  /** Optimistic: the card moves immediately and snaps back if the server refuses. */
  const updateTask = useCallback(
    (id: string, patch: UpdateTaskInput) => {
      queryClient.setQueryData<TaskDTO[]>(tasksKey, (old) => old?.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      api
        .patch<{ task: TaskDTO }>(`${base}/tasks/${id}`, patch)
        .then(({ task }) => queryClient.setQueryData<TaskDTO[]>(tasksKey, (old) => upsertTask(old, task)))
        .catch((err) => {
          toast.error(errorMessage(err));
          void queryClient.invalidateQueries({ queryKey: tasksKey });
        });
    },
    // tasksKey is rebuilt every render; its inputs are org.slug and projectId.
    [base, org.slug, projectId, queryClient],
  );

  const addTask = async (status: TaskStatus, title: string) => {
    try {
      const { task } = await api.post<{ task: TaskDTO }>(`${base}/projects/${projectId}/tasks`, { title, status });
      queryClient.setQueryData<TaskDTO[]>(tasksKey, (old) => upsertTask(old, task));
      void queryClient.invalidateQueries({ queryKey: keys.projects(org.slug) });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const openTask = useCallback(
    (id: string | null) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('task', id);
        else next.delete('task');
        return next;
      }),
    [setParams],
  );

  const deleteTask = async (task: TaskDTO) => {
    await api.delete(`${base}/tasks/${task.id}`);
    queryClient.setQueryData<TaskDTO[]>(tasksKey, (old) => old?.filter((t) => t.id !== task.id));
    void queryClient.invalidateQueries({ queryKey: keys.projects(org.slug) });
    openTask(null);
    toast.success(`${task.key} deleted`);
  };

  const onDragEnd = ({ source, destination, draggableId }: DropResult) => {
    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return;
    const status = destination.droppableId as TaskStatus;
    // Neighbours in the destination column once the dragged card is lifted out.
    const column = columns[status].filter((t) => t.id !== draggableId);
    const before = column[destination.index - 1];
    const after = column[destination.index];
    const position =
      before && after ? (before.position + after.position) / 2 : before ? before.position + POSITION_STEP : after ? after.position / 2 : POSITION_STEP;
    updateTask(draggableId, { status, position });
  };

  if (isError || (projects && !project)) return <NotFoundPage title="Project not found" description="It may have been deleted." />;
  if (isPending || !project) return <PageLoader />;

  const openTaskId = params.get('task');
  const activeTask = tasks.find((t) => t.id === openTaskId);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: project.color }} />
          <h1 className="truncate text-base font-semibold">{project.name}</h1>
          <Badge>{project.key}</Badge>
          {project.archived && <Badge>Archived</Badge>}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {presence.length > 0 && (
            <div className="mr-1 flex items-center" aria-label={`${presence.length} viewing now`}>
              <div className="flex -space-x-1.5">
                {presence.slice(0, 5).map((u) => (
                  <Avatar key={u.id} name={u.name} color={u.avatarColor} className="ring-2 ring-surface" />
                ))}
              </div>
              <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted">
                <span className="size-1.5 rounded-full bg-success" /> Live
              </span>
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks"
              aria-label="Search tasks"
              className="h-8 w-40 rounded-md border border-line-strong bg-surface pr-2 pl-8 text-sm placeholder:text-subtle focus:border-brand focus:outline-none"
            />
          </div>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            aria-label="Filter by assignee"
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm focus:border-brand focus:outline-none"
          >
            <option value="all">Everyone</option>
            <option value={me.id}>Assigned to me</option>
            <option value="none">Unassigned</option>
            {members
              .filter((m) => m.user.id !== me.id)
              .map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
          </select>
        </div>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="scrollbar-thin flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 sm:px-6">
          {TASK_STATUSES.map((status) => (
            <section key={status} aria-label={STATUS_LABELS[status]} className="flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-hover/60">
              <h2 className="flex items-center gap-2 px-3 pt-3 pb-2 text-sm font-semibold">
                <StatusIcon status={status} />
                {STATUS_LABELS[status]}
                <span className="font-normal text-subtle">{columns[status].length}</span>
              </h2>
              <Droppable droppableId={status}>
                {(drop, dropState) => (
                  <div
                    ref={drop.innerRef}
                    {...drop.droppableProps}
                    className={cn('scrollbar-thin min-h-16 flex-1 overflow-y-auto px-2 pb-1 transition-colors', dropState.isDraggingOver && 'rounded-lg bg-brand-soft/60')}
                  >
                    {columns[status].map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!canEdit}>
                        {(drag, dragState) => (
                          <div
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            {...drag.dragHandleProps}
                            className={cn('pb-2', dragState.isDragging && '[&>div]:border-brand [&>div]:shadow-pop')}
                          >
                            <TaskCard task={task} assignee={task.assigneeId ? memberByUser.get(task.assigneeId) : undefined} onOpen={() => openTask(task.id)} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {drop.placeholder}
                  </div>
                )}
              </Droppable>
              {can('task:create') && (
                <div className="p-2 pt-1">
                  <QuickAdd onAdd={(title) => addTask(status, title)} />
                </div>
              )}
            </section>
          ))}
        </div>
      </DragDropContext>

      {activeTask && <TaskDrawer key={activeTask.id} task={activeTask} members={members} onUpdate={updateTask} onDelete={deleteTask} onClose={() => openTask(null)} />}
    </div>
  );
}
