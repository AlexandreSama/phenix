import { TD2_DIRECTIVE_LIMITS, type Td2Directive } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../../../components/icon';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/field';
import { Panel } from '../../../components/ui/panel';
import { Switch } from '../../../components/ui/switch';
import { LoadError } from '../../dashboard/query-state';
import {
  directivesQuery,
  useCreateDirective,
  useDeleteDirective,
  useUpdateDirective,
} from '../api';

const message = (error: unknown) => (error instanceof Error ? error.message : 'Échec');

interface DirectiveFieldsProps {
  idPrefix: string;
  name: string;
  description: string;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
}

/** Le nom et la description d'une directive, tels que le menu du bot les affiche. */
function DirectiveFields({
  idPrefix,
  name,
  description,
  onName,
  onDescription,
}: DirectiveFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <Field id={`${idPrefix}-name`} label="Nom">
        <input
          id={`${idPrefix}-name`}
          className={inputClass}
          value={name}
          maxLength={TD2_DIRECTIVE_LIMITS.nameMax}
          placeholder="Sans régénération"
          onChange={(event) => onName(event.target.value)}
        />
      </Field>
      <Field
        id={`${idPrefix}-description`}
        label="Ce qu’elle change en jeu"
        hint={`Sous son nom, dans le menu Discord. ${TD2_DIRECTIVE_LIMITS.descriptionMax} caractères au plus.`}
      >
        <input
          id={`${idPrefix}-description`}
          className={inputClass}
          value={description}
          maxLength={TD2_DIRECTIVE_LIMITS.descriptionMax}
          placeholder="La santé ne se régénère plus pendant les combats."
          onChange={(event) => onDescription(event.target.value)}
        />
      </Field>
    </div>
  );
}

function NewDirectiveForm() {
  const create = useCreateDirective();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim(), description: description.trim() || null });
      setName('');
      setDescription('');
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <form
      aria-label="Nouvelle directive"
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3"
    >
      <DirectiveFields
        idPrefix="new-directive"
        name={name}
        description={description}
        onName={setName}
        onDescription={setDescription}
      />
      {error && (
        <p role="alert" className="text-[13px] text-flame">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" className="min-h-11" disabled={create.isPending || !name.trim()}>
          <Icon name="plus" className="size-4" />
          Ajouter la directive
        </Button>
      </div>
    </form>
  );
}

/** Une directive : renommer, décrire, (dés)activer ou supprimer. */
function DirectiveRow({ directive }: { directive: Td2Directive }) {
  const update = useUpdateDirective();
  const remove = useDeleteDirective();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(directive.name);
  const [description, setDescription] = useState(directive.description ?? '');
  const [active, setActive] = useState(directive.active);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setActive(directive.active), [directive.active]);

  const patch = async (change: Parameters<typeof update.mutateAsync>[0]['patch']) => {
    setError(null);
    try {
      await update.mutateAsync({ id: directive.id, patch: change });
      return true;
    } catch (err) {
      setError(message(err));
      setActive(directive.active);
      return false;
    }
  };

  return (
    <li className="flex flex-col gap-4 px-5 py-4 sm:px-6">
      {editing ? (
        <form
          aria-label={`Modifier ${directive.name}`}
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const saved = await patch({
              name: name.trim(),
              description: description.trim() || null,
            });
            if (saved) setEditing(false);
          }}
        >
          <DirectiveFields
            idPrefix={`directive-${directive.id}`}
            name={name}
            description={description}
            onName={setName}
            onDescription={setDescription}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setName(directive.name);
                setDescription(directive.description ?? '');
                setEditing(false);
              }}
            >
              Annuler
            </Button>
            <Button type="submit" className="min-h-11" disabled={update.isPending || !name.trim()}>
              Enregistrer
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-0.5">
            <p className="flex items-center gap-2 font-semibold text-white">
              {directive.name}
              {!active && <Badge tone="muted">Masquée</Badge>}
            </p>
            <p className="text-sm text-stone-400">{directive.description ?? 'Sans description.'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <Switch
              id={`directive-${directive.id}-active`}
              label="Proposée"
              checked={active}
              onChange={(event) => {
                setActive(event.target.checked);
                void patch({ active: event.target.checked });
              }}
            />
            <div className="flex gap-1">
              <button
                type="button"
                aria-label={`Modifier ${directive.name}`}
                onClick={() => setEditing(true)}
                className="flex size-10 items-center justify-center rounded-lg text-stone-400 transition hover:bg-white/6 hover:text-white focus-visible:outline-2 focus-visible:outline-gold"
              >
                <Icon name="pencil" className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Supprimer ${directive.name}`}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(directive.id, { onError: (err) => setError(message(err)) })
                }
                className="flex size-10 items-center justify-center rounded-lg text-stone-400 transition hover:bg-ember/15 hover:text-[#ff8a4c] focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-50"
              >
                <Icon name="trash" className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-flame">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * Les directives que l'organisateur d'une mission peut ajouter (menu de /td2 mission).
 * Une mission garde le nom qu'elle a copié : renommer ou supprimer ne change pas les sorties
 * déjà créées.
 */
export function DirectivesPanel() {
  const { data: directives, error, refetch } = useQuery(directivesQuery);
  const activeCount = directives?.filter((directive) => directive.active).length ?? 0;

  return (
    <Panel
      icon="flag"
      title="Directives des missions"
      description={`Les contraintes qui corsent une mission, proposées dans un menu après /td2 mission : ${TD2_DIRECTIVE_LIMITS.maxActive} actives au plus, la limite d’un menu Discord. Une mission déjà créée garde les noms qu’elle avait.`}
      aside={
        directives && (
          <span className="text-sm text-stone-400 tabular-nums">
            {activeCount}/{TD2_DIRECTIVE_LIMITS.maxActive} actives
          </span>
        )
      }
      flush
    >
      <div className="border-b border-white/6 p-5 sm:p-6">
        <NewDirectiveForm />
      </div>
      {error && (
        <div className="p-5 sm:p-6">
          <LoadError error={error} onRetry={() => void refetch()} />
        </div>
      )}
      {!error && !directives && (
        <p role="status" className="p-6 text-sm text-stone-400">
          Chargement des directives…
        </p>
      )}
      {directives && directives.length === 0 && (
        <p className="p-6 text-sm text-stone-400">
          Aucune directive : /td2 mission ne proposera pas de menu.
        </p>
      )}
      {directives && directives.length > 0 && (
        <ul aria-label="Directives" className="flex flex-col divide-y divide-white/6">
          {directives.map((directive) => (
            <DirectiveRow key={directive.id} directive={directive} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
