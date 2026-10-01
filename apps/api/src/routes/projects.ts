import {
  STATUS_LABELS,
  createCommentSchema,
  createProjectSchema,
  createTaskSchema,
  updateProjectSchema,
  updateTaskSchema,
  type ProjectDTO,
  type TaskStatus,
} from '@workgrid/shared';
import { Router, type Request } from 'express';
import type { Types } from 'mongoose';
import { badRequest, conflict, notFound, parse } from '../lib/errors';
import { toCommentDTO, toTaskDTO } from '../lib/serialize';
import { authUserId, requirePermission, tenantOf } from '../middleware/auth';
import { Membership } from '../models/Organization';
import { Comment, Project, Task, type ProjectDoc } from '../models/Project';
import { User, type UserDoc } from '../models/User';
import { audit } from '../services/audit';
import { assertCanAddProject } from '../services/billing';
import { emitToOrg, emitToProject } from '../services/realtime';

/** Gap between neighbouring tasks, leaving room to drop cards in between without renumbering. */
const POSITION_STEP = 1024;

export const projectsRouter = Router({ mergeParams: true });

// No orgId filters below: the tenant plugin scopes every query to the current org.

async function taskCounts(): Promise<Map<string, { total: number; open: number }>> {
  const rows = await Task.aggregate<{ _id: unknown; total: number; open: number }>([
    { $group: { _id: '$projectId', total: { $sum: 1 }, open: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 0, 1] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { total: r.total, open: r.open }]));
}

function toProjectDTO(project: ProjectDoc, counts?: { total: number; open: number }): ProjectDTO {
  return {
    id: project.id,
    name: project.name,
    key: project.key,
    description: project.description,
    color: project.color,
    archived: project.archived,
    taskCount: counts?.total ?? 0,
    openTaskCount: counts?.open ?? 0,
    createdAt: project.createdAt.toISOString(),
  };
}

async function loadProject(req: Request): Promise<ProjectDoc> {
  const project = await Project.findOne({ _id: req.params.projectId });
  if (!project) throw notFound('Project not found');
  return project;
}

async function loadTask(req: Request) {
  const task = await Task.findOne({ _id: req.params.taskId });
  if (!task) throw notFound('Task not found');
  return task;
}

async function assertAssignable(req: Request, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  if (!(await Membership.exists({ orgId: tenantOf(req).org._id, userId: assigneeId }))) {
    throw badRequest('Assignee is not a member of this workspace');
  }
}

async function endOfColumn(projectId: Types.ObjectId, status: TaskStatus): Promise<number> {
  const last = await Task.findOne({ projectId, status }).sort('-position').select('position');
  return (last?.position ?? 0) + POSITION_STEP;
}

/* --------------------------------- Projects --------------------------------- */

projectsRouter.get('/projects', async (_req, res) => {
  const [projects, counts] = await Promise.all([Project.find({}).sort('archived name'), taskCounts()]);
  res.json({ projects: projects.map((p) => toProjectDTO(p, counts.get(p.id))) });
});

projectsRouter.post('/projects', requirePermission('project:create'), async (req, res) => {
  const { org } = tenantOf(req);
  const input = parse(createProjectSchema, req.body);
  if (await Project.exists({ key: input.key })) throw conflict(`A project with the key ${input.key} already exists`);
  await assertCanAddProject(org);

  const project = await Project.create({ ...input, createdBy: authUserId(req) });
  await audit(req, { action: 'project.created', entityType: 'project', entityId: project._id, summary: `created project ${project.name}` });
  emitToOrg(org.id, 'project:changed');
  res.status(201).json({ project: toProjectDTO(project) });
});

projectsRouter.get('/projects/:projectId', async (req, res) => {
  const project = await loadProject(req);
  res.json({ project: toProjectDTO(project, (await taskCounts()).get(project.id)) });
});

projectsRouter.patch('/projects/:projectId', requirePermission('project:update'), async (req, res) => {
  const { org } = tenantOf(req);
  const input = parse(updateProjectSchema, req.body);
  const project = await loadProject(req);
  // Un-archiving counts against the plan's active project limit again.
  if (input.archived === false && project.archived) await assertCanAddProject(org);

  const wasArchived = project.archived;
  project.set(input);
  await project.save();
  await audit(req, {
    action: project.archived !== wasArchived ? (project.archived ? 'project.archived' : 'project.restored') : 'project.updated',
    entityType: 'project',
    entityId: project._id,
    summary:
      project.archived !== wasArchived
        ? `${project.archived ? 'archived' : 'restored'} project ${project.name}`
        : `updated project ${project.name}`,
  });
  emitToOrg(org.id, 'project:changed');
  res.json({ project: toProjectDTO(project, (await taskCounts()).get(project.id)) });
});

projectsRouter.delete('/projects/:projectId', requirePermission('project:delete'), async (req, res) => {
  const { org } = tenantOf(req);
  const project = await loadProject(req);
  const taskIds = (await Task.find({ projectId: project._id }).select('_id')).map((t) => t._id);
  await Promise.all([Comment.deleteMany({ taskId: { $in: taskIds } }), Task.deleteMany({ projectId: project._id })]);
  await project.deleteOne();
  await audit(req, { action: 'project.deleted', entityType: 'project', entityId: project._id, summary: `deleted project ${project.name}` });
  emitToOrg(org.id, 'project:changed');
  res.status(204).end();
});

