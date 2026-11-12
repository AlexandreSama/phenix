import { DiscordAPIError } from '@discordjs/rest';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

/**
 * Ce qu'une erreur de Discord veut dire pour une levée de sanction :
 * - `already-lifted` : le ban n'existe déjà plus, ce qui est le résultat voulu ;
 * - `bot-too-low` : le bot n'a pas la permission, ou son rôle est sous celui du membre ;
 * - `unknown-member` : le membre a quitté le serveur ;
 * - `unavailable` : tout le reste (limite de débit, panne, réseau) : on ne touche à rien.
 */
export type DiscordFailure = 'already-lifted' | 'bot-too-low' | 'unknown-member' | 'unavailable';

export function classifyDiscordError(err: unknown): DiscordFailure {
  if (err instanceof DiscordAPIError) {
    if (err.code === RESTJSONErrorCodes.UnknownBan) return 'already-lifted';
    // 50013 : permission manquante ou rôle trop bas ; 50001 : le bot ne voit pas ce serveur ou ce membre
    if (err.code === RESTJSONErrorCodes.MissingPermissions) return 'bot-too-low';
    if (err.code === RESTJSONErrorCodes.MissingAccess) return 'bot-too-low';
    if (err.code === RESTJSONErrorCodes.UnknownMember) return 'unknown-member';
  }
  return 'unavailable';
}

/**
 * Le code d'une erreur de Discord (50013, 50001…), pour les logs : le statut HTTP seul ne distingue
 * pas deux refus 403. Jamais son URL, qui contient l'identifiant du membre.
 */
export function discordErrorCode(err: unknown): number | string {
  return err instanceof DiscordAPIError ? err.code : 'network';
}
