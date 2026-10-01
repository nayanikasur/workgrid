import type { Server as HttpServer } from 'node:http';
import type { ClientToServerEvents, PresenceUser, ServerToClientEvents } from '@workgrid/shared';
import { Server, type Socket } from 'socket.io';
import { env } from '../config/env';
import { verifyAccessToken } from '../lib/tokens';
import { Membership, Organization } from '../models/Organization';
import { Project } from '../models/Project';
import { User } from '../models/User';

interface SocketData {
  user: PresenceUser;
  /** Orgs this socket has proven membership of. */
  orgIds: Set<string>;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

let io: IO | null = null;

/** projectId -> socketId -> user. In-memory: fine for one node, swap for the Redis adapter to scale out. */
const presence = new Map<string, Map<string, PresenceUser>>();

const orgRoom = (orgId: string) => `org:${orgId}`;
const projectRoom = (projectId: string) => `project:${projectId}`;

function broadcastPresence(projectId: string) {
  const unique = new Map<string, PresenceUser>();
  for (const user of presence.get(projectId)?.values() ?? []) unique.set(user.id, user);
  io?.to(projectRoom(projectId)).emit('presence:update', { projectId, users: [...unique.values()] });
}

function leaveProject(socket: AppSocket, projectId: string) {
  void socket.leave(projectRoom(projectId));
  const viewers = presence.get(projectId);
  if (!viewers?.delete(socket.id)) return;
  if (viewers.size === 0) presence.delete(projectId);
  broadcastPresence(projectId);
}

export function attachRealtime(server: HttpServer): IO {
  io = new Server(server, { cors: { origin: env.clientOrigins, credentials: true } });

  io.use(async (socket, next) => {
    const userId = verifyAccessToken(String(socket.handshake.auth.token ?? ''));
    const user = userId && (await User.findById(userId));
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = { id: user.id, name: user.name, avatarColor: user.avatarColor };
    socket.data.orgIds = new Set();
    next();
  });

  io.on('connection', (socket) => {
    socket.on('org:join', async (orgSlug, ack) => {
      const org = await Organization.findOne({ slug: String(orgSlug) });
      const member = org && (await Membership.exists({ orgId: org._id, userId: socket.data.user.id }));
      if (org && member) {
        socket.data.orgIds.add(org.id);
        await socket.join(orgRoom(org.id));
      }
      ack?.(Boolean(org && member));
    });

    socket.on('project:join', async (projectId) => {
      // Only projects inside an org this socket already joined are reachable.
      const project = await Project.exists({ _id: String(projectId), orgId: { $in: [...socket.data.orgIds] } }).catch(
        () => null,
      );
      if (!project) return;
      const id = project._id.toString();
      await socket.join(projectRoom(id));
      if (!presence.has(id)) presence.set(id, new Map());
      presence.get(id)!.set(socket.id, socket.data.user);
      broadcastPresence(id);
    });

    socket.on('project:leave', (projectId) => leaveProject(socket, String(projectId)));

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('project:')) leaveProject(socket, room.slice('project:'.length));
      }
    });
  });

  return io;
}

type EventArgs<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>;

export function emitToProject<E extends keyof ServerToClientEvents>(projectId: string, event: E, ...args: EventArgs<E>) {
  io?.to(projectRoom(projectId)).emit(event, ...args);
}

export function emitToOrg<E extends keyof ServerToClientEvents>(orgId: string, event: E, ...args: EventArgs<E>) {
  io?.to(orgRoom(orgId)).emit(event, ...args);
}
