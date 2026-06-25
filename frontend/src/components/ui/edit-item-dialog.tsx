import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog';
import { AppSelect } from './app-select';
import { toast } from '../../utils/toast';

export interface EditFormField {
  key: string;
  label: string;
  defaultValue?: string;
  type?: 'text' | 'number' | 'date';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  columns?: number;
}

interface EditItemDialogProps {
  open: boolean;
  title: string;
  fields: EditFormField[];
  onCancel: () => void;
  onSave: (values: Record<string, string>) => void | Promise<void>;
  loading?: boolean;
  resolveDateBounds?: (values: Record<string, string>) => { min: string; max: string } | null;
}

function fechasFueraDeRango(
  values: Record<string, string>,
  bounds: { min: string; max: string } | null
): Record<string, string> {
  if (!bounds) return values;
  const next = { ...values };
  for (const key of ['fechaInicio', 'fechaFin'] as const) {
    const v = next[key];
    if (v && (v < bounds.min || v > bounds.max)) next[key] = '';
  }
  if (next.fechaInicio && next.fechaFin && next.fechaFin < next.fechaInicio) {
    next.fechaFin = '';
  }
  return next;
}

export function EditItemDialog({
  open,
  title,
  fields,
  onCancel,
  onSave,
  loading = false,
  resolveDateBounds,
}: EditItemDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const prevOpenRef = useRef(false);
  const isFirstRenderAfterOpen = open && !prevOpenRef.current;

  const fieldsKey = useMemo(
    () => fields.map((f) => `${f.key}=${f.defaultValue ?? ''}`).join('|'),
    [fields]
  );

  useLayoutEffect(() => {
    if (isFirstRenderAfterOpen) {
      const initial: Record<string, string> = {};
      for (const field of fields) {
        initial[field.key] = field.defaultValue ?? '';
      }
      setValues(initial);
    }

    if (!open && prevOpenRef.current) {
      setValues({});
    }

    prevOpenRef.current = open;
  }, [open, fieldsKey]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      let changed = false;
      for (const field of fields) {
        if ((values[field.key] ?? '') !== (field.defaultValue ?? '')) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        toast.error('No realizaste ningun cambio.');
        return;
      }
      await onSave(values);
    },
    [fields, onSave, values]
  );

  const fieldNodes = fields.map((field) => {
    const dateBounds = field.type === 'date' && resolveDateBounds ? resolveDateBounds(values) : null;
    const fechaFinMin =
      field.key === 'fechaFin' && values.fechaInicio && dateBounds
        ? values.fechaInicio >= dateBounds.min
          ? values.fechaInicio
          : dateBounds.min
        : dateBounds?.min;

    return (
      <label
        key={field.key}
        className="flex flex-col gap-1 text-sm text-[#9fb3d4] max-lg:min-w-0 max-lg:w-full min-w-0"
      >
        <span>
          {field.label}
          {field.required ? <span className="text-rose-400"> *</span> : null}
        </span>
        {field.options && field.options.length > 0 ? (
          <AppSelect
            className="max-lg:w-full"
            options={field.options}
            value={values[field.key] ?? ''}
            columns={field.columns}
            onChange={(v) => {
              setValues((prev) => {
                const next = { ...prev, [field.key]: v };
                if (field.key === 'anio' || field.key === 'mes') {
                  return fechasFueraDeRango(next, resolveDateBounds?.(next) ?? null);
                }
                return next;
              });
            }}
            placeholder={field.placeholder ?? 'Seleccionar'}
            triggerClassName="bg-white border border-slate-300 text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9] break-words"
          />
        ) : (
          <input
            type={field.type ?? 'text'}
            value={values[field.key] ?? ''}
            required={field.required}
            placeholder={field.placeholder}
            disabled={field.type === 'date' && !dateBounds}
            min={field.type === 'date' ? (field.key === 'fechaFin' ? fechaFinMin : dateBounds?.min) : undefined}
            max={field.type === 'date' ? dateBounds?.max : undefined}
            onChange={(e) => {
              setValues((prev) => {
                let next = { ...prev, [field.key]: e.target.value };
                if (field.key === 'fechaInicio' && next.fechaFin && e.target.value && next.fechaFin < e.target.value) {
                  next.fechaFin = '';
                }
                if (field.key === 'anio' || field.key === 'mes') {
                  next = fechasFueraDeRango(next, resolveDateBounds?.(next) ?? null);
                }
                return next;
              });
            }}
            className="px-3 py-2 rounded-lg bg-[#132a52] border border-[#223c49] text-[#f0f4f8] text-sm focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed max-lg:w-full max-lg:min-w-0"
          />
        )}
      </label>
    );
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          if (document.querySelector('.app-dropdown-panel')) return;
          onCancel();
        }
      }}
    >
      <DialogContent
        onInteractOutside={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('.app-dropdown-panel')) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('.app-dropdown-panel')) {
            event.preventDefault();
          }
        }}
        className="max-w-md flex flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 pr-12 dark:border-slate-700/80 lg:border-0 lg:px-0 lg:py-0 lg:pr-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="flex min-h-0 flex-1 flex-col overflow-hidden lg:mt-2 lg:gap-4"
        >
          <div className="scroll-region flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 lg:px-0 lg:py-0">
            {fieldNodes}
          </div>
          <DialogFooter className="btn-mobile-stack shrink-0 flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700/80 dark:bg-[#172d58] lg:flex-row lg:justify-end lg:gap-3 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="btn-modern btn-modern-ghost max-lg:w-full"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-modern btn-modern-primary max-lg:w-full"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
