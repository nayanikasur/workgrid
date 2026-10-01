import type { Role } from '@workgrid/shared';
import request from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();

let counter = 0;
const unique = () => `${Date.now().toString(36)}${counter++}`;

export interface TestUser {
  id: string;
  email: string;
  token: string;
  /** Raw Set-Cookie header carrying the refresh token. */
  cookie: string;
}

export async function createUser(name = 'Test User'): Promise<TestUser> {
  const email = `user-${unique()}@example.com`;
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'password123' }).expect(201);
  return { id: res.body.user.id, email, token: res.body.accessToken, cookie: res.get('Set-Cookie')![0]! };
}

/** Authenticated request builder: `api(user).get('/api/orgs')`. */
export function api(user: TestUser) {
  const auth = { Authorization: `Bearer ${user.token}` };
  return {
    get: (url: string) => request(app).get(url).set(auth),
    post: (url: string, body?: object) => request(app).post(url).set(auth).send(body),
    patch: (url: string, body?: object) => request(app).patch(url).set(auth).send(body),
    delete: (url: string) => request(app).delete(url).set(auth),
  };
}

export async function createOrg(owner: TestUser, name = 'Acme') {
  const slug = `org-${unique()}`;
  const res = await api(owner).post('/api/orgs', { name, slug }).expect(201);
  return { id: res.body.org.id as string, slug };
}

/** Invites a brand new user into the org with the given role and returns them. */
export async function addMember(owner: TestUser, slug: string, role: Exclude<Role, 'owner'>): Promise<TestUser> {
  const user = await createUser(`${role} user`);
  const res = await api(owner).post(`/api/orgs/${slug}/invites`, { email: user.email, role }).expect(201);
  const token = (res.body.invite.link as string).split('/').pop()!;
  await api(user).post(`/api/invites/${token}/accept`).expect(200);
  return user;
}

export async function createProject(user: TestUser, slug: string, key = 'WEB') {
  const res = await api(user).post(`/api/orgs/${slug}/projects`, { name: `Project ${key}`, key }).expect(201);
  return res.body.project as { id: string; key: string };
}
