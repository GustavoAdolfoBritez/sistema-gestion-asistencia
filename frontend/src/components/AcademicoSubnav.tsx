import { NavLink } from 'react-router-dom';

const tabBase =
  'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold dark:font-medium rounded-lg border whitespace-nowrap ';
const tabInactive =
  'border-slate-300 text-slate-900 hover:text-black hover:border-slate-400 bg-white/60 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white dark:hover:border-slate-500 dark:bg-slate-900/30';
const tabActive = 'border-primary/80 text-primary dark:text-[#e7eef9] bg-primary/10 dark:bg-primary/15';

export function AcademicoSubnav() {
  return (
    <nav className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 max-md:scrollbar-hide md:overflow-visible" aria-label="Secciones académicas">
      <NavLink
        to="/app/academico"
        end
        className={({ isActive }) => `${tabBase} ${isActive ? tabActive : tabInactive}`}
      >
        <span className="material-symbols-outlined text-base max-md:hidden">auto_stories</span>
        Períodos y cursos
      </NavLink>
      <NavLink
        to="/app/academico/promocion"
        className={({ isActive }) => `${tabBase} ${isActive ? tabActive : tabInactive}`}
      >
        <span className="material-symbols-outlined text-base max-md:hidden">upgrade</span>
        Promoción de semestre
      </NavLink>
    </nav>
  );
}
