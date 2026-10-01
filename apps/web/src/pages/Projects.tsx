import { zodResolver } from '@hookform/resolvers/zod';
import { PROJECT_COLORS, createProjectSchema, type ProjectDTO } from '@workgrid/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, FolderKanban, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, PageLoader, Textarea } from '@/components/ui';
import { Page } from '@/layouts/AppLayout';
import { api, errorMessage } from '@/lib/api';
import { keys, useOrg } from '@/lib/org';
import { useProjects } from '@/lib/queries';
import { cn, handleFormError, suggestKey } from '@/lib/utils';

function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { org, base } = useOrg();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const form = useForm({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: '', key: '', description: '', color: PROJECT_COLORS[0] },
  });
  const { errors, isSubmitting, dirtyFields } = form.formState;
  const color = form.watch('color');

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { project } = await api.post<{ project: ProjectDTO }>(`${base}/projects`, values);
      await queryClient.invalidateQueries({ queryKey: keys.projects(org.slug) });
      form.reset();
      onClose();
      navigate(`/${org.slug}/projects/${project.id}`);
    } catch (err) {
      handleFormError(err, form.setError);
    }
  });

  return (
    <Modal open={open} onClose={onClose} title="New project" description="Projects group tasks on their own board.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-[1fr_6.5rem] gap-3">
          <Input
            label="Name"
            placeholder="Website Redesign"
            autoFocus
            error={errors.name?.message}
            {...form.register('name', {
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                if (!dirtyFields.key) form.setValue('key', suggestKey(e.target.value));
              },
            })}
          />
          <Input label="Key" placeholder="WEB" className="uppercase" error={errors.key?.message} {...form.register('key')} />
        </div>
        <Textarea label="Description" rows={2} placeholder="What is this project about?" error={errors.description?.message} {...form.register('description')} />
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted">Color</legend>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => form.setValue('color', c)}
                style={{ backgroundColor: c }}
                className={cn('size-6 rounded-full transition-transform hover:scale-110', color === c && 'ring-2 ring-fg ring-offset-2 ring-offset-raised')}
              />
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Create project
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectCard({ project }: { project: ProjectDTO }) {
  const { org, base, can } = useOrg();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const done = project.taskCount - project.openTaskCount;
  const progress = project.taskCount ? Math.round((done / project.taskCount) * 100) : 0;

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: keys.projects(org.slug) });
      toast.success(success);
      setConfirmDelete(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={cn('group relative flex flex-col p-5 transition-colors hover:border-line-strong', project.archived && 'opacity-70')}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: project.color }}>
          {project.key.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          {/* Stretched link: the whole card opens the board. */}
          <Link to={`/${org.slug}/projects/${project.id}`} className="block truncate font-semibold after:absolute after:inset-0">
            {project.name}
          </Link>
          <p className="text-xs text-subtle">{project.key}</p>
        </div>
        {project.archived && <Badge>Archived</Badge>}
      </div>
      <p className="mb-4 line-clamp-2 min-h-10 text-sm text-muted">{project.description || 'No description'}</p>

      <div className="mt-auto">
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>
            {done} of {project.taskCount} done
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-hover">
          <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {(can('project:update') || can('project:delete')) && (
        <div className="absolute top-3 right-3 z-10 flex gap-0.5 rounded-md bg-surface opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {can('project:update') && (
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={project.archived ? 'Restore project' : 'Archive project'}
              onClick={() =>
                run(() => api.patch(`${base}/projects/${project.id}`, { archived: !project.archived }), project.archived ? 'Project restored' : 'Project archived')
              }
            >
              {project.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            </Button>
          )}
          {can('project:delete') && (
            <Button variant="ghost" size="icon" disabled={busy} aria-label="Delete project" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${project.name}?`}
        description={`This permanently deletes the project and its ${project.taskCount} tasks. This cannot be undone.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={() => run(() => api.delete(`${base}/projects/${project.id}`), 'Project deleted')}>
            Delete project
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

export function ProjectsPage() {
  const { can } = useOrg();
  const { data: projects, isPending } = useProjects();
  const [creating, setCreating] = useState(false);

  const newButton = can('project:create') && (
    <Button onClick={() => setCreating(true)}>
      <Plus className="size-4" /> New project
    </Button>
  );

  return (
    <Page>
      <PageHeader title="Projects" description="Every board in this workspace." actions={newButton} />
      {isPending ? (
        <PageLoader />
      ) : projects?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FolderKanban className="size-5" />}
          title="No projects yet"
          description="Create your first project to start organising tasks on a board."
          action={newButton}
        />
      )}
      <CreateProjectModal open={creating} onClose={() => setCreating(false)} />
    </Page>
  );
}
