import type { PlanId } from './plans';
import type { Role } from './rbac';
import type { TaskPriority, TaskStatus } from './schemas';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
}

export interface OrgDTO {
  id: string;
  name: string;
  slug: string;
  plan: PlanId;
  /** The requesting user's role in this org. */
  role: Role;
  createdAt: string;
}

export interface MemberDTO {
  id: string;
  user: UserDTO;
  role: Role;
  joinedAt: string;
}

export interface InviteDTO {
  id: string;
  email: string;
  role: Role;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
  /** Only returned once, on creation. */
  link?: string;
}

export interface InvitePreviewDTO {
  email: string;
  role: Role;
  orgName: string;
  orgSlug: string;
  invitedBy: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  key: string;
  description: string;
  color: string;
  archived: boolean;
  taskCount: number;
  openTaskCount: number;
  createdAt: string;
}

export interface TaskDTO {
  id: string;
  projectId: string;
  /** Human readable key, e.g. WEB-12 */
  key: string;
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  labels: string[];
  dueDate: string | null;
  position: number;
  commentCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommentDTO {
  id: string;
  taskId: string;
  author: UserDTO;
  body: string;
  createdAt: string;
}

export interface AuditLogDTO {
  id: string;
  action: string;
  actor: UserDTO | null;
  summary: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}

export interface AnalyticsDTO {
  totals: {
    projects: number;
    members: number;
    tasks: number;
    openTasks: number;
    completedThisWeek: number;
    overdue: number;
  };
  byStatus: { status: TaskStatus; count: number }[];
  byPriority: { priority: TaskPriority; count: number }[];
  /** Last 14 days, oldest first. */
  throughput: { date: string; created: number; completed: number }[];
  byAssignee: { userId: string | null; name: string; open: number; done: number }[];
}

export interface UsageDTO {
  plan: PlanId;
  projects: number;
  members: number;
  billingEnabled: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

/** Socket.IO contract */
export interface PresenceUser {
  id: string;
  name: string;
  avatarColor: string;
}

export interface ServerToClientEvents {
  'task:created': (task: TaskDTO) => void;
  'task:updated': (task: TaskDTO) => void;
  'task:deleted': (payload: { id: string; projectId: string }) => void;
  'comment:created': (comment: CommentDTO & { projectId: string }) => void;
  'project:changed': () => void;
  'presence:update': (payload: { projectId: string; users: PresenceUser[] }) => void;
}

export interface ClientToServerEvents {
  'org:join': (orgSlug: string, ack?: (ok: boolean) => void) => void;
  'project:join': (projectId: string) => void;
  'project:leave': (projectId: string) => void;
}
