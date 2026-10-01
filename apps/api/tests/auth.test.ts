import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { api, app, createUser } from './helpers';

describe('auth', () => {
  it('registers, rejects duplicate emails and never returns the password hash', async () => {
    const user = await createUser();
    const me = await api(user).get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe(user.email);
    expect(JSON.stringify(me.body)).not.toContain('passwordHash');

    await request(app).post('/api/auth/register').send({ name: 'Dup', email: user.email, password: 'password123' }).expect(409);
  });

  it('validates input with field-level errors', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'nope', password: 'short' }).expect(400);
    expect(Object.keys(res.body.error.details)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('logs in with the right password only', async () => {
    const user = await createUser();
    await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' }).expect(401);
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'password123' }).expect(200);
    expect(res.body.accessToken).toBeTypeOf('string');
  });

  it('rejects requests without a valid access token', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage').expect(401);
  });

  it('rotates refresh tokens and tolerates one concurrent reuse', async () => {
    const user = await createUser();
    const first = await request(app).post('/api/auth/refresh').set('Cookie', user.cookie).expect(200);
    const rotated = first.get('Set-Cookie')![0]!;
    expect(rotated).not.toBe(user.cookie);

    // A second tab replaying the old cookie inside the grace window still gets a token…
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', user.cookie).expect(200);
    expect(replay.get('Set-Cookie')).toBeUndefined();
    // …and the rotated cookie keeps working.
    await request(app).post('/api/auth/refresh').set('Cookie', rotated).expect(200);
  });

  it('invalidates the session on logout', async () => {
    const user = await createUser();
    await request(app).post('/api/auth/logout').set('Cookie', user.cookie).expect(204);
    await request(app).post('/api/auth/refresh').set('Cookie', user.cookie).expect(401);
  });
});
