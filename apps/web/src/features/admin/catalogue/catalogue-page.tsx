import { TD2_KIND_LABELS, type Td2KindKey } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Icon } from '../../../components/icon';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field, inputClass } from '../../../components/ui/field';
import { PageHeader, Panel } from '../../../components/ui/panel';
import { LoadError, PageSkeleton } from '../../dashboard/query-state';
import { catalogueQuery, useCreateActivity } from '../api';
import { ActivityCard } from './activity-card';

const SECTIONS: { kind: Td2KindKey; title: string; empty: string }[] = [
  { kind: 'RAID', title: 'Raids', empty: 'Aucun raid pour l’instant' },
  { kind: 'INCURSION', title: 'Incursions', empty: 'Aucune incursion pour l’instant' },
];

function NewActivityForm() {
  const create = useCreateActivity();
  const [kind, setKind] = useState<Td2KindKey>('RAID');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      aria-label="Nouvelle activité"
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await create.mutateAsync({ kind, name: name.trim() });
          setName('');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Échec');
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
        <Field id="new-activity-kind" label="Type">
          <select
            id="new-activity-kind"
            className={inputClass}
            value={kind}
            onChange={(event) => setKind(event.target.value as Td2KindKey)}
          >
            {SECTIONS.map((section) => (
              <option key={section.kind} value={section.kind}>
                {TD2_KIND_LABELS[section.kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="new-activity-name" label="Nom de l’activité">
          <input
            id="new-activity-name"
            className={inputClass}
            value={name}
            maxLength={40}
            placeholder="Dark Hours, Paradis Perdu…"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Button
          type="submit"
          className="min-h-11"
          disabled={create.isPending || name.trim() === ''}
        >
          <Icon name="plus" className="size-4" />
          Ajouter
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-flame">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * Le catalogue que propose /td2. Une composition modifiée vaut pour les prochaines sorties :
 * celles déjà créées gardent la leur.
 */
export function CataloguePage() {
  const { data: catalogue, error, refetch } = useQuery(catalogueQuery);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Catalogue The Division 2"
        description="Les activités et leurs modes, proposés par /td2 sur tous les serveurs. Une composition modifiée vaut pour les prochaines sorties : celles déjà créées gardent la leur."
      />

      <Panel
        icon="plus"
        title="Nouvelle activité"
        description="Donne-lui ensuite au moins un mode : c’est lui qui fixe la composition."
      >
        <NewActivityForm />
      </Panel>

      {error && <LoadError error={error} onRetry={() => void refetch()} />}
      {!error && !catalogue && <PageSkeleton label="Chargement du catalogue…" panels={2} />}
      {catalogue &&
        SECTIONS.map((section) => {
          const activities = catalogue.filter((activity) => activity.kind === section.kind);
          return (
            <section
              key={section.kind}
              aria-labelledby={`catalogue-${section.kind}`}
              className="flex flex-col gap-4"
            >
              <h3
                id={`catalogue-${section.kind}`}
                className="flex items-center gap-2.5 font-display text-lg font-semibold text-white"
              >
                {section.title}
                <span className="rounded-full bg-white/8 px-2 py-0.5 font-sans text-xs font-medium text-stone-300">
                  {activities.length}
                </span>
              </h3>
              {activities.length === 0 && (
                <EmptyState icon="crosshair" title={section.empty}>
                  Ajoute-la avec le formulaire du dessus, puis donne-lui au moins un mode.
                </EmptyState>
              )}
              {activities.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </section>
          );
        })}
    </div>
  );
}
