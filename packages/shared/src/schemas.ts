import { z } from 'zod';
import { ROLES } from './rbac';

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: 'No priority',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const PROJECT_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
] as const;

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const slug = z
  .string()
  .min(3, 'At least 3 characters')
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and dashes only');

/** Slugs that would collide with top-level client routes. */
export const RESERVED_SLUGS = ['login', 'register', 'invite', 'onboarding', 'api', 'settings', 'new'];

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(60),
  email: z.email('Enter a valid email').toLowerCase(),
  password: z.string().min(8, 'At least 8 characters').max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email('Enter a valid email').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createOrgSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(60),
  slug: slug.refine((s) => !RESERVED_SLUGS.includes(s), 'That URL is reserved'),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const updateOrgSchema = z.object({
  name: z.string().trim().min(2).max(60),
});
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const inviteSchema = z.object({
  email: z.email('Enter a valid email').toLowerCase(),
  role: z.enum(ROLES).exclude(['owner']),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const updateMemberSchema = z.object({
  role: z.enum(ROLES).exclude(['owner']),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(60),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,5}$/, '2–6 letters or digits, starting with a letter'),
  description: z.string().trim().max(500).optional().default(''),
  color: z.enum(PROJECT_COLORS).optional().default(PROJECT_COLORS[0]),
});
export type CreateProjectInput = z.input<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(500),
    color: z.enum(PROJECT_COLORS),
    archived: z.boolean(),
  })
  .partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(10_000).optional().default(''),
  status: z.enum(TASK_STATUSES).optional().default('todo'),
  priority: z.enum(TASK_PRIORITIES).optional().default('none'),
  assigneeId: objectId.nullable().optional().default(null),
  dueDate: z.iso.datetime().nullable().optional().default(null),
  labels: z.array(z.string().trim().min(1).max(24)).max(8).optional().default([]),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10_000),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    assigneeId: objectId.nullable(),
    dueDate: z.iso.datetime().nullable(),
    labels: z.array(z.string().trim().min(1).max(24)).max(8),
    /** Fractional sort key within a status column. */
    position: z.number().finite(),
  })
  .partial();
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment is empty').max(5000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
