import {
  PLANS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type AnalyticsDTO,
  type AuditLogDTO,
  type TaskPriority,
  type TaskStatus,
} from '@workgrid/shared';
import { Router } from 'express';
import { toUserDTO } from '../lib/serialize';
import { requirePermission, tenantOf } from '../middleware/auth';
import { AuditLog } from '../models/AuditLog';
import { Membership } from '../models/Organization';
import { Project, Task } from '../models/Project';
import { User, type UserDoc } from '../models/User';

export const analyticsRouter = Router({ mergeParams: true });

const DAY_MS = 24 * 60 * 60 * 1000;
const THROUGHPUT_DAYS = 14;

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

analyticsRouter.get('/analytics', async (req, res) => {
  const { org } = tenantOf(req);
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (THROUGHPUT_DAYS - 1) * DAY_MS);
  const perDay = (field: 'createdAt' | 'completedAt') => [
    { $match: { [field]: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${field}` } }, count: { $sum: 1 } } },
  ];

  // One round trip: the tenant plugin prepends the orgId $match ahead of the $facet.
  const [facets] = await Task.aggregate<{
    byStatus: { _id: TaskStatus; count: number }[];
    byPriority: { _id: TaskPriority; count: number }[];
    byAssignee: { _id: unknown; open: number; done: number }[];
    created: { _id: string; count: number }[];
    completed: { _id: string; count: number }[];
    overdue: { count: number }[];
    completedThisWeek: { count: number }[];
  }>([
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byPriority: [{ $match: { status: { $ne: 'done' } } }, { $group: { _id: '$priority', count: { $sum: 1 } } }],
        byAssignee: [
          {
            $group: {
              _id: '$assigneeId',
              open: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 0, 1] } },
              done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            },
          },
        ],
        created: perDay('createdAt'),
        completed: perDay('completedAt'),
        overdue: [{ $match: { status: { $ne: 'done' }, dueDate: { $lt: now } } }, { $count: 'count' }],
        completedThisWeek: [{ $match: { completedAt: { $gte: new Date(now.getTime() - 7 * DAY_MS) } } }, { $count: 'count' }],
      },
    },
  ]);

  const [projects, members] = await Promise.all([
    Project.countDocuments({ archived: false }),
    Membership.find({ orgId: org._id }).populate<{ userId: UserDoc | null }>('userId'),
  ]);

  const statusCounts = new Map(facets?.byStatus.map((r) => [r._id, r.count]));
  const priorityCounts = new Map(facets?.byPriority.map((r) => [r._id, r.count]));
  const created = new Map(facets?.created.map((r) => [r._id, r.count]));
  const completed = new Map(facets?.completed.map((r) => [r._id, r.count]));
  const names = new Map(members.flatMap((m) => (m.userId ? [[m.userId.id as string, m.userId.name] as const] : [])));

  const tasks = [...statusCounts.values()].reduce((a, b) => a + b, 0);
  const body: AnalyticsDTO = {
    totals: {
      projects,
      members: members.length,
      tasks,
      openTasks: tasks - (statusCounts.get('done') ?? 0),
      completedThisWeek: facets?.completedThisWeek[0]?.count ?? 0,
      overdue: facets?.overdue[0]?.count ?? 0,
    },
    byStatus: TASK_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
    byPriority: TASK_PRIORITIES.map((priority) => ({ priority, count: priorityCounts.get(priority) ?? 0 })),
    throughput: Array.from({ length: THROUGHPUT_DAYS }, (_, i) => {
      const date = dayKey(new Date(since.getTime() + i * DAY_MS));
      return { date, created: created.get(date) ?? 0, completed: completed.get(date) ?? 0 };
    }),
    byAssignee: (facets?.byAssignee ?? [])
      .map((r) => {
        const userId = r._id ? String(r._id) : null;
        return { userId, name: userId ? (names.get(userId) ?? 'Former member') : 'Unassigned', open: r.open, done: r.done };
      })
      .sort((a, b) => b.open + b.done - (a.open + a.done)),
  };
  res.json({ analytics: body });
});

const AUDIT_PAGE_SIZE = 40;

analyticsRouter.get('/audit', requirePermission('audit:read'), async (req, res) => {
  const { org } = tenantOf(req);
  // The plan decides how far back the trail is visible.
  const horizon = new Date(Date.now() - PLANS[org.plan].limits.auditLogDays * DAY_MS);
  const before = typeof req.query.before === 'string' ? new Date(req.query.before) : null;
  const upper = before && !Number.isNaN(before.getTime()) ? before : new Date();

  const rows = await AuditLog.find({ createdAt: { $gte: horizon, $lt: upper } })
    .sort('-createdAt')
    .limit(AUDIT_PAGE_SIZE + 1);
  const page = rows.slice(0, AUDIT_PAGE_SIZE);

  const actors = await User.find({ _id: { $in: page.map((r) => r.actorId).filter(Boolean) } });
  const actorById = new Map(actors.map((u) => [u.id as string, toUserDTO(u)]));

  const logs: AuditLogDTO[] = page.map((r) => ({
    id: r.id as string,
    action: r.action,
    actor: (r.actorId && actorById.get(r.actorId.toString())) || null,
    summary: r.summary,
    entityType: r.entityType,
    entityId: r.entityId?.toString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
  res.json({
    logs,
    nextCursor: rows.length > AUDIT_PAGE_SIZE ? page[page.length - 1]!.createdAt.toISOString() : null,
    retentionDays: PLANS[org.plan].limits.auditLogDays,
  });
});
