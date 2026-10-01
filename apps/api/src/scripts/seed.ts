/**
 * Seeds a demo account so the app has something to show on first run.
 *   pnpm seed   →   demo@workgrid.dev / demo1234
 * Only touches the demo users and workspaces; re-running resets them.
 */
import { STATUS_LABELS, TASK_PRIORITIES, type Role, type TaskStatus } from '@workgrid/shared';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { runWithTenant } from '../lib/tenant';
import { AuditLog } from '../models/AuditLog';
import { Invite, Membership, Organization } from '../models/Organization';
import { Comment, Project, Task } from '../models/Project';
import { Session } from '../models/Session';
import { User } from '../models/User';

const DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD = 'demo1234';

const PEOPLE = [
  { name: 'Demo User', email: 'demo@workgrid.dev', avatarColor: '#6366f1' },
  { name: 'Priya Sharma', email: 'priya@workgrid.dev', avatarColor: '#ec4899' },
  { name: 'Marcus Chen', email: 'marcus@workgrid.dev', avatarColor: '#14b8a6' },
  { name: 'Elena Rossi', email: 'elena@workgrid.dev', avatarColor: '#f97316' },
  { name: 'Tom Becker', email: 'tom@workgrid.dev', avatarColor: '#0ea5e9' },
] as const;

const ORGS: { name: string; slug: string; roles: Role[]; projects: { name: string; key: string; color: string; description: string; tasks: string[] }[] }[] = [
  {
    name: 'Acme Inc',
    slug: 'acme',
    roles: ['owner', 'admin', 'member', 'member', 'viewer'],
    projects: [
      {
        name: 'Website Redesign',
        key: 'WEB',
        color: '#6366f1',
        description: 'New marketing site, pricing page and docs refresh.',
        tasks: [
          'Audit current landing page performance',
          'Design new hero section',
          'Build pricing comparison table',
          'Migrate blog to MDX',
          'Add dark mode toggle',
          'Write copy for the features page',
          'Set up analytics events',
          'Fix layout shift on mobile nav',
          'Optimise hero images',
          'Accessibility pass on forms',
          'Add customer logos section',
          'Implement cookie consent banner',
          'Redirect map for old URLs',
          'QA on Safari and Firefox',
        ],
      },
      {
        name: 'Mobile App',
        key: 'MOB',
        color: '#ec4899',
        description: 'React Native client for iOS and Android.',
        tasks: [
          'Set up push notifications',
          'Offline mode for task lists',
          'Biometric login',
          'Fix crash when rotating on the board screen',
          'Deep links into tasks',
          'App Store screenshots',
          'Reduce cold start time',
          'Pull to refresh on inbox',
          'Haptics on drag and drop',
          'Beta release to TestFlight',
        ],
      },
      {
        name: 'Platform API',
        key: 'API',
        color: '#14b8a6',
        description: 'Public REST API, webhooks and rate limiting.',
        tasks: [
          'Design webhook retry policy',
          'Add cursor pagination to list endpoints',
          'Per-key rate limiting',
          'OpenAPI spec generation',
          'Idempotency keys for POST requests',
          'Rotate signing secrets',
          'Load test the tasks endpoint',
          'Document error codes',
          'Audit log export endpoint',
          'Deprecate v0 auth header',
          'SDK example for Node',
          'Alert on p95 latency regression',
        ],
      },
    ],
  },
  {
    name: 'Globex Labs',
    slug: 'globex',
    // Same people, different roles: the demo user is only a member here.
    roles: ['member', 'owner', 'admin', 'viewer', 'member'],
    projects: [
      {
        name: 'Research Sprint',
        key: 'RND',
        color: '#f97316',
        description: 'Quarterly discovery work.',
        tasks: ['Interview five customers', 'Synthesize interview notes', 'Prototype onboarding checklist', 'Competitive teardown', 'Present findings'],
      },
    ],
  },
];

const STATUS_CYCLE: TaskStatus[] = ['done', 'in_progress', 'todo', 'done', 'in_review', 'backlog', 'done', 'todo'];
const LABELS = ['frontend', 'backend', 'design', 'bug', 'infra', 'docs'];
const COMMENTS = ['Picking this up today.', 'Blocked on design sign-off, will ping when unblocked.', 'PR is up for review.', 'Verified on staging, looks good.'];

