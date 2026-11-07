export const EIGHT_BALL_ANSWERS = [
  "C'est certain.",
  'Sans aucun doute.',
  'Oui, absolument.',
  'Tu peux compter dessus.',
  "D'après moi, oui.",
  'Très probablement.',
  'Les signes disent oui.',
  'Réponse floue, réessaie.',
  'Redemande plus tard.',
  'Mieux vaut ne pas te le dire maintenant.',
  'Impossible à prédire pour le moment.',
  'Concentre-toi et redemande.',
  "N'y compte pas.",
  'Ma réponse est non.',
  'Mes sources disent non.',
  "J'en doute fort.",
] as const;

/** Tire une réponse au hasard. `random` est injectable pour les tests. */
export function pickAnswer(random: () => number = Math.random): string {
  const index = Math.floor(random() * EIGHT_BALL_ANSWERS.length);
  return EIGHT_BALL_ANSWERS[index] ?? EIGHT_BALL_ANSWERS[0];
}

/**
 * Score de compatibilité entre 0 et 100, toujours le même pour une paire donnée,
 * quel que soit l'ordre des deux personnes.
 */
export function shipScore(idA: string, idB: string): number {
  if (idA === idB) return 100;
  const [first, second] = [idA, idB].toSorted();
  let hash = 0x811c9dc5;
  for (const char of `${first}:${second}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 101;
}

export function shipVerdict(score: number): string {
  if (score >= 90) return 'Âmes sœurs 💞';
  if (score >= 70) return 'Ça sent le mariage 💍';
  if (score >= 50) return 'Il y a clairement quelque chose 😏';
  if (score >= 30) return 'Belle amitié 🤝';
  if (score >= 10) return 'Pas gagné… 😬';
  return 'Aucune chance 💔';
}

/** Barre de progression en texte : █████░░░░░ */
export function progressBar(percent: number, size = 10): string {
  const filled = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * size);
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

/** Nom du couple : début du premier nom + fin du second. */
export function blendNames(nameA: string, nameB: string): string {
  return nameA.slice(0, Math.ceil(nameA.length / 2)) + nameB.slice(Math.floor(nameB.length / 2));
}
