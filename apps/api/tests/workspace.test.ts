import { beforeAll, describe, expect, it } from 'vitest';
import { Organization } from '../src/models/Organization';
import { addMember, api, createOrg, createProject, createUser, type TestUser } from './helpers';

describe('roles and permissions', () => {
  let owner: TestUser, admin: TestUser, member: TestUser, viewer: TestUser;
  let slug: string;

  beforeAll(async () => {
    owner = await createUser('Owner');
    ({ slug } = await createOrg(owner));
    admin = await addMember(owner, slug, 'admin');
    member = await addMember(owner, slug, 'member');
    viewer = await addMember(owner, slug, 'viewer');
  });

  it('gives viewers read-only access', async () => {
    const project = await createProject(member, slug, 'RO');
    await api(viewer).get(`/api/orgs/${slug}/projects`).expect(200);
    await api(viewer).post(`/api/orgs/${slug}/projects`, { name: 'Nope', key: 'NO' }).expect(403);
    await api(viewer).post(`/api/orgs/${slug}/projects/${project.id}/tasks`, { title: 'Nope' }).expect(403);
  });

  it('reserves member management for admins and owners', async () => {
    await api(member).post(`/api/orgs/${slug}/invites`, { email: 'x@example.com', role: 'member' }).expect(403);
    await api(member).get(`/api/orgs/${slug}/audit`).expect(403);
    await api(admin).get(`/api/orgs/${slug}/audit`).expect(200);
    await api(admin).post(`/api/orgs/${slug}/invites`, { email: 'x@example.com', role: 'owner' }).expect(400);
  });

  it('protects the owner and reserves destructive actions for them', async () => {
    const { body } = await api(admin).get(`/api/orgs/${slug}/members`).expect(200);
    const ownerRow = body.members.find((m: { role: string }) => m.role === 'owner');
    const adminRow = body.members.find((m: { role: string }) => m.role === 'admin');

    await api(admin).patch(`/api/orgs/${slug}/members/${ownerRow.id}`, { role: 'member' }).expect(403);
    await api(admin).delete(`/api/orgs/${slug}/members/${ownerRow.id}`).expect(403);
    await api(admin).patch(`/api/orgs/${slug}/members/${adminRow.id}`, { role: 'viewer' }).expect(403); // own role
    await api(admin).delete(`/api/orgs/${slug}`).expect(403);
    await api(admin).post(`/api/orgs/${slug}/billing/checkout`).expect(403);
  });

  it('only lets the invited address redeem an invite', async () => {
    const stranger = await createUser('Stranger');
    const res = await api(owner).post(`/api/orgs/${slug}/invites`, { email: 'someone-else@example.com', role: 'admin' }).expect(201);
    const token = (res.body.invite.link as string).split('/').pop()!;
    await api(stranger).post(`/api/invites/${token}/accept`).expect(403);
    await api(stranger).get(`/api/orgs/${slug}`).expect(404);
  });
});

describe('plan limits', () => {
  it('caps active projects on Free and lifts the cap on Pro', async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    for (const key of ['AA', 'BB', 'CC']) await createProject(owner, org.slug, key);

    const blocked = await api(owner).post(`/api/orgs/${org.slug}/projects`, { name: 'Fourth', key: 'DD' }).expect(402);
    expect(blocked.body.error.code).toBe('plan_limit');

    await Organization.updateOne({ _id: org.id }, { plan: 'pro' });
    await api(owner).post(`/api/orgs/${org.slug}/projects`, { name: 'Fourth', key: 'DD' }).expect(201);
  });

  it('counts pending invites against the member limit', async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    for (let i = 0; i < 4; i++) {
      await api(owner).post(`/api/orgs/${org.slug}/invites`, { email: `seat${i}@example.com`, role: 'member' }).expect(201);
    }
    await api(owner).post(`/api/orgs/${org.slug}/invites`, { email: 'seat5@example.com', role: 'member' }).expect(402);
  });
});

describe('tasks', () => {
  it('numbers tasks per project, tracks completion and feeds analytics and the audit log', async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const project = await createProject(owner, org.slug, 'WEB');
    const base = `/api/orgs/${org.slug}`;
    const o = api(owner);

    const first = await o.post(`${base}/projects/${project.id}/tasks`, { title: 'First' }).expect(201);
    const second = await o.post(`${base}/projects/${project.id}/tasks`, { title: 'Second', priority: 'high' }).expect(201);
    expect([first.body.task.key, second.body.task.key]).toEqual(['WEB-1', 'WEB-2']);
    expect(second.body.task.position).toBeGreaterThan(first.body.task.position);

    await o.patch(`${base}/tasks/${first.body.task.id}`, { status: 'done' }).expect(200);
    await o.patch(`${base}/tasks/${second.body.task.id}`, { assigneeId: owner.id }).expect(200);
    const outsider = await createUser();
    await o.patch(`${base}/tasks/${second.body.task.id}`, { assigneeId: outsider.id }).expect(400);

    await o.post(`${base}/tasks/${second.body.task.id}/comments`, { body: 'Looks good' }).expect(201);
    const reread = await o.get(`${base}/tasks/${second.body.task.id}`).expect(200);
    expect(reread.body.task.commentCount).toBe(1);

    const { body } = await o.get(`${base}/analytics`).expect(200);
    expect(body.analytics.totals).toMatchObject({ tasks: 2, openTasks: 1, completedThisWeek: 1, projects: 1, members: 1 });
    expect(body.analytics.throughput.at(-1)).toMatchObject({ created: 2, completed: 1 });

    const audit = await o.get(`${base}/audit`).expect(200);
    const actions = audit.body.logs.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['project.created', 'task.created', 'task.status_changed', 'task.assigned']));

    await o.delete(`${base}/projects/${project.id}`).expect(204);
    await o.get(`${base}/tasks/${second.body.task.id}`).expect(404);
  });
});
