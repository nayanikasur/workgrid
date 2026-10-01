import type { CommentDTO, OrgDTO, Role, TaskDTO, UserDTO } from '@workgrid/shared';
import type { OrgDoc } from '../models/Organization';
import type { TaskDoc } from '../models/Project';

interface UserLike {
  _id: { toString(): string };
  name: string;
  email: string;
  avatarColor: string;
}

export function toUserDTO(user: UserLike): UserDTO {
  return { id: user._id.toString(), name: user.name, email: user.email, avatarColor: user.avatarColor };
}

export function toOrgDTO(org: OrgDoc, role: Role): OrgDTO {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    role,
    createdAt: org.createdAt.toISOString(),
  };
}

export function toTaskDTO(task: TaskDoc): TaskDTO {
  return {
    id: task.id,
    projectId: task.projectId.toString(),
    key: task.key,
    number: task.number,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId?.toString() ?? null,
    labels: task.labels,
    dueDate: task.dueDate?.toISOString() ?? null,
    position: task.position,
    commentCount: task.commentCount,
    createdBy: task.createdBy.toString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function toCommentDTO(
  comment: { _id: { toString(): string }; taskId: { toString(): string }; body: string; createdAt: Date },
  author: UserLike,
): CommentDTO {
  return {
    id: comment._id.toString(),
    taskId: comment.taskId.toString(),
    author: toUserDTO(author),
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
  };
}
