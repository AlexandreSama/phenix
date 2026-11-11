import { zodResolver } from '@hookform/resolvers/zod';
import {
  forumCategoryInputSchema,
  type ForumCategoryData,
  type ForumCategoryInput,
  type ForumCategorySummary,
} from '@phenix/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
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

/** Une catégorie : son adresse, son nom, sa description et sa place dans la liste. */
export function CategoryForm({ category, nextPosition = 0, onSubmit, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ForumCategoryInput, unknown, ForumCategoryData>({
    resolver: zodResolver(forumCategoryInputSchema),
    defaultValues: category
      ? { ...category, description: category.description ?? '' }
      : { ...EMPTY, position: nextPosition },
  });

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
      className="flex flex-col gap-2 border-t border-brown py-3 first:border-t-0"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem]">
        <label className="flex flex-col gap-1 text-xs text-stone-400">
          Nom
          <input className={inputClass} placeholder="Entraide" {...register('name')} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-400">
          Adresse
          <input className={inputClass} placeholder="entraide" {...register('slug')} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-400">
          Ordre
          <input
            type="number"
            min={0}
            className={inputClass}
            {...register('position', { valueAsNumber: true })}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-stone-400">
        Description
        <input
          className={inputClass}
          placeholder="Builds, conseils, questions…"
          {...register('description')}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
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
        {category && (
          <span className="text-xs text-stone-400">
            {category.threadCount} sujet{category.threadCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {message && (
        <p role="alert" className="text-xs text-flame">
          {message}
        </p>
      )}
    </form>
  );
}
