import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

/** Ce que l'API retient d'une connexion. Reste dans Valkey, jamais dans le navigateur. */
export interface Session {
  userId: string;
  /** Token OAuth2 Discord de l'utilisateur, pour lister ses serveurs */
  accessToken: string;
}

const PREFIX = 'session:';
/** 32 octets aléatoires en base64url : 43 caractères */
const SESSION_ID = /^[\w-]{43}$/;

/**
 * Sessions stockées dans Valkey plutôt qu'un JWT : supprimer la clé déconnecte
 * immédiatement, et le navigateur ne garde qu'un identifiant opaque.
 */
@Injectable()
export class SessionService {
  constructor(private readonly redis: Redis) {}

  async create(session: Session, ttlSeconds: number): Promise<string> {
    const id = randomBytes(32).toString('base64url');
    await this.redis.set(PREFIX + id, JSON.stringify(session), 'EX', ttlSeconds);
    return id;
  }

  async get(id: string): Promise<Session | null> {
    if (!SESSION_ID.test(id)) return null;
    const raw = await this.redis.get(PREFIX + id);
    return raw ? (JSON.parse(raw) as Session) : null;
  }

  async destroy(id: string): Promise<void> {
    if (SESSION_ID.test(id)) await this.redis.del(PREFIX + id);
  }
}