/** Small deterministic PRNG so every seed run produces the same demo. */
let state = 42;
const rand = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;

async function reset() {
  const emails = PEOPLE.map((p) => p.email);
  for (const org of await Organization.find({ slug: { $in: ORGS.map((o) => o.slug) } })) {
    await runWithTenant(org.id, async () => {
      await Promise.all([Task.deleteMany({}), Comment.deleteMany({}), Project.deleteMany({}), AuditLog.deleteMany({})]);
    });
    await Promise.all([Membership.deleteMany({ orgId: org._id }), Invite.deleteMany({ orgId: org._id })]);
    await org.deleteOne();
  }
  const users = await User.find({ email: { $in: emails } });
  await Session.deleteMany({ userId: { $in: users.map((u) => u._id) } });
  await User.deleteMany({ email: { $in: emails } });
}

async function seed() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const users = await User.create(PEOPLE.map((p) => ({ ...p, passwordHash })));
  const now = Date.now();

  for (const def of ORGS) {
    // Acme is on Pro so the demo isn't pinned at the Free limits; Globex shows them.
    const org = await Organization.create({ name: def.name, slug: def.slug, plan: def.slug === 'acme' ? 'pro' : 'free' });
    await Membership.create(users.map((user, i) => ({ orgId: org._id, userId: user._id, role: def.roles[i]! })));
    const assignable = users.filter((_, i) => def.roles[i] !== 'viewer');
    const owner = users[def.roles.indexOf('owner')]!;

    for (const projectDef of def.projects) {
      const project = await Project.create({
        orgId: org._id,
        name: projectDef.name,
        key: projectDef.key,
        color: projectDef.color,
        description: projectDef.description,
        taskSeq: projectDef.tasks.length,
        createdBy: owner._id,
        createdAt: new Date(now - 20 * DAY_MS),
      });
      await AuditLog.create({
        orgId: org._id,
        actorId: owner._id,
        action: 'project.created',
        entityType: 'project',
        entityId: project._id,
        summary: `created project ${project.name}`,
        createdAt: new Date(now - 20 * DAY_MS),
      });

      for (const [i, title] of projectDef.tasks.entries()) {
        const status = STATUS_CYCLE[i % STATUS_CYCLE.length]!;
        const createdAt = new Date(now - (1 + rand() * 13) * DAY_MS);
        const completedAt = status === 'done' ? new Date(createdAt.getTime() + rand() * (now - createdAt.getTime())) : null;
        const assignee = rand() < 0.85 ? pick(assignable) : null;
        const actor = pick(assignable);
        const commentCount = rand() < 0.4 ? 1 + Math.floor(rand() * 2) : 0;

        const task = await Task.create({
          orgId: org._id,
          projectId: project._id,
          number: i + 1,
          key: `${project.key}-${i + 1}`,
          title,
          status,
          priority: pick(TASK_PRIORITIES),
          assigneeId: assignee?._id ?? null,
          labels: rand() < 0.7 ? [pick(LABELS)] : [],
          // A few open tasks are overdue so the dashboard has something to flag.
          dueDate: rand() < 0.6 ? new Date(now + (rand() * 14 - 3) * DAY_MS) : null,
          position: (i + 1) * 1024,
          commentCount,
          completedAt,
          createdBy: actor._id,
          createdAt,
        });

        await AuditLog.create({
          orgId: org._id,
          actorId: actor._id,
          action: 'task.created',
          entityType: 'task',
          entityId: task._id,
          summary: `created ${task.key} “${title}”`,
          createdAt,
        });
        if (completedAt) {
          await AuditLog.create({
            orgId: org._id,
            actorId: (assignee ?? actor)._id,
            action: 'task.status_changed',
            entityType: 'task',
            entityId: task._id,
            summary: `moved ${task.key} to ${STATUS_LABELS.done}`,
            createdAt: completedAt,
          });
        }
        for (let c = 0; c < commentCount; c++) {
          await Comment.create({
            orgId: org._id,
            taskId: task._id,
            authorId: pick(assignable)._id,
            body: pick(COMMENTS),
            createdAt: new Date(createdAt.getTime() + rand() * (now - createdAt.getTime())),
          });
        }
      }
    }
  }
}

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  await reset();
  await seed();
  await mongoose.disconnect();
  console.log(`Seeded. Sign in with ${PEOPLE[0].email} / ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
