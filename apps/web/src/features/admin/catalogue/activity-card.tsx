import type { Td2CatalogueActivity } from '@phenix/shared';
import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { inputClass } from '../../../components/ui/field';
import { useCreateMode, useDeleteMode, useUpdateActivity, useUpdateMode } from '../api';
import { ModeForm } from './mode-form';

/** Une activité du catalogue : son nom, son état, et ses modes. */
export function ActivityCard({ activity }: { activity: Td2CatalogueActivity }) {
    const updateActivity = useUpdateActivity();
    const createMode = useCreateMode();
    const updateMode = useUpdateMode();
    const deleteMode = useDeleteMode();
    const [name, setName] = useState(activity.name);
    const [error, setError] = useState<string | null>(null);
    // La case suit le clic tout de suite ; la réponse de l'API (ou une erreur) la recale
    const [active, setActive] = useState(activity.active);
    useEffect(() => setActive(activity.active), [activity.active]);

    const patch = async (change: { name?: string; active?: boolean }) => {
        setError(null);
        try {
            await updateActivity.mutateAsync({ id: activity.id, patch: change });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Échec');
            setName(activity.name);
            setActive(activity.active);
        }
    };

    return (
        <Card className={active ? '' : 'opacity-70'}>
            <div className="flex flex-wrap items-center gap-3">
                <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const trimmed = name.trim();
                        if (trimmed && trimmed !== activity.name) void patch({ name: trimmed });
                    }}
                >
                    <input
                        aria-label={`Nom de ${activity.name}`}
                        className={`${inputClass} max-w-xs font-semibold`}
                        value={name}
                        maxLength={40}
                        onChange={(event) => setName(event.target.value)}
                    />
                    {name.trim() !== activity.name && (
                        <Button type="submit" variant="ghost">
                            Renommer
                        </Button>
                    )}
                </form>
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={active}
                        onChange={(event) => {
                            setActive(event.target.checked);
                            void patch({ active: event.target.checked });
                        }}
                    />
                    Proposée dans /td2
                </label>
            </div>
            {error && (
                <p role="alert" className="mt-2 text-xs text-flame">
                    {error}
                </p>
            )}

            <div className="mt-3">
                {activity.modes.map((mode) => (
                    <ModeForm
                        key={mode.id}
                        mode={mode}
                        idPrefix={`mode-${mode.id}`}
                        onSubmit={(input) => updateMode.mutateAsync({ modeId: mode.id, input })}
                        onDelete={() => deleteMode.mutateAsync(mode.id)}
                    />
                ))}
                <ModeForm
                    idPrefix={`new-mode-${activity.id}`}
                    onSubmit={(input) => createMode.mutateAsync({ activityId: activity.id, input })}
                />
            </div>
        </Card>
    );
}