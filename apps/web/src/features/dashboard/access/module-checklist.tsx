import {
  DASHBOARD_MODULE_LABELS,
  DASHBOARD_MODULES,
  type DashboardModuleKey,
} from '@phenix/shared';
import { Icon } from '../../../components/icon';
import { GUILD_TABS } from '../guild-tabs';

interface Props {
  /** Pour relier les cases à leur légende : un id unique par liste affichée */
  idPrefix: string;
  value: DashboardModuleKey[];
  onChange: (modules: DashboardModuleKey[]) => void;
  disabled?: boolean;
}

const iconOf = (module: DashboardModuleKey) =>
  GUILD_TABS.find((tab) => tab.module === module)?.icon ?? 'sliders';

/** Les onglets à cocher, avec l'icône de la navigation : on voit tout de suite ce qu'on ouvre. */
export function ModuleChecklist({ idPrefix, value, onChange, disabled }: Props) {
  const toggle = (module: DashboardModuleKey, checked: boolean) =>
    // Dans l'ordre des onglets, quel que soit l'ordre des clics
    onChange(
      DASHBOARD_MODULES.filter((entry) => (entry === module ? checked : value.includes(entry))),
    );

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {DASHBOARD_MODULES.map((module) => {
        const id = `${idPrefix}-${module}`;
        return (
          <label
            key={module}
            htmlFor={id}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-white/8 px-3 py-2 text-sm transition hover:border-white/20 has-checked:border-flame/50 has-checked:bg-flame/8 has-disabled:cursor-default has-disabled:opacity-60"
          >
            <input
              id={id}
              type="checkbox"
              className="size-4 accent-flame"
              checked={value.includes(module)}
              disabled={disabled}
              onChange={(event) => toggle(module, event.target.checked)}
            />
            <Icon name={iconOf(module)} className="size-4 text-stone-400" />
            <span className="truncate text-stone-100">{DASHBOARD_MODULE_LABELS[module]}</span>
          </label>
        );
      })}
    </div>
  );
}
