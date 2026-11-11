import { FORUM_ROLE_LABELS, type ForumMember, type ForumRoleKey } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '../../../components/ui/card';
import { inputClass } from '../../../components/ui/field';
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

/** Un membre et le menu de son rôle. */
function MemberRow({ member }: { member: ForumMember }) {
  const setRole = useSetForumRole();

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <img src={member.avatarUrl} alt="" className="size-7 rounded-full" />
        <span className="truncate text-sm text-white">{member.username}</span>
      </span>
      <label className="flex items-center gap-2 text-xs text-stone-400">
        Rôle
        <select
          className={`${inputClass} w-auto`}
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
      </label>
      {setRole.error && (
        <p role="alert" className="w-full text-xs text-flame">
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

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">Catégories</h2>
        <p className="text-sm text-stone-400">
          L’adresse fait le lien : /forum/<em>adresse</em>. L’ordre range les catégories de
          l’accueil du forum, du plus petit au plus grand.
        </p>
        <Card>
          {categories.error && <p role="alert">{categories.error.message}</p>}
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
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">Équipe du forum</h2>
        <p className="text-sm text-stone-400">
          Les modérateurs épinglent, verrouillent et suppriment. Les administrateurs peuvent en plus
          corriger le message de n’importe qui. Les propriétaires du bot ont tous les droits.
        </p>
        <Card className="flex flex-col gap-4">
          {staff.data?.length === 0 && (
            <p className="text-sm text-stone-400">Personne pour l’instant.</p>
          )}
          {staff.data && staff.data.length > 0 && (
            <ul aria-label="Équipe" className="flex flex-col divide-y divide-brown">
              {staff.data.map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
            </ul>
          )}
          <label className="flex flex-col gap-1 text-xs text-stone-400">
            Chercher un membre du site
            <input
              className={inputClass}
              value={search}
              maxLength={32}
              placeholder="Son pseudo Discord, deux lettres au moins"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {members.data?.length === 0 && (
            <p className="text-sm text-stone-400">
              Personne de ce nom. Le membre doit s’être connecté au site une fois.
            </p>
          )}
          {members.data && members.data.length > 0 && (
            <ul aria-label="Membres trouvés" className="flex flex-col divide-y divide-brown">
              {members.data.map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
