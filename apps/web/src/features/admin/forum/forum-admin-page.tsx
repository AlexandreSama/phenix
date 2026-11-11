import { FORUM_ROLE_LABELS, type ForumMember, type ForumRoleKey } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Icon } from '../../../components/icon';
import { Badge, type BadgeTone } from '../../../components/ui/badge';
import { inputClass } from '../../../components/ui/field';
import { PageHeader, Panel } from '../../../components/ui/panel';
import { LoadError } from '../../dashboard/query-state';
import {
  forumAdminCategoriesQuery,
  forumMembersQuery,
  forumStaffQuery,
  useCreateForumCategory,
  useDeleteForumCategory,
  useSetForumRole,
  useUpdateForumCategory,
} from './api';
import { CategoryForm } from './category-form';

const ROLES = Object.keys(FORUM_ROLE_LABELS) as ForumRoleKey[];
const ROLE_TONES: Record<ForumRoleKey, BadgeTone> = {
  MEMBER: 'muted',
  MODERATOR: 'gold',
  ADMIN: 'flame',
};

/** Un membre, son rôle actuel, et le menu pour le changer. */
function MemberRow({ member }: { member: ForumMember }) {
  const setRole = useSetForumRole();

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <img src={member.avatarUrl} alt="" className="size-9 shrink-0 rounded-full" />
        <span className="truncate font-medium text-white">{member.username}</span>
        <Badge tone={ROLE_TONES[member.role]}>{FORUM_ROLE_LABELS[member.role]}</Badge>
      </span>
      <div className="w-44">
        <select
          className={inputClass}
          value={member.role}
          disabled={setRole.isPending}
          aria-label={`Rôle de ${member.username}`}
          onChange={(event) =>
            setRole.mutate({ userId: member.id, role: event.target.value as ForumRoleKey })
          }
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {FORUM_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>
      {setRole.error && (
        <p role="alert" className="w-full text-[13px] text-flame">
          {setRole.error.message}
        </p>
      )}
    </li>
  );
}

/** Les catégories du forum, et qui le modère. */
export function ForumAdminPage() {
  const categories = useQuery(forumAdminCategoriesQuery);
  const staff = useQuery(forumStaffQuery);
  const create = useCreateForumCategory();
  const update = useUpdateForumCategory();
  const remove = useDeleteForumCategory();
  const [search, setSearch] = useState('');
  const members = useQuery(forumMembersQuery(search));
  const list = categories.data ?? [];
  const nextPosition = list.length > 0 ? Math.max(...list.map((entry) => entry.position)) + 1 : 0;
  const searching = search.trim().length >= 2;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Forum" description="Les catégories du forum, et l’équipe qui le modère." />

      <Panel
        icon="forum"
        title="Catégories"
        description={
          <>
            L’adresse fait le lien : /forum/<em>adresse</em>. L’ordre range les catégories de
            l’accueil du forum, du plus petit au plus grand.
          </>
        }
        aside={
          categories.data && (
            <span className="text-sm text-stone-400 tabular-nums">
              {list.length} {list.length > 1 ? 'catégories' : 'catégorie'}
            </span>
          )
        }
      >
        {categories.error && (
          <LoadError error={categories.error} onRetry={() => void categories.refetch()} />
        )}
        {categories.isPending && (
          <p role="status" className="text-sm text-stone-400">
            Chargement des catégories…
          </p>
        )}
        <div className="flex flex-col gap-3">
          {list.map((category) => (
            <CategoryForm
              key={category.id}
              category={category}
              onSubmit={(input) => update.mutateAsync({ id: category.id, input })}
              onDelete={() => remove.mutateAsync(category.id)}
            />
          ))}
          <CategoryForm
            key={`new-${nextPosition}`}
            nextPosition={nextPosition}
            onSubmit={(input) => create.mutateAsync(input)}
          />
        </div>
      </Panel>

      <Panel
        icon="shield"
        title="Équipe du forum"
        description="Les modérateurs épinglent, verrouillent et suppriment. Les administrateurs peuvent en plus corriger le message de n’importe qui. Les propriétaires du bot ont tous les droits."
      >
        {staff.error && <LoadError error={staff.error} onRetry={() => void staff.refetch()} />}
        {staff.data?.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-stone-400">
            Personne pour l’instant : cherche un membre ci-dessous pour lui donner un rôle.
          </p>
        )}
        {staff.data && staff.data.length > 0 && (
          <ul aria-label="Équipe" className="-my-3 flex flex-col divide-y divide-white/6">
            {staff.data.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 border-t border-white/6 pt-6">
          <label htmlFor="forum-member-search" className="text-sm font-medium text-stone-100">
            Chercher un membre du site
          </label>
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-stone-400"
            />
            <input
              id="forum-member-search"
              type="search"
              className={`${inputClass} pl-10 [&::-webkit-search-cancel-button]:appearance-none`}
              value={search}
              maxLength={32}
              autoComplete="off"
              placeholder="Son pseudo Discord, deux lettres au moins"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {searching && members.data?.length === 0 && (
            <p className="text-sm text-stone-400">
              Personne de ce nom. Le membre doit s’être connecté au site une fois.
            </p>
          )}
          {searching && members.data && members.data.length > 0 && (
            <ul aria-label="Membres trouvés" className="flex flex-col divide-y divide-white/6">
              {members.data.map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}
