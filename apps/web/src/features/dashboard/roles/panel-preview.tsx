import type { GuildRoleSummary } from '@phenix/shared';
import type { RolePanelFormInput } from './form-values';

const FOOTER = {
  MULTIPLE: 'Clique pour prendre un rôle, reclique pour le retirer.',
  UNIQUE: 'Un seul rôle à la fois : en choisir un retire le précédent.',
} as const;

interface Props {
  values: RolePanelFormInput;
  roles: GuildRoleSummary[];
}

/** Aperçu du message tel que le bot le postera : embed aux couleurs du bot et boutons gris. */
export function PanelPreview({ values, roles }: Props) {
  const names = new Map(roles.map((role) => [role.id, role.name]));
  const buttons = values.options.filter((option) => option.roleId || option.label);

  return (
    <figure aria-label="Aperçu du message sur Discord" className="flex flex-col gap-2">
      <figcaption className="text-xs font-semibold tracking-widest text-stone-400 uppercase">
        Aperçu sur Discord
      </figcaption>
      <div className="rounded-lg bg-[#313338] p-4 text-[#dbdee1]">
        <div className="rounded border-l-4 border-flame bg-[#2b2d31] p-3">
          <p className="font-semibold text-white">{values.title || 'Titre du panel'}</p>
          {typeof values.description === 'string' && values.description && (
            <p className="mt-1 text-sm whitespace-pre-line">{values.description}</p>
          )}
          <p className="mt-2 text-xs text-[#949ba4]">{FOOTER[values.mode]}</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {buttons.map((option, index) => (
            <span
              key={`${option.roleId}-${index}`}
              className="rounded bg-[#4e5058] px-3 py-1.5 text-sm font-medium text-white"
            >
              {option.emoji ? `${option.emoji} ` : ''}
              {option.label || names.get(option.roleId) || 'Bouton'}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
