import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

/** Texto del control cerrado: en móvil hasta 3 líneas; en escritorio una línea con ellipsis. */
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

/** Panel desplegable (AppSelect y autocompletados con la misma convención). */
export const appDropdownPanelClass =
  'app-dropdown-panel overflow-auto rounded-lg border shadow-lg ' +
  'bg-white border-slate-200 text-black ' +
  'dark:bg-[#0b2147] dark:border-slate-700 dark:text-[#e7eef9]';

export const appSelectListClass = cn('z-[200] py-1', appDropdownPanelClass);

/** Texto de opción / resultado: permite varias líneas sin cortar con ellipsis. */
export const appDropdownOptionLineClass = 'whitespace-normal break-words leading-snug';

const MENU_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;
const MENU_PREFERRED_MAX_PX = 320;
const OPTION_HORIZONTAL_PADDING_PX = 40;

function minWidthForLabels(labels: string[], fontSizePx = 14): number {
  if (labels.length === 0) return 0;
  const charWidth = fontSizePx * 0.52;
  const longestLen = Math.max(...labels.map((l) => l.length));
  return Math.ceil(longestLen * charWidth) + OPTION_HORIZONTAL_PADDING_PX;
}

interface MenuPlacement {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

function computeMenuPlacement(
  trigger: DOMRect,
  optionLabels: string[] = [],
  wrapOptions = true,
  compactMenu = false
): MenuPlacement {
  const spaceBelow = window.innerHeight - trigger.bottom - VIEWPORT_MARGIN_PX;
  const spaceAbove = trigger.top - VIEWPORT_MARGIN_PX;
  const openUp = spaceBelow < 120 && spaceAbove > spaceBelow;
  const available = openUp ? spaceAbove : spaceBelow;
  const maxHeight = Math.min(
    MENU_PREFERRED_MAX_PX,
    Math.max(available - MENU_GAP_PX, 96)
  );
  const viewportMax = window.innerWidth - VIEWPORT_MARGIN_PX * 2;
  const width = compactMenu
    ? Math.min(Math.max(trigger.width, 64), viewportMax)
    : wrapOptions
      ? Math.min(Math.max(trigger.width, 160), viewportMax)
      : Math.min(Math.max(trigger.width, minWidthForLabels(optionLabels)), viewportMax);
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN_PX, trigger.left),
    window.innerWidth - width - VIEWPORT_MARGIN_PX
  );

  return {
    left,
    width,
    maxHeight,
    ...(openUp
      ? { bottom: window.innerHeight - trigger.top + MENU_GAP_PX }
      : { top: trigger.bottom + MENU_GAP_PX }),
  };
}

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
  /** Muestra opción vacía seleccionable (ej. "Todas"). */
  allowEmpty?: boolean;
  emptyLabel?: string;
  /**
   * Opción para quitar un filtro (ej. "Todos los roles").
   * Solo aparece en la lista cuando el valor actual es distinto (ya hay filtro activo).
   */
  clearOption?: AppSelectOption;
  /** Texto del control cuando no hay opciones (si no se define, se usa el placeholder). */
  emptyOptionsText?: string;
  size?: 'md' | 'sm' | 'xs';
  /** Menú del ancho del trigger (año, cantidad, etc.) sin ensancharse a toda la fila en móvil. */
  compactMenu?: boolean;
  /** Distribuye las opciones en N columnas (grid) en lugar de lista vertical. */
  columns?: number;
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
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<MenuPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /** Evita que el pointerdown de la misma selección vuelva a abrir o deje el menú abierto. */
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
    let removeOutside: (() => void) | undefined;
    // Registrar después del click que abrió el menú (evita doble clic en otros desplegables).
    const timer = window.setTimeout(() => {
      const onPointerDown = (e: PointerEvent) => {
        if (skipOutsideCloseRef.current) {
          skipOutsideCloseRef.current = false;
          return;
        }
        const target = e.target as Node;
        if (rootRef.current?.contains(target) || listRef.current?.contains(target)) {
          return;
        }
        setOpen(false);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
      };
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKey);
      removeOutside = () => {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('keydown', onKey);
      };
    }, 0);
    return () => {
      window.clearTimeout(timer);
      removeOutside?.();
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

  /** Con allowEmpty: al abrir sin selección, no repetir la opción vacía en la lista. */
  const visibleListOptions = useMemo(() => {
    if (open && allowEmpty && value === '') {
      return listOptions.filter((o) => o.value !== '');
    }
    return listOptions;
  }, [open, allowEmpty, value, listOptions]);

  const updateMenuPlacement = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const labels = visibleListOptions.map((o) => o.label);
    setMenuPlacement(computeMenuPlacement(root.getBoundingClientRect(), labels, true, compactMenu));
  }, [visibleListOptions, compactMenu]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPlacement(null);
      return;
    }
    updateMenuPlacement();
    window.addEventListener('resize', updateMenuPlacement);
    window.addEventListener('scroll', updateMenuPlacement, true);
    return () => {
      window.removeEventListener('resize', updateMenuPlacement);
      window.removeEventListener('scroll', updateMenuPlacement, true);
    };
  }, [open, updateMenuPlacement, visibleListOptions.length]);

  return (
    <div ref={rootRef} className={cn('relative w-full max-w-full min-w-0', className)}>
      <button
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
          <span className={appSelectTriggerLabelClass}>{selectedLabel}</span>
        ) : (
          <span className={appSelectTriggerLabelClass}>{emptyText}</span>
        )}
        <span
          className={cn(appSelectTriggerChevronClass, size === 'xs' ? 'text-[18px]' : 'text-[22px]')}
          aria-hidden
        >
          expand_more
        </span>
      </button>

      {open && !disabled && menuPlacement
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel ?? title ?? 'Opciones'}
              className={cn(
                appSelectListClass,
                listMaxHeight,
                !columns && compactMenu && 'py-0.5 shadow-md',
                columns && 'p-1',
                listClassName
              )}
              style={{
                position: 'fixed',
                left: menuPlacement.left,
                width: columns ? Math.max(menuPlacement.width, columns * 64 + 16) : menuPlacement.width,
                minWidth: compactMenu && !columns ? undefined : menuPlacement.width,
                maxWidth: columns ? Math.max(menuPlacement.width, columns * 64 + 16) : (compactMenu ? menuPlacement.width : 'min(100vw - 2rem, 28rem)'),
                maxHeight: menuPlacement.maxHeight,
                top: menuPlacement.top,
                bottom: menuPlacement.bottom,
                ...(columns ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '1px' } : {}),
              }}
            >
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
                          setOpen(false);
                        }}
                      >
                        {opt.label}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
}
