import mongoose from 'mongoose';
import { afterAll, beforeAll } from 'vitest';
import { env } from '../src/config/env';

beforeAll(async () => {
  if (!/test/i.test(env.MONGODB_URI)) throw new Error(`Refusing to run tests against ${env.MONGODB_URI}`);
  await mongoose.connect(env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  // Unique indexes are part of the behaviour under test, so build them up front.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});

afterAll(async () => {
  await mongoose.disconnect();
});
