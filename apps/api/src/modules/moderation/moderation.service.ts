import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  caseStatus,
  liftSanction,
  listGuildCases,
  PrismaClient,
  summarizeMemberCases,
  type Case,
} from '@phenix/database';
import { LockBusyError, LockUnavailableError, moderationLockKey } from '@phenix/jobs';
import {
  auditReason,
  CASE_PAGE_SIZE,
  checkTarget,
  MODERATION_BUSY_MESSAGE,
  type CaseListQuery,
  type CasePage,
  type CaseRevokeInput,
  type CaseRevokeResult,
  type CaseSummary,
  type ManageableGuild,
  type MemberModeration,
  type ResolvedUser,
} from '@phenix/shared';
import { PermissionFlagsBits } from 'discord-api-types/v10';
import { BotEventsService } from '../../core/bot-events.service.js';
import { LockService } from '../../core/lock.service.js';
import { RateLimitService } from '../../core/rate-limit.service.js';
import { ENV } from '../../core/tokens.js';
import { DiscordService } from '../../discord/discord.service.js';
import type { Env } from '../../env.js';
import type { Session } from '../auth/session.service.js';
import { GuildsService } from '../guilds/guilds.service.js';
import { MemberSearch } from './member-search.js';
import { classifyDiscordError, discordErrorCode } from './revoke-errors.js';
import { UserDirectory } from './user-directory.js';

/** Ce qu'on peut lever depuis le site, et la permission Discord qu'il faut pour le faire. */
const LIFT_PERMISSION = {
  BAN: { flag: PermissionFlagsBits.BanMembers, label: 'Bannir des membres' },
  MUTE: { flag: PermissionFlagsBits.ModerateMembers, label: 'Exclure temporairement des membres' },
  WARN: { flag: PermissionFlagsBits.ModerateMembers, label: 'Exclure temporairement des membres' },
} as const;

const ABSENT_MEMBER =
  'Ce membre a quitté le serveur : sa sourdine ne peut pas être levée d’ici, elle reviendrait avec lui.';
const BOT_TOO_LOW =
  'Le bot n’a pas le droit d’agir sur ce membre : son rôle doit être au-dessus du sien, avec la bonne permission.';
