import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog';
import { AppSelect } from './app-select';

export interface EditFormField {
  key: string;
  label: string;
  defaultValue?: string;
  type?: 'text' | 'number' | 'date';
  required?: boolean;
  placeholder?: string;
  /** Si está definido, se muestra un desplegable (`AppSelect`) en lugar de un input de texto. */
  options?: { value: string; label: string }[];
}

interface EditItemDialogProps {
  open: boolean;
  title: string;
  fields: EditFormField[];
  onCancel: () => void;
  onSave: (values: Record<string, string>) => void | Promise<void>;
  loading?: boolean;
  /** Límites min/max para inputs type=date (p. ej. según año y mes del módulo). */
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

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      for (const field of fields) {
        initial[field.key] = field.defaultValue ?? '';
      }
      setValues(initial);
    }
  }, [open, fields]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(values);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="mt-2 flex flex-col gap-4">
          {fields.map((field) => {
            const dateBounds = field.type === 'date' && resolveDateBounds ? resolveDateBounds(values) : null;
            const fechaFinMin =
              field.key === 'fechaFin' && values.fechaInicio && dateBounds
                ? values.fechaInicio >= dateBounds.min
                  ? values.fechaInicio
                  : dateBounds.min
                : dateBounds?.min;

            return (
            <label key={field.key} className="flex flex-col gap-1 text-sm text-[#9fb3d4]">
              <span>{field.label}{field.required ? <span className="text-rose-400"> *</span> : null}</span>
              {field.options && field.options.length > 0 ? (
                <AppSelect
                  options={field.options}
                  value={values[field.key] ?? ''}
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
                  triggerClassName="bg-white border border-slate-300 text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
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
                  className="px-3 py-2 rounded-lg bg-[#132a52] border border-[#223c49] text-[#f0f4f8] text-sm focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
              )}
            </label>
            );
          })}
          <DialogFooter className="mt-2 flex flex-row justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="btn-modern btn-modern-ghost"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-modern btn-modern-primary"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
