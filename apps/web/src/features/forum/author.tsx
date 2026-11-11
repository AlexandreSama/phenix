import { FORUM_ROLE_LABELS, type ForumAuthor } from '@phenix/shared';

/** L'avatar et le nom d'un auteur, avec son rôle quand il fait partie de l'équipe du forum. */
export function AuthorLine({ author, size = 'size-8' }: { author: ForumAuthor; size?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <img src={author.avatarUrl} alt="" className={`${size} shrink-0 rounded-full`} />
      <span className="truncate font-semibold text-white">{author.username}</span>
      {author.role !== 'MEMBER' && (
        <span className="shrink-0 rounded-full border border-gold px-2 py-0.5 text-xs text-gold">
          {FORUM_ROLE_LABELS[author.role]}
        </span>
      )}
    </span>
  );
}
