import { DASHBOARD_MODULE_LABELS, type GuildDelegate } from '@phenix/shared';
import { useState } from 'react';
import { Icon } from '../../../components/icon';
import { Button } from '../../../components/ui/button';
import { useRemoveDelegate, useSaveDelegate } from '../api';
import { DelegateEditor } from './delegate-editor';

const smallButton =
  'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-gold';

/** Un membre qui a reçu des onglets : les voir, les changer, ou tout lui retirer. */
export function DelegateRow({ guildId, delegate }: { guildId: string; delegate: GuildDelegate }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view');
  const save = useSaveDelegate(guildId);
  const remove = useRemoveDelegate(guildId);

  return (
    <li className="flex flex-col gap-4 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <img src={delegate.avatarUrl} alt="" className="size-10 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-1.5">
          <p className="truncate font-semibold text-white">{delegate.username}</p>
          <ul aria-label={`Onglets de ${delegate.username}`} className="flex flex-wrap gap-1.5">
            {delegate.modules.map((module) => (
              <li
                key={module}
                className="rounded-full bg-white/8 px-2.5 py-0.5 text-xs font-medium text-stone-200"
              >
                {DASHBOARD_MODULE_LABELS[module]}
              </li>
            ))}
          </ul>
        </div>
        {mode === 'view' && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setMode('edit')}
              aria-label={`Modifier les onglets de ${delegate.username}`}
              className={`${smallButton} text-stone-300 hover:bg-white/6 hover:text-white`}
            >
              <Icon name="pencil" className="size-4" />
              Modifier
            </button>
            <button
              type="button"
              onClick={() => setMode('confirm')}
              aria-label={`Retirer l’accès de ${delegate.username}`}
              className={`${smallButton} text-stone-400 hover:bg-ember/15 hover:text-[#ff8a4c]`}
            >
              <Icon name="trash" className="size-4" />
              Retirer
            </button>
          </div>
        )}
      </div>

      {mode === 'edit' && (
        <div className="rounded-xl border border-white/8 bg-ink/40 p-4">
          <DelegateEditor
            name={delegate.username}
            initial={delegate.modules}
            submitLabel="Enregistrer"
            onSubmit={async (modules) => {
              await save.mutateAsync({ userId: delegate.userId, modules });
              setMode('view');
            }}
            onCancel={() => setMode('view')}
          />
        </div>
      )}

      {mode === 'confirm' && (
        <div
          role="group"
          aria-label={`Retirer l’accès de ${delegate.username}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ember/50 bg-ember/10 p-4"
        >
          <p className="text-sm text-stone-200">
            {delegate.username} ne verra plus ce serveur dans son tableau de bord.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMode('view')}
              className="min-h-10"
            >
              Garder
            </Button>
            <Button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate(delegate.userId)}
              className="min-h-10"
            >
              {remove.isPending ? 'Retrait…' : 'Retirer l’accès'}
            </Button>
          </div>
          {remove.error && (
            <p role="alert" className="w-full text-[13px] text-flame">
              {remove.error.message}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
