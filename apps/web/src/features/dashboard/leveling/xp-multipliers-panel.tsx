import {
  MAX_XP_MULTIPLIERS,
  XP_MULTIPLIER_MAX_PERCENT,
  XP_MULTIPLIER_MIN_PERCENT,
  xpMultiplierSchema,
  type GuildCategorySummary,
  type GuildChannelSummary,
  type GuildRoleSummary,
  type LevelingConfig,
  type XpMultiplierEntry,
  type XpMultiplierKind,
} from '@phenix/shared';
import { useRef, useState } from 'react';
import { Icon } from '../../../components/icon';
import { Button } from '../../../components/ui/button';
import { inputClass } from '../../../components/ui/field';
import { Panel } from '../../../components/ui/panel';
import { previewBonus } from './xp-bonus-preview';

interface Props {
  /** Les réglages enregistrés dont l'aperçu a besoin : XP d'un message et plafond des bonus */
  config: Pick<LevelingConfig, 'xpMin' | 'xpMax' | 'xpMultiplierMaxPercent'>;
  /** Les bonus enregistrés */
  multipliers: XpMultiplierEntry[];
  roles: GuildRoleSummary[];
  channels: GuildChannelSummary[];
  voiceChannels: GuildChannelSummary[];
  forumChannels: GuildChannelSummary[];
  categories: GuildCategorySummary[];
  onSubmit: (multipliers: XpMultiplierEntry[]) => Promise<unknown>;
}

/** Un rôle, un salon ou une catégorie que l'on peut choisir. */
interface Choice {
  id: string;
  kind: XpMultiplierKind;
  /** Texte de l'option de la liste */
  option: string;
  /** Nom dans l'aperçu */
  name: string;
}

interface Row {
  key: number;
  /** Vide tant que rien n'est choisi */
  targetId: string;
  /** Genre d'une cible enregistrée que Discord ne connaît plus ; sinon il se déduit du choix */
  savedKind: XpMultiplierKind | null;
  /** Ce qui est tapé : validé à l'enregistrement */
  percent: string;
}

const DELETED_LABEL: Record<XpMultiplierKind, string> = {
  ROLE: 'Rôle supprimé',
  CHANNEL: 'Salon supprimé',
  CATEGORY: 'Catégorie supprimée',
};

/** Pourcentage d'un bonus qu'on vient d'ajouter. */
const DEFAULT_PERCENT = '150';

const NO_TARGET_MESSAGE = 'Choisis un rôle, un salon ou une catégorie';

const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

/** Le pourcentage tapé, contrôlé par la règle partagée avec l'API ; null s'il est valide. */
function percentError(text: string): string | null {
  const value = text.trim() === '' ? Number.NaN : Number(text);
  const result = xpMultiplierSchema.shape.percent.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Pourcentage invalide');
}

const channelChoices = (
  list: GuildChannelSummary[],
  marker: string,
  withParent: boolean,
): Choice[] =>
  list.map((channel) => ({
    id: channel.id,
    kind: 'CHANNEL',
    option: `${marker}${channel.name}${withParent && channel.parentName ? ` (${channel.parentName})` : ''}`,
    name: `${marker}${channel.name}`,
  }));

/**
 * Les bonus d'XP : une liste de lignes « Rôle, salon ou catégorie » + « Pourcentage », enregistrée
 * d'un bloc par son propre bouton (l'API remplace toute la liste). Sous la liste, un aperçu de ce
 * que rapporte chaque bonus seul, calculé avec les fonctions du bot.
 */
