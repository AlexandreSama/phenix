import { zodResolver } from '@hookform/resolvers/zod';
import {
  forumCategoryInputSchema,
  type ForumCategoryData,
  type ForumCategoryInput,
  type ForumCategorySummary,
} from '@phenix/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Icon } from '../../../components/icon';
import { Button } from '../../../components/ui/button';
import { inputClass } from '../../../components/ui/field';

interface Props {
  category?: ForumCategorySummary;
  /** Position proposée pour une nouvelle catégorie : à la fin */
  nextPosition?: number;
  onSubmit: (input: ForumCategoryData) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
}

const EMPTY: ForumCategoryInput = { slug: '', name: '', description: '', position: 0 };
const labelClass = 'flex flex-col gap-1.5 text-[13px] font-medium text-stone-300';

/** Une catégorie : son adresse, son nom, sa description et sa place dans la liste. */
export function CategoryForm({ category, nextPosition = 0, onSubmit, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ForumCategoryInput, unknown, ForumCategoryData>({
    resolver: zodResolver(forumCategoryInputSchema),
    defaultValues: category
      ? { ...category, description: category.description ?? '' }
      : { ...EMPTY, position: nextPosition },
  });
  const slug = useWatch({ control, name: 'slug' });

  const fail = (err: unknown) =>
    setError('root.server', { message: err instanceof Error ? err.message : 'Échec' });

  const save = async (input: ForumCategoryData) => {
    try {
      await onSubmit(input);
      reset(
        category
          ? { ...input, description: input.description ?? '' }
          : { ...EMPTY, position: nextPosition + 1 },
      );
    } catch (err) {
      fail(err);
    }
  };

  const message =
    errors.slug?.message ??
    errors.name?.message ??
    errors.description?.message ??
    errors.position?.message ??
    errors.root?.server?.message;
  const label = category ? `Catégorie ${category.name}` : 'Nouvelle catégorie';

  return (
    <form
      onSubmit={handleSubmit(save)}
      noValidate
      aria-label={label}
      className={`flex flex-col gap-4 rounded-xl border p-4 ${
        confirming
          ? 'border-flame/50'
          : category
            ? 'border-white/8 bg-ink/40'
            : 'border-dashed border-white/15'
      }`}
    >
      {!category && (
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon name="plus" className="size-4 text-flame" />
          Nouvelle catégorie
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5.5rem]">
        <label className={labelClass}>
          Nom
          <input className={inputClass} placeholder="Entraide" {...register('name')} />
        </label>
        <label className={labelClass}>
          Adresse
          <input className={inputClass} placeholder="entraide" {...register('slug')} />
        </label>
        <label className={labelClass}>
          Ordre
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className={`${inputClass} text-center tabular-nums`}
            {...register('position', { valueAsNumber: true })}
          />
        </label>
      </div>
      <label className={labelClass}>
        Description
        <input
          className={inputClass}
          placeholder="Builds, conseils, questions…"
          {...register('description')}
        />
      </label>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="submit"
          variant={category ? 'ghost' : 'primary'}
          disabled={isSubmitting || !isDirty}
        >
          {category ? 'Enregistrer' : 'Ajouter la catégorie'}
        </Button>
        {category && onDelete && !confirming && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirming(true)}
            disabled={category.threadCount > 0}
            title={
              category.threadCount > 0
                ? 'Une catégorie qui a des sujets ne se supprime pas'
                : undefined
            }
          >
            <Icon name="trash" className="size-4" />
            Supprimer
          </Button>
        )}
        {category && onDelete && confirming && (
          <>
            <Button
              type="button"
              onClick={() =>
                onDelete()
                  .catch(fail)
                  .finally(() => setConfirming(false))
              }
            >
              Oui, supprimer
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
          </>
        )}
        {/* À droite : où mène la catégorie, et combien de sujets elle range */}
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-stone-400">
          <span className="font-mono">/forum/{slug || '…'}</span>
          {category && (
            <span>
              {category.threadCount} sujet{category.threadCount > 1 ? 's' : ''}
            </span>
          )}
        </span>
      </div>
      {message && (
        <p role="alert" className="text-[13px] text-flame">
          {message}
        </p>
      )}
    </form>
  );
}
