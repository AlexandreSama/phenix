import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    redisUrl: string;
  }
}

let container: StartedTestContainer | undefined;

/** Démarre un Valkey jetable, la même image que le compose de dev. */
export async function setup(project: TestProject): Promise<void> {
  container = await new GenericContainer('valkey/valkey:9')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();
  project.provide('redisUrl', `redis://${container.getHost()}:${container.getMappedPort(6379)}`);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
