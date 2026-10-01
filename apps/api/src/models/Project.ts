import { TASK_PRIORITIES, TASK_STATUSES } from '@workgrid/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { tenantField, tenantPlugin } from '../lib/tenant';

const projectSchema = new Schema(
  {
    ...tenantField,
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, uppercase: true },
    description: { type: String, default: '' },
    color: { type: String, required: true },
    archived: { type: Boolean, default: false },
    /** Monotonic counter behind task keys like WEB-12. */
    taskSeq: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
projectSchema.index({ orgId: 1, key: 1 }, { unique: true });
projectSchema.plugin(tenantPlugin);

export type ProjectDoc = HydratedDocument<InferSchemaType<typeof projectSchema>>;
export const Project = model('Project', projectSchema);

const taskSchema = new Schema(
  {
    ...tenantField,
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    number: { type: Number, required: true },
    key: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: TASK_STATUSES, required: true, default: 'todo' },
    priority: { type: String, enum: TASK_PRIORITIES, required: true, default: 'none' },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    labels: { type: [String], default: [] },
    dueDate: { type: Date, default: null },
    /** Fractional sort key within a status column. */
    position: { type: Number, required: true },
    commentCount: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
taskSchema.index({ orgId: 1, projectId: 1, status: 1, position: 1 });
taskSchema.index({ orgId: 1, assigneeId: 1 });
taskSchema.plugin(tenantPlugin);

export type TaskDoc = HydratedDocument<InferSchemaType<typeof taskSchema>>;
export const Task = model('Task', taskSchema);

const commentSchema = new Schema(
  {
    ...tenantField,
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true },
  },
  { timestamps: true },
);
commentSchema.plugin(tenantPlugin);

export const Comment = model('Comment', commentSchema);
