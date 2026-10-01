import { describe, expect, it } from 'vitest';
import { TenantContextError, runWithTenant } from '../src/lib/tenant';
import { Project, Task } from '../src/models/Project';
import { api, createOrg, createProject, createUser } from './helpers';

describe('tenant isolation', () => {
  it('hides a workspace from non-members', async () => {
    const [alice, mallory] = await Promise.all([createUser('Alice'), createUser('Mallory')]);
    const acme = await createOrg(alice);

    await api(mallory).get(`/api/orgs/${acme.slug}`).expect(404);
    await api(mallory).get(`/api/orgs/${acme.slug}/projects`).expect(404);
    const mine = await api(mallory).get('/api/orgs').expect(200);
    expect(mine.body.orgs).toEqual([]);
  });

  it('cannot reach another tenant’s rows through its own workspace URL', async () => {
    const [alice, bob] = await Promise.all([createUser('Alice'), createUser('Bob')]);
    const [acme, globex] = await Promise.all([createOrg(alice), createOrg(bob)]);
    const secretProject = await createProject(alice, acme.slug);
    const secret = await api(alice).post(`/api/orgs/${acme.slug}/projects/${secretProject.id}/tasks`, { title: 'Acme only' }).expect(201);
    const taskId = secret.body.task.id as string;

    // Bob is a legitimate member of Globex and guesses Acme's ids.
    const b = api(bob);
    await b.get(`/api/orgs/${globex.slug}/projects/${secretProject.id}`).expect(404);
    await b.get(`/api/orgs/${globex.slug}/projects/${secretProject.id}/tasks`).expect(404);
    await b.post(`/api/orgs/${globex.slug}/projects/${secretProject.id}/tasks`, { title: 'Injected' }).expect(404);
    await b.get(`/api/orgs/${globex.slug}/tasks/${taskId}`).expect(404);
    await b.patch(`/api/orgs/${globex.slug}/tasks/${taskId}`, { title: 'Hijacked' }).expect(404);
    await b.delete(`/api/orgs/${globex.slug}/tasks/${taskId}`).expect(404);

    const untouched = await api(alice).get(`/api/orgs/${acme.slug}/tasks/${taskId}`).expect(200);
    expect(untouched.body.task.title).toBe('Acme only');
    const analytics = await b.get(`/api/orgs/${globex.slug}/analytics`).expect(200);
    expect(analytics.body.analytics.totals.tasks).toBe(0);
  });

  it('lets two tenants reuse the same project key', async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const [acme, globex] = await Promise.all([createOrg(alice), createOrg(bob)]);
    await createProject(alice, acme.slug, 'APP');
    await createProject(bob, globex.slug, 'APP');
    await api(bob).post(`/api/orgs/${globex.slug}/projects`, { name: 'Again', key: 'APP' }).expect(409);
  });
});

describe('tenant plugin', () => {
  it('fails closed when a scoped model is queried with no tenant', async () => {
    await expect(Project.find({})).rejects.toBeInstanceOf(TenantContextError);
    await expect(Task.updateMany({}, { title: 'x' })).rejects.toBeInstanceOf(TenantContextError);
    await expect(Task.aggregate([{ $count: 'n' }])).rejects.toBeInstanceOf(TenantContextError);
  });

  it('forces the context org onto queries, even over a caller-supplied orgId', async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const [acme, globex] = await Promise.all([createOrg(alice), createOrg(bob)]);
    await createProject(alice, acme.slug, 'ONE');
    await createProject(bob, globex.slug, 'TWO');

    // Mongoose queries are lazy and the hook reads the context when they execute,
    // so they must be exec'd (or awaited) inside the tenant scope.
    const seen = await runWithTenant(acme.id, () => Project.find({ orgId: globex.id }).exec());
    expect(seen.map((p) => p.key)).toEqual(['ONE']);

    const counted = await runWithTenant(globex.id, () => Project.aggregate([{ $count: 'n' }]).exec());
    expect(counted).toEqual([{ n: 1 }]);
  });

  it('refuses to save a document into a different tenant', async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const [acme, globex] = await Promise.all([createOrg(alice), createOrg(bob)]);
    const doc = new Project({ orgId: globex.id, name: 'Smuggled', key: 'BAD', color: '#6366f1', createdBy: alice.id });
    await expect(runWithTenant(acme.id, () => doc.save())).rejects.toBeInstanceOf(TenantContextError);
  });
});
