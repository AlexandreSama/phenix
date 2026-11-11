/** Ce que le battement demande à Valkey : un SET avec expiration (ioredis le fournit). */
export interface LiveStore {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
}

export interface LiveHeartbeatOptions {
  store: LiveStore;
  key: string;
  intervalSeconds: number;
  ttlSeconds: number;
  /** L'état à publier ; null pour se taire (la clé expire, le service paraît hors ligne) */
  read: () => Promise<object | null>;
  onError: (err: unknown) => void;
}

/**
 * Publie l'état d'un service maintenant, puis à intervalle régulier, dans une clé qui expire :
 * si le service s'arrête, la clé disparaît et la page Métriques le montre hors ligne.
 * Rend la fonction qui l'arrête.
 */
export function startLiveHeartbeat(options: LiveHeartbeatOptions): () => void {
  const { store, key, intervalSeconds, ttlSeconds, read, onError } = options;
  const beat = () => {
    read()
      .then((state) => {
        if (state === null) return;
        return store.set(key, JSON.stringify(state), 'EX', ttlSeconds);
      })
      .catch(onError);
  };
  beat();
  const timer = setInterval(beat, intervalSeconds * 1000);
  // Le minuteur ne retient pas le processus à l'arrêt
  timer.unref();
  return () => clearInterval(timer);
}

/** Le début du créneau de `stepMs` qui contient `date` : les relevés d'un créneau s'alignent. */
export const slotStart = (date: Date, stepMs: number): Date =>
  new Date(Math.floor(date.getTime() / stepMs) * stepMs);

/** Un champ numérique de la réponse à INFO de Valkey (`used_memory:1234`) ; null s'il manque. */
export function parseInfoField(info: string, field: string): number | null {
  const match = new RegExp(`^${field}:(\\d+)\\r?$`, 'm').exec(info);
  return match ? Number(match[1]) : null;
}
