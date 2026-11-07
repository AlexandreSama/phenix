import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env), {
  bufferLogs: true,
});

app.useLogger(app.get(Logger));
configureApp(app);
// SIGTERM (docker stop) ferme proprement la base et Valkey
app.enableShutdownHooks();

await app.listen(env.API_PORT);
app.get(Logger).log(`API prête sur le port ${env.API_PORT}`);
