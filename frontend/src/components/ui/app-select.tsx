import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export interface AppSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Superficie modo oscuro unificada (trigger + lista desplegable). */
export const appSelectDarkSurfaceClass =
  'dark:border-slate-700 dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:text-[#e7eef9] dark:shadow-none ' +
  'dark:focus:border-[#4a6fa5] dark:focus:ring-[#4a6fa5]/30';

/** Texto del control cerrado: en movil hasta 3 lineas; en escritorio una linea con ellipsis. */
export const appSelectTriggerLabelClass =
  'min-w-0 flex-1 text-inherit max-lg:whitespace-normal max-lg:break-words max-lg:leading-snug max-lg:line-clamp-3 lg:truncate';

/** Icono del control cerrado (alineado al borde derecho del trigger). */
export const appSelectTriggerChevronClass =
  'material-symbols-outlined ml-auto shrink-0 leading-none text-slate-500 select-none self-start mt-0.5 lg:mt-0 lg:self-center';

/** Estilo unificado: control + lista desplegable redondeada (como Reportes). */
export const appSelectTriggerClass =
  'flex w-full min-w-0 items-start gap-2 rounded-lg border text-sm text-left pl-3 pr-3 py-2.5 lg:items-center ' +
  'bg-white border-slate-300 text-black shadow-sm ' +
  'hover:border-slate-400 hover:bg-slate-50 ' +
  'dark:hover:border-slate-600 ' +
  'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 ' +
  `${appSelectDarkSurfaceClass} ` +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-slate-300';

/** Panel desplegable (AppSelect y autocompletados con la misma convencion). */
export const appDropdownPanelClass =
  'app-dropdown-panel overflow-auto rounded-lg border shadow-lg ' +
  'bg-white border-slate-200 text-black ' +
  'dark:bg-[#0b2147] dark:border-slate-700 dark:text-[#e7eef9]';

export const appSelectListClass = cn('z-[200] py-1', appDropdownPanelClass);

/** Texto de opcion / resultado: permite varias lineas sin cortar con ellipsis. */
export const appDropdownOptionLineClass = 'whitespace-normal break-words leading-snug';

/** Mismo color de texto que el trigger (lista desplegada). */
export const appSelectOptionTextClass = 'text-black dark:text-[#e7eef9]';

export function appSelectOptionClass(selected: boolean): string {
  return cn(
    'w-full px-3 py-2 text-left text-sm disabled:opacity-40 disabled:cursor-not-allowed',
    appDropdownOptionLineClass,
    appSelectOptionTextClass,
    selected ? 'bg-primary/15 font-medium' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'
  );
}

export interface AppSelectProps {
  options: AppSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  triggerClassName?: string;
  listClassName?: string;
  listMaxHeight?: string;
  title?: string;
  'aria-label'?: string;
  /** Muestra opcion vacia seleccionable (ej. "Todas"). */
  allowEmpty?: boolean;
  emptyLabel?: string;
  /**
   * Opcion para quitar un filtro (ej. "Todos los roles").
   * Solo aparece en la lista cuando el valor actual es distinto (ya hay filtro activo).
   */
  clearOption?: AppSelectOption;
  /** Texto del control cuando no hay opciones (si no se define, se usa el placeholder). */
  emptyOptionsText?: string;
  size?: 'md' | 'sm' | 'xs';
  /** Menu del ancho del trigger (año, cantidad, etc.) sin ensancharse a toda la fila en movil. */
  compactMenu?: boolean;
  /** Distribuye las opciones en N columnas (grid) en lugar de lista vertical. */
  columns?: number;
  /** En vez de truncar la etiqueta en desktop, hace wrap (para dialogos). */
  wrapLabel?: boolean;
  /** Muestra un buscador arriba del dropdown para filtrar opciones. */
  searchable?: boolean;
}

function labelForValue(
  options: AppSelectOption[],
  value: string,
  allowEmpty: boolean,
  emptyLabel: string,
  clearOption?: AppSelectOption
): string | null {
  if (clearOption && value === clearOption.value) return clearOption.label;
  if (allowEmpty && value === '') return emptyLabel;
  const hit = options.find((o) => o.value === value);
  return hit?.label ?? null;
}