const LOCK_UNAVAILABLE =
  'Impossible de vérifier qu’aucune autre action de modération ne vise ce membre : réessaie dans un instant.';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly users: UserDirectory,
    private readonly discord: DiscordService,
    private readonly guilds: GuildsService,
    private readonly botEvents: BotEventsService,
    private readonly rateLimit: RateLimitService,
    private readonly lock: LockService,
    private readonly memberSearch: MemberSearch,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Les sanctions de ce serveur, filtrées, avec le nom de chaque personne concernée. Le texte
   * cherché vaut aussi pour les pseudos (`MemberSearch`), sans jamais faire échouer la liste.
   */
  async list(guildId: string, userId: string, query: CaseListQuery): Promise<CasePage> {
    const { page: number, ...filters } = query;
    const now = new Date();
    const { userIds, nameSearch } = await this.memberSearch.search(guildId, userId, filters.q);
    const slice = await listGuildCases(
      this.db,
      guildId,
      { ...filters, userIds },
      { page: number, pageSize: CASE_PAGE_SIZE },
      now,
    );
    const people = await this.users.resolve(
      slice.items.flatMap((c) => [
        c.targetId,
        c.moderatorId,
        ...(c.revokedById ? [c.revokedById] : []),
      ]),
    );
    return {
      items: slice.items.map((c) => toSummary(c, people, now)),
      total: slice.total,
      page: slice.page,
      pageSize: slice.pageSize,
      nameSearch,
    };
  }

  /**
   * Lève une sanction depuis le site. L'ordre compte : Discord d'abord, la base ensuite. Si Discord
   * refuse ou ne répond pas, la sanction reste active et le site ne ment pas ; si la base échoue après
   * Discord, un nouvel essai converge (un ban déjà levé répond 10026, un timeout se retire deux fois).
   * La cible vient de la sanction trouvée par (serveur, numéro), jamais du client.
   * Discord et la base se font sous le verrou du membre, partagé avec le bot (/ban, /mute, levée
   * automatique…), et la sanction y est relue : une commande passée pendant l'attente est vue.
   */
  async revoke(
    guild: ManageableGuild,
    number: number,
    session: Session,
    input: CaseRevokeInput,
  ): Promise<CaseRevokeResult> {
    // Limite par compte, avant toute lecture : un refus de Discord (bot trop bas…) ne change rien en
    // base, donc se rejouerait sans fin ; chaque essai coûte des appels REST, et les refus comptent
    // contre le jeton
    await this.rateLimit.hit(
      `moderation-revoke:${session.userId}`,
      10,
      60,
      'Trop de levées à la suite : patiente une minute.',
    );
    const sanction = await this.findCase(guild.id, number);
    const type = liftableType(sanction);
    if (!type) return { alreadyRevoked: true };

    const actorId = session.userId;
    if (sanction.targetId === actorId) {
      throw new ForbiddenException('Tu ne peux pas lever une sanction qui te vise.');
    }
    // Le site n'accorde pas plus de pouvoir que Discord : même permission que la commande du bot
    const { flag, label } = LIFT_PERMISSION[type];
    if (!(await this.guilds.hasDiscordPermission(session, guild.id, flag))) {
      throw new ForbiddenException(
        `Il te manque la permission Discord « ${label} » sur ce serveur.`,
      );
    }
    // Limite du serveur, après la permission et avant Discord : des délégués sans la permission ne
    // peuvent pas épuiser celle des vrais modérateurs
    await this.rateLimit.hit(
      `moderation-revoke:guild:${guild.id}`,
      30,
      60,
      'Ce serveur a trop de levées à la suite : patiente une minute.',
    );

    const reason = auditReason(await this.actorName(actorId), input.reason, 'dashboard');
    const lifted = await this.underLock(guild.id, sanction.targetId, async () => {
      // Relue sous le verrou : un /ban qui prolonge a pu la lever (et créer la suivante) entre-temps
      const current = await this.findCase(guild.id, number);
      if (!liftableType(current)) return null;
      await this.actOnDiscord(guild.id, current, actorId, reason);
      return this.record(guild, current, actorId, input.reason);
    });
    // Une autre levée est passée entre-temps (site, commande, levée automatique) : rien à publier
    if (!lifted || lifted.revoked === 0) return { alreadyRevoked: true };
    const { record } = lifted;

    // Hors du verrou : prévenir le bot ne touche ni Discord ni la sanction, inutile de bloquer le membre
    this.logger.log({ guildId: guild.id, case: number, type }, 'Sanction lifted from dashboard');
    // Le bot publie le log ; pour un avertissement, qui n'a pas de sanction de fin, c'est lui-même
    await this.botEvents.notify({
      type: 'moderation.logged',
      guildId: guild.id,
      caseId: record?.id ?? sanction.id,
    });
    return { alreadyRevoked: false };
  }

  /** La sanction de ce serveur portant ce numéro ; 404 sinon. */
  private async findCase(guildId: string, number: number): Promise<Case> {
    const sanction = await this.db.case.findUnique({
      where: { guildId_number: { guildId, number } },
    });
    if (!sanction) throw new NotFoundException('Sanction introuvable');
    return sanction;
  }

  /**
   * `fn` sous le verrou de modération du membre. Pris ailleurs : 409, rien n'est touché. Valkey en
   * panne : on refuse (503) plutôt que d'agir sans savoir si le bot agit sur le même membre.
   */
  private async underLock<T>(guildId: string, targetId: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await this.lock.withLock(moderationLockKey(guildId, targetId), fn);
    } catch (err) {
      if (err instanceof LockBusyError) throw new ConflictException(MODERATION_BUSY_MESSAGE);
      if (err instanceof LockUnavailableError) {
        // Ni la clé ni l'erreur : elles contiennent l'identifiant du membre
        this.logger.warn({ guildId }, 'Moderation lock unavailable, lift refused');
        throw new ServiceUnavailableException(LOCK_UNAVAILABLE);
      }
      throw err;
    }
  }

  /**
   * L'enregistrement en base, APRÈS Discord. Sur Discord, un ban ou une sourdine se lève par
   * personne, pas par sanction : on lève donc toutes les sanctions actives de ce type pour la cible
   * (un /ban qui prolonge en a pu créer une plus récente entre-temps, qui resterait « active » alors
   * que le membre est débanni). Seul un avertissement se retire par son numéro.
   * Si la base échoue ici, Discord a déjà agi : on le dit, et un nouvel essai complète l'enregistrement.
   */
  private async record(
    guild: ManageableGuild,
    sanction: Case,
    actorId: string,
    reason: string | null,
  ) {
    const type = sanction.type as 'WARN' | 'MUTE' | 'BAN';
    try {
      return await liftSanction(this.db, {
        guildId: guild.id,
        guildName: guild.name,
        targetId: sanction.targetId,
        type,
        number: type === 'WARN' ? sanction.number : undefined,
        actorId,
        reason,
        via: 'DASHBOARD',
      });
    } catch (err) {
      // Ni la cible ni le message (qui peut recopier des arguments) : le serveur, le numéro et le code
      // de l'erreur (P1001…) suffisent au diagnostic
      const code = err instanceof Error ? (err as { code?: unknown }).code : undefined;
      this.logger.error(
        {
          guildId: guild.id,
          case: sanction.number,
          type,
          discordDone: type !== 'WARN',
          code: typeof code === 'string' ? code : undefined,
        },
        'Sanction lifted on Discord but not recorded',
      );
      throw new ServiceUnavailableException(
        type === 'WARN'
          ? 'L’enregistrement a échoué : réessaie dans un instant.'
          : 'La sanction a été levée sur Discord mais pas enregistrée : réessaie, cela complétera l’enregistrement.',
      );
    }
  }

  /** L'action sur Discord, avant toute écriture en base. Un avertissement n'en demande aucune. */
  private async actOnDiscord(
    guildId: string,
    sanction: Case,
    actorId: string,
    reason: string,
  ): Promise<void> {
    if (sanction.type === 'WARN') return;
    try {
      if (sanction.type === 'BAN') {
        await this.discord.removeGuildBan(guildId, sanction.targetId, reason);
        return;
      }
      await this.checkMuteTarget(guildId, sanction.targetId, actorId);
      await this.discord.clearMemberTimeout(guildId, sanction.targetId, reason);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const failure = classifyDiscordError(err);
      // Seulement le code : l'URL de l'erreur contient l'identifiant du membre
      this.logger.warn(
        { guildId, case: sanction.number, code: discordErrorCode(err) },
        'Discord refused to lift a sanction',
      );
      if (failure === 'already-lifted') return;
      if (failure === 'bot-too-low') throw new ConflictException(BOT_TOO_LOW);
      if (failure === 'unknown-member') throw new ConflictException(ABSENT_MEMBER);
      throw new ServiceUnavailableException(
        'Discord ne répond pas, réessaie dans un instant. La sanction n’a peut-être pas été modifiée.',
      );
    }
  }

  /** Les mêmes garde-fous que la commande /unmute : rôle du modérateur, propriétaire, présence. */
  private async checkMuteTarget(guildId: string, targetId: string, actorId: string): Promise<void> {
    const [guild, roles, actor, target] = await Promise.all([
      this.discord.getGuild(guildId),
      this.discord.getGuildRoles(guildId),
      this.discord.getGuildMember(guildId, actorId),
      this.discord.getGuildMember(guildId, targetId),
    ]);
    // Un membre parti : la sourdine reviendrait avec lui, on ne la déclare pas levée
    if (!target) throw new ConflictException(ABSENT_MEMBER);
    const position = (roleIds: readonly string[] | undefined) =>
      Math.max(
        0,
        ...roles.filter((role) => roleIds?.includes(role.id)).map((role) => role.position),
      );
    const refusal = checkTarget({
      moderatorId: actorId,
      targetId,
      botId: this.env.DISCORD_CLIENT_ID,
      ownerId: guild.owner_id,
      moderatorPosition: position(actor?.roles),
      targetPosition: position(target.roles),
    });
    if (refusal) throw new ForbiddenException(refusal);
  }

  /** Le nom inscrit au journal d'audit de Discord ; l'identifiant à défaut. */
  private async actorName(userId: string): Promise<string> {
    try {
      const user = await this.db.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      return user?.username ?? userId;
    } catch {
      return userId;
    }
  }

  /** L'en-tête de la fiche d'un membre : qui il est, combien de sanctions, ce qui est actif. */
  async member(guildId: string, userId: string): Promise<MemberModeration> {
    const summary = await summarizeMemberCases(this.db, guildId, userId);
    // Aucune sanction ici : rien à afficher de plus que l'identifiant, et surtout pas d'appel à
    // Discord pour un compte quelconque (ce serait un moyen de le surcharger, et de sonder des tiers)
    const people = summary.total > 0 ? await this.users.resolve([userId]) : new Map();
    return {
      user: person(people, userId),
      total: summary.total,
      byType: summary.byType,
      activeWarns: summary.activeWarns,
      activeMute: summary.activeMute && {
        number: summary.activeMute.number,
        expiresAt: summary.activeMute.expiresAt?.toISOString() ?? null,
      },
      activeBan: summary.activeBan,
    };
  }
}

/** Le type à lever ; null si elle l'est déjà ; 409 si elle ne peut pas l'être (plus active, ou sans objet). */
function liftableType(sanction: Case): 'WARN' | 'MUTE' | 'BAN' | null {
  const status = caseStatus(sanction);
  if (status === 'revoked') return null;
  const type = sanction.type;
  if (status !== 'active' || (type !== 'WARN' && type !== 'MUTE' && type !== 'BAN')) {
    throw new ConflictException('Cette sanction ne peut pas être levée');
  }
  return type;
}

const person = (people: Map<string, ResolvedUser>, id: string): ResolvedUser =>
  people.get(id) ?? { id, name: id, avatarUrl: null };

function toSummary(c: Case, people: Map<string, ResolvedUser>, now: Date): CaseSummary {
  return {
    number: c.number,
    type: c.type,
    status: caseStatus(c, now),
    target: person(people, c.targetId),
    moderator: person(people, c.moderatorId),
    reason: c.reason,
    createdAt: c.createdAt.toISOString(),
    expiresAt: c.expiresAt?.toISOString() ?? null,
    revokedAt: c.revokedAt?.toISOString() ?? null,
    revokedBy: c.revokedById ? person(people, c.revokedById) : null,
  };
}
