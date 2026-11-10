import { TD2_KIND_LABELS, type Td2KindKey } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { inputClass } from '../../../components/ui/field';
import { catalogueQuery, useCreateActivity } from '../api';
import { ActivityCard } from './activity-card';

const SECTIONS: { kind: Td2KindKey; title: string }[] = [
    { kind: 'RAID', title: 'Raids' },
    { kind: 'INCURSION', title: 'Incursions' },
];

function NewActivityForm() {
    const create = useCreateActivity();
    const [kind, setKind] = useState<Td2KindKey>('RAID');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);

    return (
        <form
            aria-label="Nouvelle activité"
            className="flex flex-col gap-2"
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
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs text-stone-400">
                    Type
                    <select
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
                </label>
                <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-stone-400">
                    Nom de l’activité
                    <input
                        className={inputClass}
                        value={name}
                        maxLength={40}
                        placeholder="Dark Hours, Paradis Perdu…"
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>
                <Button type="submit" disabled={create.isPending || name.trim() === ''}>
                    Ajouter
                </Button>
            </div>
            {error && (
                <p role="alert" className="text-xs text-flame">
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
    const { data: catalogue, error } = useQuery(catalogueQuery);

    return (
        <div className="flex flex-col gap-8">
            <NewActivityForm />
            {error && <p role="alert">{error.message}</p>}
            {!error && !catalogue && <p>Chargement…</p>}
            {catalogue &&
                SECTIONS.map((section) => {
                    const activities = catalogue.filter((activity) => activity.kind === section.kind);
                    return (
                        <section key={section.kind} className="flex flex-col gap-3">
                            <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                            {activities.length === 0 && (
                                <p className="text-sm text-stone-400">Aucune pour l’instant.</p>
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