export function AppSelect({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar',
  disabled = false,
  loading = false,
  className,
  triggerClassName,
  listClassName,
  listMaxHeight = 'max-h-[min(70vh,20rem)]',
  title,
  'aria-label': ariaLabel,
  allowEmpty = false,
  emptyLabel = 'Todas',
  clearOption,
  emptyOptionsText,
  size = 'md',
  compactMenu = false,
  columns,
  wrapLabel = false,
  searchable = false,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const skipOutsideCloseRef = useRef(false);
  const listId = useId();

  const selectedLabel = useMemo(
    () => labelForValue(options, value, allowEmpty, emptyLabel, clearOption),
    [options, value, allowEmpty, emptyLabel, clearOption]
  );

  const sizeTrigger =
    size === 'xs'
      ? 'py-1.5 text-xs rounded-lg'
      : size === 'sm'
        ? 'py-2 text-sm rounded-lg'
        : '';

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    const handleCloseCondition = (e: Event) => {
      const target = e.target as HTMLElement;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };

    // Clics, toques y cambios de foco (crucial contra el Focus Trap de Radix UI)
    document.addEventListener('mousedown', handleCloseCondition);
    document.addEventListener('touchstart', handleCloseCondition);
    document.addEventListener('focusin', handleCloseCondition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', handleCloseCondition);
      document.removeEventListener('touchstart', handleCloseCondition);
      document.removeEventListener('focusin', handleCloseCondition);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const emptyText = loading
    ? 'Cargando...'
    : options.length === 0
      ? (emptyOptionsText ?? placeholder)
      : placeholder;

  const listOptions: AppSelectOption[] = useMemo(() => {
    let base = options;
    if (clearOption) {
      base = base.filter((o) => o.value !== clearOption.value);
    }
    if (allowEmpty) {
      const rest = base.filter((o) => o.value !== '' && o.label !== emptyLabel);
      base = [{ value: '', label: emptyLabel }, ...rest];
    }
    if (clearOption && value !== clearOption.value) {
      return [clearOption, ...base];
    }
    return base;
  }, [allowEmpty, emptyLabel, clearOption, options, value]);

  const visibleListOptions = useMemo(() => {
    let items = listOptions;
    if (open && allowEmpty && value === '') {
      items = items.filter((o) => o.value !== '');
    }
    if (searchable && searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      items = items.filter((o) => o.label.toLowerCase().includes(q));
    }
    return items;
  }, [open, allowEmpty, value, listOptions, searchable, searchText]);

  const renderDropdown = (className: string, style?: CSSProperties) => (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={ariaLabel ?? title ?? 'Opciones'}
      className={cn(appSelectListClass, listMaxHeight, className, listClassName)}
      style={style}
    >
      {searchable ? (
        <li className="sticky top-0 z-10 bg-white dark:bg-[#0b2147] border-b border-slate-200 dark:border-slate-700">
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Buscar..."
            className="w-full px-3 py-2 text-sm bg-transparent border-0 outline-none text-black dark:text-[#e7eef9] placeholder-slate-400"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            autoFocus
          />
        </li>
      ) : null}
      {visibleListOptions.length === 0 ? (
        <li className={cn('px-3 py-2 text-sm', appDropdownOptionLineClass, appSelectOptionTextClass)}>
          {emptyText}
        </li>
      ) : (
        visibleListOptions.map((opt) => {
          const isSelected = opt.value === value;
          return (
            <li key={opt.value === '' ? '__empty' : opt.value} role="option" aria-selected={isSelected}>
              <button
                type="button"
                disabled={opt.disabled}
                className={cn(
                  appSelectOptionClass(isSelected),
                  (compactMenu || columns) && 'px-2.5 py-1.5 text-center text-sm'
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (opt.disabled) return;
                  skipOutsideCloseRef.current = true;
                  onChange(opt.value);
                  setSearchText('');
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          );
        })
      )}
    </ul>
  );

  const inDialog = rootRef.current?.closest('[role="dialog"]') != null;

  return (
    <div ref={rootRef} className={cn('relative w-full max-w-full min-w-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        title={title ?? selectedLabel ?? undefined}
        disabled={disabled}
        aria-label={ariaLabel ?? title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={(e) => {
          if (disabled) return;
          e.stopPropagation();
          if (open) setSearchText('');
          setOpen((v) => !v);
        }}
        className={cn(
          appSelectTriggerClass,
          sizeTrigger,
          !disabled && 'cursor-pointer',
          open && 'border-primary ring-1 ring-primary/30 dark:border-[#4a6fa5] dark:ring-[#4a6fa5]/30',
          triggerClassName
        )}
      >
        {selectedLabel ? (
          <span className={wrapLabel ? 'min-w-0 flex-1 text-inherit whitespace-normal break-words leading-snug' : appSelectTriggerLabelClass}>{selectedLabel}</span>
        ) : (
          <span className={wrapLabel ? 'min-w-0 flex-1 text-inherit whitespace-normal break-words leading-snug' : appSelectTriggerLabelClass}>{emptyText}</span>
        )}
        <span
          className={cn(appSelectTriggerChevronClass, size === 'xs' ? 'text-[18px]' : 'text-[22px]')}
          aria-hidden
        >
          expand_more
        </span>
      </button>

      {open && !disabled && dropdownStyle ? (
        inDialog ? (
          renderDropdown(
            cn('absolute left-0 top-full z-[200] mt-1', compactMenu ? 'w-auto' : 'w-full', 'max-w-[calc(100vw-2rem)]'),
            columns ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '1px' } : undefined
          )
        ) : (
          createPortal(
            renderDropdown(
              cn('fixed z-[200]', columns && 'p-1', compactMenu && 'py-0.5 shadow-md'),
              {
                top: dropdownStyle.top,
                left: dropdownStyle.left,
                width: compactMenu ? 'auto' : dropdownStyle.width,
                maxWidth: 'calc(100vw - 2rem)',
                ...(columns ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '1px' } : {}),
              }
            ),
            document.body
          )
        )
      ) : null}
    </div>
  );
}
