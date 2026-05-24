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

/** Estilo unificado: control + lista desplegable redondeada (como Reportes). */
export const appSelectTriggerClass =
  'w-full min-w-0 rounded-lg border text-sm text-left truncate pl-3 pr-10 py-2.5 ' +
  'bg-white border-slate-300 text-black shadow-sm ' +
  'hover:border-slate-400 hover:bg-slate-50 ' +
  'dark:hover:border-slate-600 ' +
  'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 ' +
  `${appSelectDarkSurfaceClass} ` +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-slate-300';

export const appSelectListClass =
  'z-[200] w-max max-w-[min(100vw-2rem,28rem)] overflow-auto rounded-lg border py-1 shadow-lg ' +
  'bg-white border-slate-200 text-black ' +
  'dark:bg-[#0b2147] dark:border-slate-700 dark:text-[#e7eef9]';

const MENU_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;
const MENU_PREFERRED_MAX_PX = 320;

interface MenuPlacement {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

function computeMenuPlacement(trigger: DOMRect): MenuPlacement {
  const spaceBelow = window.innerHeight - trigger.bottom - VIEWPORT_MARGIN_PX;
  const spaceAbove = trigger.top - VIEWPORT_MARGIN_PX;
  const openUp = spaceBelow < 120 && spaceAbove > spaceBelow;
  const available = openUp ? spaceAbove : spaceBelow;
  const maxHeight = Math.min(
    MENU_PREFERRED_MAX_PX,
    Math.max(available - MENU_GAP_PX, 96)
  );

  return {
    left: trigger.left,
    width: trigger.width,
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
    'w-full px-3 py-2 text-left text-sm leading-snug whitespace-normal break-words disabled:opacity-40 disabled:cursor-not-allowed',
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
      ? 'py-1.5 pr-8 text-xs rounded-lg'
      : size === 'sm'
        ? 'py-2 pr-9 text-sm rounded-lg'
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
    setMenuPlacement(computeMenuPlacement(root.getBoundingClientRect()));
  }, []);

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
    <div ref={rootRef} className={cn('relative min-w-0', className)}>
      <button
        type="button"
        title={title}
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
          <span className="block truncate text-inherit">{selectedLabel}</span>
        ) : (
          <span className="block truncate text-inherit">{emptyText}</span>
        )}
      </button>
      <span
        className={cn(
          'material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 leading-none select-none',
          size === 'xs' ? 'text-[18px]' : 'text-[22px]'
        )}
        aria-hidden
      >
        expand_more
      </span>

      {open && !disabled && menuPlacement
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel ?? title ?? 'Opciones'}
              className={cn(appSelectListClass, listMaxHeight, listClassName)}
              style={{
                position: 'fixed',
                left: menuPlacement.left,
                width: menuPlacement.width,
                minWidth: menuPlacement.width,
                maxHeight: menuPlacement.maxHeight,
                top: menuPlacement.top,
                bottom: menuPlacement.bottom,
              }}
            >
              {visibleListOptions.length === 0 ? (
                <li className={cn('px-3 py-2 text-sm', appSelectOptionTextClass)}>{emptyText}</li>
              ) : (
                visibleListOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <li key={opt.value === '' ? '__empty' : opt.value} role="option" aria-selected={isSelected}>
                      <button
                        type="button"
                        disabled={opt.disabled}
                        className={appSelectOptionClass(isSelected)}
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
