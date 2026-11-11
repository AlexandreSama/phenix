import { zodResolver } from '@hookform/resolvers/zod';
import { FORUM_LIMITS, forumThreadInputSchema, type ForumThreadInput } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '../../components/ui/button';
import { Field, inputClass } from '../../components/ui/field';
import { forumCategoryQuery, useCreateThread } from './api';
import { MarkdownEditor } from './markdown-editor';

interface FormProps {
  categoryId: number;
  onSubmit: (input: ForumThreadInput) => Promise<unknown>;
}

/** Le formulaire d'un nouveau sujet : un titre, et le premier message. */
export function NewThreadForm({ categoryId, onSubmit }: FormProps) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForumThreadInput>({
    resolver: zodResolver(forumThreadInputSchema),
    defaultValues: { categoryId, title: '', content: '' },
  });

  const submit = async (input: ForumThreadInput) => {
    try {
      await onSubmit(input);
    } catch (err) {
      setError('root.server', { message: err instanceof Error ? err.message : 'Échec' });
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-5">
      <Field id="title" label="Titre" error={errors.title?.message}>
        <input
          id="title"
          className={inputClass}
          maxLength={FORUM_LIMITS.titleMax}
          aria-invalid={errors.title ? true : undefined}
          {...register('title')}
        />
      </Field>
      <Controller
        control={control}
        name="content"
        render={({ field, fieldState }) => (
          <MarkdownEditor
            id="content"
            label="Message"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
            rows={12}
          />
        )}
      />
      {errors.root?.server && (
        <p role="alert" className="text-sm text-flame">
          {errors.root.server.message}
        </p>
      )}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Publication…' : 'Publier le sujet'}
        </Button>
      </div>
    </form>
  );
}

export function NewThreadPage() {
  const { slug } = useParams({ from: '/forum/$slug/nouveau' });
  const { data, error } = useQuery(forumCategoryQuery(slug, 1));
  const create = useCreateThread();
  const navigate = useNavigate();

  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p>Chargement…</p>;

  return (
    <section className="flex flex-col gap-6">
      <nav aria-label="Fil d’Ariane" className="text-sm text-stone-400">
        <Link to="/forum" className="hover:text-white">
          Forum
        </Link>{' '}
        ›{' '}
        <Link to="/forum/$slug" params={{ slug }} className="hover:text-white">
          {data.category.name}
        </Link>{' '}
        › Nouveau sujet
      </nav>
      <h1 className="text-2xl font-bold text-white">Nouveau sujet</h1>
      <NewThreadForm
        categoryId={data.category.id}
        onSubmit={async (input) => {
          const created = await create.mutateAsync(input);
          await navigate({
            to: '/forum/$slug/$threadId',
            params: { slug, threadId: String(created.threadId) },
          });
        }}
      />
    </section>
  );
}