/* ----------------------------------- Tasks ---------------------------------- */

projectsRouter.get('/projects/:projectId/tasks', async (req, res) => {
  const project = await loadProject(req);
  const tasks = await Task.find({ projectId: project._id }).sort('position');
  res.json({ tasks: tasks.map(toTaskDTO) });
});

projectsRouter.post('/projects/:projectId/tasks', requirePermission('task:create'), async (req, res) => {
  const input = parse(createTaskSchema, req.body);
  await assertAssignable(req, input.assigneeId);

  // Atomically claim the next task number; also proves the project is in this tenant.
  const project = await Project.findOneAndUpdate({ _id: req.params.projectId }, { $inc: { taskSeq: 1 } }, { returnDocument: 'after' });
  if (!project) throw notFound('Project not found');

  const task = await Task.create({
    ...input,
    projectId: project._id,
    number: project.taskSeq,
    key: `${project.key}-${project.taskSeq}`,
    position: await endOfColumn(project._id, input.status),
    completedAt: input.status === 'done' ? new Date() : null,
    createdBy: authUserId(req),
  });
  await audit(req, { action: 'task.created', entityType: 'task', entityId: task._id, summary: `created ${task.key} “${task.title}”` });

  const dto = toTaskDTO(task);
  emitToProject(dto.projectId, 'task:created', dto);
  res.status(201).json({ task: dto });
});

/** Tasks assigned to the caller across every project in this workspace. */
projectsRouter.get('/my-tasks', async (req, res) => {
  const tasks = await Task.find({ assigneeId: authUserId(req), status: { $ne: 'done' } })
    .sort('dueDate -updatedAt')
    .limit(50);
  res.json({ tasks: tasks.map(toTaskDTO) });
});

projectsRouter.get('/tasks/:taskId', async (req, res) => {
  res.json({ task: toTaskDTO(await loadTask(req)) });
});

projectsRouter.patch('/tasks/:taskId', requirePermission('task:update'), async (req, res) => {
  const input = parse(updateTaskSchema, req.body);
  const task = await loadTask(req);
  const before = { status: task.status, assigneeId: task.assigneeId?.toString() ?? null };
  if (input.assigneeId !== undefined && input.assigneeId !== before.assigneeId) await assertAssignable(req, input.assigneeId);

  task.set(input);
  if (task.status !== before.status) {
    task.completedAt = task.status === 'done' ? new Date() : null;
    if (input.position === undefined) task.position = await endOfColumn(task.projectId, task.status);
  }
  await task.save();

  if (task.status !== before.status) {
    await audit(req, {
      action: 'task.status_changed',
      entityType: 'task',
      entityId: task._id,
      summary: `moved ${task.key} to ${STATUS_LABELS[task.status]}`,
      meta: { from: before.status, to: task.status },
    });
  }
  const assigneeId = task.assigneeId?.toString() ?? null;
  if (assigneeId !== before.assigneeId) {
    const assignee = assigneeId ? await User.findById(assigneeId) : null;
    await audit(req, {
      action: 'task.assigned',
      entityType: 'task',
      entityId: task._id,
      summary: assignee ? `assigned ${task.key} to ${assignee.name}` : `unassigned ${task.key}`,
    });
  }

  const dto = toTaskDTO(task);
  emitToProject(dto.projectId, 'task:updated', dto);
  res.json({ task: dto });
});

projectsRouter.delete('/tasks/:taskId', requirePermission('task:delete'), async (req, res) => {
  const task = await loadTask(req);
  await Comment.deleteMany({ taskId: task._id });
  await task.deleteOne();
  await audit(req, { action: 'task.deleted', entityType: 'task', entityId: task._id, summary: `deleted ${task.key} “${task.title}”` });
  emitToProject(task.projectId.toString(), 'task:deleted', { id: task.id, projectId: task.projectId.toString() });
  res.status(204).end();
});

/* --------------------------------- Comments --------------------------------- */

projectsRouter.get('/tasks/:taskId/comments', async (req, res) => {
  const task = await loadTask(req);
  const comments = await Comment.find({ taskId: task._id }).sort('createdAt').populate<{ authorId: UserDoc | null }>('authorId');
  res.json({ comments: comments.flatMap((c) => (c.authorId ? [toCommentDTO(c, c.authorId)] : [])) });
});

projectsRouter.post('/tasks/:taskId/comments', requirePermission('comment:create'), async (req, res) => {
  const { body } = parse(createCommentSchema, req.body);
  const task = await loadTask(req);
  const author = await User.findById(authUserId(req));
  if (!author) throw notFound('User not found');

  const comment = await Comment.create({ taskId: task._id, authorId: author._id, body });
  task.commentCount += 1;
  await task.save();

  const dto = toCommentDTO(comment, author);
  const projectId = task.projectId.toString();
  emitToProject(projectId, 'comment:created', { ...dto, projectId });
  emitToProject(projectId, 'task:updated', toTaskDTO(task));
  res.status(201).json({ comment: dto });
});
