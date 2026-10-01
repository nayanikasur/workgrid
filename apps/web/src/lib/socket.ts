import type { ClientToServerEvents, ServerToClientEvents } from '@workgrid/shared';
import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN, getAccessToken, refreshSession } from './api';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/** One shared connection for the whole app, authenticated with the current access token. */
export function getSocket(): AppSocket {
  if (socket) return socket;
  // Static hosts can proxy /api but not WebSockets, so the socket may need the API's own origin.
  socket = io(import.meta.env.VITE_SOCKET_URL || API_ORIGIN || window.location.origin, {
    autoConnect: false,
    // Called on every (re)connect, so a rotated token is always picked up.
    auth: (cb) => cb({ token: getAccessToken() }),
  });
  socket.on('connect_error', async (err) => {
    // The token expired while we were disconnected: refresh once and retry.
    if (err.message === 'unauthorized' && (await refreshSession())) socket?.connect();
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
}