export function XpMultipliersPanel({
  config,
  multipliers,
  roles,
  channels,
  voiceChannels,
  forumChannels,
  categories,
  onSubmit,
}: Props) {
  const groups: { title: string; choices: Choice[] }[] = [
    {
      title: 'Rôles',
      choices: roles.map((role) => ({
        id: role.id,
        kind: 'ROLE',
        option: role.managed ? `${role.name} (géré)` : role.name,
        name: role.name,
      })),
    },
    { title: 'Salons textuels', choices: channelChoices(channels, '#', true) },
    { title: 'Salons vocaux', choices: channelChoices(voiceChannels, '🔊 ', false) },
    { title: 'Forums et médias', choices: channelChoices(forumChannels, '💬 ', false) },
    {
      title: 'Catégories',
      choices: categories.map((category) => ({
        id: category.id,
        kind: 'CATEGORY',
        option: `📁 ${category.name}`,
        name: category.name,
      })),
    },
  ];
  const byId = new Map(
    groups.flatMap((group) => group.choices).map((choice) => [choice.id, choice]),
  );

  const nextKey = useRef(0);
  const newRow = (targetId: string, percent: string, savedKind: XpMultiplierKind | null): Row => ({
    key: nextKey.current++,
    targetId,
    savedKind,
    percent,
  });

  const [rows, setRows] = useState<Row[]>(() =>
    multipliers.map((entry) =>
      newRow(entry.targetId, String(entry.percent), byId.has(entry.targetId) ? null : entry.kind),
    ),
  );
  const signature = (list: Row[]) => list.map((row) => `${row.targetId}:${row.percent}`).join(',');
  const [baseline, setBaseline] = useState(() => signature(rows));
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const limitReached = rows.length >= MAX_XP_MULTIPLIERS;
  const dirty = signature(rows) !== baseline;

  /** Toute modification efface l'état de l'enregistrement précédent. */
  const edit = (change: (list: Row[]) => Row[]) => {
    setRows(change);
    setSaved(false);
    setServerError(null);
  };
  const update = (key: number, patch: Partial<Row>) => {
    edit((list) => list.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setErrors((current) => {
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
  };

  const submit = async (event: React.SyntheticEvent) => {
    event.preventDefault();
    const found: Record<number, string> = {};
    for (const row of rows) {
      const message = row.targetId === '' ? NO_TARGET_MESSAGE : percentError(row.percent);
      if (message) found[row.key] = message;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const entries: XpMultiplierEntry[] = rows.map((row) => ({
      kind: byId.get(row.targetId)?.kind ?? row.savedKind ?? 'ROLE',
      targetId: row.targetId,
      percent: Number(row.percent),
    }));
    setSubmitting(true);
    setServerError(null);
    try {
      await onSubmit(entries);
      setBaseline(signature(rows));
      setSaved(true);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const previews = rows.flatMap((row) => {
    const choice = byId.get(row.targetId);
    if (!choice || percentError(row.percent)) return [];
    const entry = { kind: choice.kind, targetId: row.targetId, percent: Number(row.percent) };
    return [
      {
        key: row.key,
        name: choice.name,
        ...previewBonus(entry, config, config.xpMultiplierMaxPercent),
      },
    ];
  });

  return (
    <Panel
      icon="trophy"
      title="Bonus d'XP"
      description="Un rôle, un salon ou une catégorie rapporte plus (ou moins) d'XP par message, selon son pourcentage : 100 % ne change rien."
    >
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {rows.length === 0 ? (
          <p className="text-sm text-stone-400">Aucun bonus pour l'instant.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              aria-hidden="true"
              className="hidden gap-3 text-xs font-medium tracking-wide text-stone-400 uppercase sm:grid sm:grid-cols-[1fr_9rem_2.75rem]"
            >
              <span>Rôle, salon ou catégorie</span>
              <span>Pourcentage</span>
              <span />
            </div>
            {rows.map((row, index) => {
              const number = index + 1;
              const error = errors[row.key];
              const taken = new Set(
                rows.filter((other) => other.key !== row.key).map((other) => other.targetId),
              );
              return (
                <div key={row.key} className="flex flex-col gap-1.5">
                  <div className="grid gap-3 sm:grid-cols-[1fr_9rem_2.75rem]">
                    <select
                      aria-label={`Rôle, salon ou catégorie du bonus ${number}`}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `xp-multiplier-${row.key}-error` : undefined}
                      className={inputClass}
                      value={row.targetId}
                      onChange={(event) =>
                        update(row.key, { targetId: event.target.value, savedKind: null })
                      }
                    >
                      <option value="">{NO_TARGET_MESSAGE}</option>
                      {groups.map(({ title, choices: list }) => {
                        const available = list.filter((choice) => !taken.has(choice.id));
                        return (
                          available.length > 0 && (
                            <optgroup key={title} label={title}>
                              {available.map((choice) => (
                                <option key={choice.id} value={choice.id}>
                                  {choice.option}
                                </option>
                              ))}
                            </optgroup>
                          )
                        );
                      })}
                      {row.savedKind && (
                        <optgroup label="Supprimés">
                          <option value={row.targetId}>
                            {DELETED_LABEL[row.savedKind]} ({row.targetId})
                          </option>
                        </optgroup>
                      )}
                    </select>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={XP_MULTIPLIER_MIN_PERCENT}
                        max={XP_MULTIPLIER_MAX_PERCENT}
                        aria-label={`Pourcentage du bonus ${number}`}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `xp-multiplier-${row.key}-error` : undefined}
                        className={inputClass}
                        value={row.percent}
                        onChange={(event) => update(row.key, { percent: event.target.value })}
                      />
                      <span aria-hidden="true" className="text-sm text-stone-400">
                        %
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 min-w-11 px-0"
                      aria-label={`Supprimer le bonus ${number}`}
                      onClick={() => edit((list) => list.filter((item) => item.key !== row.key))}
                    >
                      <Icon name="trash" className="size-4" />
                    </Button>
                  </div>
                  {row.savedKind && (
                    <p className="text-[13px] text-gold">
                      Cet élément n'existe plus sur le serveur : retire ce bonus.
                    </p>
                  )}
                  {error && (
                    <p
                      id={`xp-multiplier-${row.key}-error`}
                      role="alert"
                      className="text-[13px] text-flame"
                    >
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={limitReached}
            onClick={() => edit((list) => [...list, newRow('', DEFAULT_PERCENT, null)])}
          >
            <Icon name="plus" className="size-4" />
            Ajouter un bonus
          </Button>
          {/* Toujours dans le DOM : les lecteurs d'écran n'annoncent que le changement d'une zone déjà présente */}
          <p role="status" className="text-[13px] text-gold">
            {limitReached &&
              `${MAX_XP_MULTIPLIERS} bonus au plus : supprime-en un pour en ajouter un autre.`}
          </p>
        </div>

        <p className="text-[13px] leading-relaxed text-stone-400">
          Les pourcentages se multiplient : tous les rôles du membre, puis un seul pourcentage de
          lieu (le salon, sinon la catégorie ; un fil de discussion prend celui de son salon
          parent). Le total reste entre {XP_MULTIPLIER_MIN_PERCENT} % et le plafond des bonus (
          {config.xpMultiplierMaxPercent} %).
        </p>

        {previews.length > 0 && (
          <section
            aria-label="Aperçu des bonus"
            className="flex flex-col gap-2 rounded-xl bg-white/4 px-4 py-3.5"
          >
            <h4 className="text-sm font-medium text-stone-100">Aperçu</h4>
            <p className="text-[13px] text-stone-400">
              XP par message avec chaque bonus seul, d'après les réglages enregistrés.
            </p>
            <ul className="flex flex-col gap-1 text-sm text-stone-300">
              {previews.map((preview) => (
                <li key={preview.key}>
                  {preview.name} : {range(config.xpMin, config.xpMax)} XP →{' '}
                  {range(preview.min, preview.max)} XP
                  {preview.limited &&
                    ` (limité par le plafond des bonus, ${config.xpMultiplierMaxPercent} %)`}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-white/6 pt-5">
          <div className="min-w-0 flex-1 text-sm">
            {serverError ? (
              <p role="alert" className="text-flame">
                {serverError}
              </p>
            ) : saved ? (
              <p role="status" className="flex items-center gap-2 text-gold">
                <Icon name="check" className="size-4" />
                Bonus enregistrés. Le bot applique déjà le changement.
              </p>
            ) : dirty ? (
              <p className="text-stone-200">Modifications non enregistrées</p>
            ) : null}
          </div>
          <Button type="submit" disabled={submitting || !dirty}>
            {submitting ? 'Enregistrement…' : 'Enregistrer les bonus'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
