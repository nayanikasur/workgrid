import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app';
import { env } from './config/env';
import { attachRealtime } from './services/realtime';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('MongoDB connected');

  const server = createServer(createApp());
  const io = attachRealtime(server);
  server.listen(env.PORT, () => console.log(`WorkGrid API listening on http://localhost:${env.PORT}`));

  const shutdown = async () => {
    await io.close(); // also closes the HTTP server
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
