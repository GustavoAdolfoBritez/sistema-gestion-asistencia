import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { AppSelect } from '../components/ui/app-select';
import { generarYAbrirPdf, apiFetch } from '../utils/api';
import { etiquetasRoles } from '../utils/role-labels';

interface Props {
  onLogout?: () => void;
}

interface EventoAuditoria {
  id: number;
  fecha_hora: string;
  actor_usuario_id: string | null;
  actor_nombre_completo: string | null;
  actor_email: string | null;
  actor_username: string | null;
  actor_roles: string[];
  modulo: string;
  accion: string;
  recurso_tipo: string | null;
  recurso_id: string | null;
  recurso_resumen?: string | null;
  resultado: 'ok' | 'error';
  ip: string | null;
  user_agent: string | null;
  detalle: unknown;
  antes: unknown;
  despues: unknown;
}

interface ApiList<T> {
  total: number;
  datos: T[];
}

const RESULTADOS: Array<'ok' | 'error'> = ['ok', 'error'];
const MODULOS_SUGERIDOS = ['auth', 'usuarios', 'asistencias', 'reportes', 'importaciones', 'academico'];
const ACCIONES_SUGERIDAS_POR_MODULO: Record<string, string[]> = {
  auth: ['login', 'logout'],
  usuarios: ['crear_usuario', 'actualizar_usuario', 'actualizar_estado_usuario', 'actualizar_roles_usuario', 'reset_password_usuario', 'eliminar_usuario'],
  asistencias: ['crear_sesion', 'cerrar_sesion', 'registrar_asistencia', 'marcar_todos_presentes', 'registrar_justificacion', 'resolver_justificacion'],
  reportes: [
    'actualizar_alerta',
    'recalcular_estadistica',
    'crear_acta',
    'cierre_mensual',
    'generar_informe_alumno_pdf',
    'generar_consolidado_riesgo_pdf',
    'generar_estadisticas_ausentismo_pdf',
  ],
};

type RangoRapido = '' | 'ultimos_7_dias' | 'este_mes' | 'este_anio';

const ZONA_AUDITORIA = 'America/Asuncion';

function toInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function obtenerTexto(valor: unknown): string {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : '';
}

function tieneContenidoTecnico(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === 'string') return valor.trim().length > 0;
  if (typeof valor === 'number' || typeof valor === 'boolean') return true;
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === 'object') return Object.keys(valor as Record<string, unknown>).length > 0;
  return false;
}

function formatearEtiqueta(valor: string): string {
  return valor
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function etiquetaAccion(valor: string): string {
  if (valor === 'crear_acta') return 'Crear Acta (PDF Legal/Habilitados)';
  if (valor === 'generar_informe_alumno_pdf') return 'Generar Informe Alumno PDF';
  if (valor === 'generar_consolidado_riesgo_pdf') return 'Generar Consolidado Riesgo PDF';
  if (valor === 'generar_estadisticas_ausentismo_pdf') return 'Generar Estadísticas Ausentismo PDF';
  if (valor === 'promocionar_semestre_curricular') return 'Promoción semestre curricular (por carrera)';
  if (valor === 'promocionar_semestre_curricular_masivo_facultad') return 'Promoción semestre curricular (masiva por facultad)';
  return formatearEtiqueta(valor);
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function obtenerActor(evento: EventoAuditoria): string {
  const partes = parsearActor(evento);
  if (partes.detalle) return `${partes.nombre} (${partes.detalle})`;
  return partes.nombre;
}

function parsearActor(evento: EventoAuditoria): { nombre: string; detalle?: string } {
  const nombreCompleto = obtenerTexto(evento.actor_nombre_completo);
  const correo = obtenerTexto(evento.actor_email);
  const usuario = obtenerTexto(evento.actor_username);

  if (nombreCompleto && correo) return { nombre: nombreCompleto, detalle: correo };
  if (nombreCompleto && usuario) return { nombre: nombreCompleto, detalle: usuario };
  if (nombreCompleto) return { nombre: nombreCompleto };
  if (correo) return { nombre: correo };
  if (usuario) return { nombre: usuario };
  return { nombre: 'Sistema' };
}

function iconoModuloAuditoria(modulo: string): { icono: string; tono: string } {
  const m = modulo.toLowerCase();
  if (m === 'auth') {
    return {
      icono: 'login',
      tono: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    };
  }
  if (m === 'usuarios') {
    return {
      icono: 'group',
      tono: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    };
  }
  if (m === 'asistencias') {
    return {
      icono: 'fact_check',
      tono: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    };
  }
  if (m === 'reportes') {
    return {
      icono: 'summarize',
      tono: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    };
  }
  if (m === 'importaciones') {
    return {
      icono: 'upload_file',
      tono: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
    };
  }
  if (m === 'academico') {
    return {
      icono: 'school',
      tono: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    };
  }
  return {
    icono: 'history',
    tono: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  };
}

function formatearFechaHoraAuditoria(fechaISO: string): { fecha: string; hora: string } {
  const fecha = new Date(fechaISO);
  if (Number.isNaN(fecha.getTime())) return { fecha: '-', hora: '' };
  const fechaTxt = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_AUDITORIA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fecha);
  const horaTxt = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_AUDITORIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
  return { fecha: fechaTxt, hora: horaTxt };
}

function obtenerUsuarioObjetivo(evento: EventoAuditoria): string {
  const fuentes = [evento.despues, evento.antes];
  for (const fuente of fuentes) {
    if (!esObjeto(fuente)) continue;
    const nombres = obtenerTexto(fuente.nombres);
    const apellidos = obtenerTexto(fuente.apellidos);
    const email = obtenerTexto(fuente.email);
    const id = obtenerTexto(fuente.id);
    if (nombres || apellidos) {
      return `${nombres} ${apellidos}`.trim();
    }
    if (email) return email;
    if (id) return `usuario #${id}`;
  }

  if (evento.recurso_id) return `${evento.recurso_tipo ?? 'recurso'} #${evento.recurso_id}`;
  return evento.recurso_tipo ?? 'recurso';
}

function formatearRecurso(evento: EventoAuditoria): string {
  if (evento.recurso_resumen && evento.recurso_resumen.trim().length > 0) {
    return evento.recurso_resumen;
  }
  const tipo = (evento.recurso_tipo ?? '-').toLowerCase();
  const recursoId = evento.recurso_id ? `#${evento.recurso_id}` : '';
  if (tipo === 'sesion' && ['login', 'logout', 'refresh_token'].includes(evento.accion)) {
    return `usuario ${recursoId}`.trim();
  }
  return `${evento.recurso_tipo ?? '-'} ${recursoId}`.trim();
}

function obtenerRolesDesde(valor: unknown): string[] {
  if (!esObjeto(valor)) return [];
  const roles = valor.roles;
  if (!Array.isArray(roles)) return [];
  return roles.filter((rol): rol is string => typeof rol === 'string' && rol.trim().length > 0);
}

function formatearRoles(roles: string[]): string {
  const visibles = etiquetasRoles(roles);
  return visibles.length ? visibles.join(', ') : '(sin roles)';
}

function formatearFechaLarga(fechaISO: string): string {
  const fecha = new Date(fechaISO);
  if (Number.isNaN(fecha.getTime())) return '-';
  const fechaTxt = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_AUDITORIA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fecha);
  const horaTxt = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_AUDITORIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
  return `${fechaTxt}, ${horaTxt}`;
}

function claseBadgeResultadoAuditoria(resultado: 'ok' | 'error'): string {
  if (resultado === 'ok') {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-transparent dark:bg-emerald-600/25 dark:text-emerald-200';
  }
  return 'border border-rose-200 bg-rose-50 text-rose-800 dark:border-transparent dark:bg-rose-600/25 dark:text-rose-200';
}

function DetalleCampoMovil({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="border-b border-slate-200/90 px-4 py-3 last:border-b-0 dark:border-slate-700/70">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{etiqueta}</p>
      <div className="mt-1.5 text-sm leading-relaxed text-slate-800 dark:text-slate-100">{valor}</div>
    </div>
  );
}

function DetalleEventoEncabezadoMovil({ evento }: { evento: EventoAuditoria }) {
  const actor = parsearActor(evento);
  const { icono, tono } = iconoModuloAuditoria(evento.modulo);
  const { fecha, hora } = formatearFechaHoraAuditoria(evento.fecha_hora);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50/60 p-4 shadow-sm dark:border-slate-700 dark:from-[#152d55] dark:via-[#132a52] dark:to-[#0f2244]">
      <div className="flex items-start gap-3">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tono}`}>
          <span className="material-symbols-outlined text-[28px]">{icono}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 break-words text-lg font-bold leading-tight text-slate-900 dark:text-white">
              {etiquetaAccion(evento.accion)}
            </h3>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${claseBadgeResultadoAuditoria(evento.resultado)}`}
            >
              {evento.resultado}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{actor.nombre}</p>
          {actor.detalle ? (
            <p className="break-all text-xs text-slate-500 dark:text-slate-400">{actor.detalle}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm dark:bg-slate-900/50 dark:text-slate-300">
          {formatearEtiqueta(evento.modulo)}
        </span>
        <span className="rounded-lg bg-white/80 px-2.5 py-1 text-[11px] tabular-nums text-slate-600 shadow-sm dark:bg-slate-900/50 dark:text-slate-300">
          {fecha}
          {hora ? ` · ${hora}` : ''}
        </span>
      </div>
    </div>
  );
}

function EventoAuditoriaTarjetaMovil({
  evento,
  onSeleccionar,
  seleccionado = false,
}: {
  evento: EventoAuditoria;
  onSeleccionar: () => void;
  seleccionado?: boolean;
}) {
  const actor = parsearActor(evento);
  const { icono, tono } = iconoModuloAuditoria(evento.modulo);
  const { fecha, hora } = formatearFechaHoraAuditoria(evento.fecha_hora);

  return (
    <li>
      <button
        type="button"
        onClick={onSeleccionar}
        className={`group w-full rounded-2xl border bg-gradient-to-br from-white via-white to-slate-50 p-3.5 text-left shadow-sm transition-all active:scale-[0.99] hover:border-sky-200/80 hover:shadow-md dark:from-[#152d55] dark:via-[#132a52] dark:to-[#0f2244] dark:hover:border-sky-500/30 ${
          seleccionado
            ? 'border-sky-400 ring-2 ring-sky-400/35 dark:border-sky-500/60'
            : 'border-slate-200/90 dark:border-slate-700/80'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-inner ${tono}`}
            aria-hidden
          >
            <span className="material-symbols-outlined text-[24px]">{icono}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words text-[15px] font-bold leading-tight text-slate-900 dark:text-white">
                {etiquetaAccion(evento.accion)}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${claseBadgeResultadoAuditoria(evento.resultado)}`}
              >
                {evento.resultado}
              </span>
            </div>
            <p className="mt-1 break-words text-sm font-medium text-slate-800 dark:text-slate-200">{actor.nombre}</p>
            {actor.detalle ? (
              <p className="break-all text-xs text-slate-500 dark:text-slate-400">{actor.detalle}</p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                {formatearEtiqueta(evento.modulo)}
              </span>
              <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                {fecha}
                {hora ? ` · ${hora}` : ''}
              </span>
            </div>
          </div>
          <span
            className="material-symbols-outlined mt-1 shrink-0 text-[20px] text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-500 dark:text-slate-600 dark:group-hover:text-sky-400"
            aria-hidden
          >
            chevron_right
          </span>
        </div>
      </button>
    </li>
  );
}

function construirResumenCambio(evento: EventoAuditoria): string {
  const objetivo = obtenerUsuarioObjetivo(evento);
  const detalle = esObjeto(evento.detalle) ? evento.detalle : {};

  if (evento.accion === 'actualizar_roles_usuario') {
    const rolesAnteriores = obtenerRolesDesde(evento.antes);
    const rolesNuevos = obtenerRolesDesde(evento.despues);
    return `Se cambiaron los roles de ${objetivo} de ${formatearRoles(rolesAnteriores)} a ${formatearRoles(rolesNuevos)}.`;
  }

  if (evento.accion === 'actualizar_estado_usuario') {
    const estadoAnterior = esObjeto(evento.antes) ? obtenerTexto(evento.antes.estado) : '';
    const estadoNuevo = esObjeto(evento.despues) ? obtenerTexto(evento.despues.estado) : '';
    if (estadoAnterior || estadoNuevo) {
      return `Se cambió el estado de ${objetivo} de ${estadoAnterior || '(sin estado)'} a ${estadoNuevo || '(sin estado)'}.`;
    }
  }

  if (evento.accion === 'crear_usuario') {
    return `Se creó el usuario ${objetivo}.`;
  }

  if (evento.accion === 'actualizar_usuario') {
    const campos = Array.isArray(detalle.campos) ? detalle.campos.filter((c): c is string => typeof c === 'string') : [];
    if (campos.length) {
      return `Se actualizaron los campos ${campos.join(', ')} de ${objetivo}.`;
    }
    return `Se actualizó la información de ${objetivo}.`;
  }

  if (evento.accion === 'reset_password_usuario') {
    return `Se reseteó la contraseña de ${objetivo}.`;
  }

  if (evento.accion === 'eliminar_usuario') {
    return `Se eliminó el usuario ${objetivo}.`;
  }

  if (evento.accion === 'login') {
    return `Se inició sesión correctamente.`;
  }

  if (evento.accion === 'logout') {
    return `Se cerró sesión.`;
  }

  if (evento.accion === 'refresh_token') {
    return `Se renovó el token de acceso.`;
  }

  if (evento.accion === 'promocionar_semestre_curricular') {
    const carrera = typeof detalle.carrera === 'string' ? detalle.carrera : null;
    const semOrigen = detalle.semestreOrigen != null ? Number(detalle.semestreOrigen) : null;
    const semDestino = detalle.semestreDestino != null ? Number(detalle.semestreDestino) : null;
    const actualizados = detalle.actualizados != null ? Number(detalle.actualizados) : null;
    const partes: string[] = [];
    if (carrera) partes.push(`Carrera: ${carrera}`);
    if (semOrigen != null && semDestino != null) partes.push(`Semestre ${semOrigen} → ${semDestino}`);
    if (actualizados != null) partes.push(`${actualizados} alumno(s) promovido(s)`);
    return partes.length ? partes.join(' · ') + '.' : 'Se ejecutó la promoción de semestre curricular por carrera.';
  }

  if (evento.accion === 'promocionar_semestre_curricular_masivo_facultad') {
    const facultad = typeof detalle.facultad === 'string' ? detalle.facultad : null;
    const anio = detalle.anioIngreso != null ? Number(detalle.anioIngreso) : null;
    const semOrigen = detalle.semestreOrigen != null ? Number(detalle.semestreOrigen) : null;
    const semDestino = detalle.semestreDestino != null ? Number(detalle.semestreDestino) : null;
    const actualizados = detalle.actualizados != null ? Number(detalle.actualizados) : null;
    const partes: string[] = [];
    if (facultad) partes.push(`Facultad: ${facultad}`);
    if (anio) partes.push(`Año de ingreso ${anio}`);
    if (semOrigen != null && semDestino != null) partes.push(`Semestre ${semOrigen} → ${semDestino}`);
    if (actualizados != null) partes.push(`${actualizados} alumno(s) promovido(s)`);
    return partes.length ? partes.join(' · ') + '.' : 'Se ejecutó la promoción de semestre curricular masiva por facultad.';
  }

  return `Se ejecutó la acción ${evento.accion} en el módulo ${evento.modulo}.`;
}

export function AuditoriaPage({ onLogout }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  /** Acumulado de todas las acciones vistas en cualquier carga; no se borra al filtrar. */
  const [accionesVistas, setAccionesVistas] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [seleccionado, setSeleccionado] = useState<EventoAuditoria | null>(null);

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [rangoRapido, setRangoRapido] = useState<RangoRapido>('ultimos_7_dias');
  const [modulo, setModulo] = useState('');
  const [accion, setAccion] = useState('');
  const [resultado, setResultado] = useState<'ok' | 'error' | ''>('');
  const [q, setQ] = useState('');
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [mostrarDatosTecnicos, setMostrarDatosTecnicos] = useState(false);
  const panelDatosTecnicosRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!rangoRapido) return;

    const hoy = new Date();
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    let inicio = new Date(fin);

    if (rangoRapido === 'ultimos_7_dias') {
      inicio.setDate(fin.getDate() - 6);
    } else if (rangoRapido === 'este_mes') {
      inicio = new Date(fin.getFullYear(), fin.getMonth(), 1);
    } else if (rangoRapido === 'este_anio') {
      inicio = new Date(fin.getFullYear(), 0, 1);
    }

    setDesde(toInputDate(inicio));
    setHasta(toInputDate(fin));
  }, [rangoRapido]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (desde) params.set('desde', `${desde}T00:00:00Z`);
    if (hasta) params.set('hasta', `${hasta}T23:59:59Z`);
    if (modulo.trim()) params.set('modulo', modulo.trim());
    if (accion.trim()) params.set('accion', accion.trim());
    if (resultado) params.set('resultado', resultado);
    params.set('limit', '120');
    return params.toString();
  }, [desde, hasta, modulo, accion, resultado]);

  const modulosDisponibles = useMemo(() => {
    const modulosEventos = eventos.map((item) => item.modulo).filter(Boolean);
    return Array.from(new Set([...MODULOS_SUGERIDOS, ...modulosEventos]))
      .filter((item) => item.toLowerCase() !== 'todos')
      .sort((a, b) => a.localeCompare(b));
  }, [eventos]);

  const accionesDisponibles = useMemo(() => {
    const sugeridas = modulo ? (ACCIONES_SUGERIDAS_POR_MODULO[modulo] ?? []) : Object.values(ACCIONES_SUGERIDAS_POR_MODULO).flat();
    return Array.from(new Set([...sugeridas, ...Array.from(accionesVistas)]))
      .filter((item) => item.toLowerCase() !== 'todos' && item.toLowerCase() !== 'todas')
      .sort((a, b) => etiquetaAccion(a).localeCompare(etiquetaAccion(b), 'es'));
  }, [accionesVistas, modulo]);

  const eventosFiltrados = useMemo(() => {
    const term = normalizarTexto(q);
    if (!term) return eventos;

    return eventos.filter((evento) => {
      const detalleTxt = JSON.stringify(evento.detalle ?? {});
      const antesTxt = JSON.stringify(evento.antes ?? {});
      const despuesTxt = JSON.stringify(evento.despues ?? {});
      const recursoTxt = `${evento.recurso_tipo ?? ''} ${evento.recurso_id ?? ''}`;
      const base = [
        evento.modulo,
        evento.accion,
        etiquetaAccion(evento.accion),
        obtenerActor(evento),
        construirResumenCambio(evento),
        recursoTxt,
        detalleTxt,
        antesTxt,
        despuesTxt,
      ].join(' ');
      return normalizarTexto(base).includes(term);
    });
  }, [eventos, q]);

  useEffect(() => {
    if (!accion) return;
    if (!accionesDisponibles.includes(accion)) {
      setAccion('');
    }
  }, [accion, accionesDisponibles]);

  const cargarEventos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ApiList<EventoAuditoria>>(`/auditoria/eventos?${queryString}`);
      setEventos(data.datos ?? []);
      setTotal(data.total ?? 0);
      setAccionesVistas((prev) => {
        const next = new Set(prev);
        for (const ev of data.datos ?? []) { if (ev.accion && ev.accion !== 'refresh_token') next.add(ev.accion); }
        return next;
      });
      setSeleccionado((prev) => {
        if (!prev) return null;
        return (data.datos ?? []).find((item) => item.id === prev.id) ?? null;
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo cargar auditoría';
      toast.error(mensaje);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  const exportarPdf = useCallback(async () => {
    setExportandoPdf(true);
    try {
      await generarYAbrirPdf('/auditoria/eventos/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desde: desde ? `${desde}T00:00:00Z` : undefined,
          hasta: hasta ? `${hasta}T23:59:59Z` : undefined,
          modulo: modulo.trim() || undefined,
          accion: accion.trim() || undefined,
          resultado: resultado || undefined,
          q: q.trim() || undefined,
        }),
      });
      toast.success('PDF de auditoría generado.');
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo exportar PDF de auditoría';
      toast.error(mensaje);
    } finally {
      setExportandoPdf(false);
    }
  }, [desde, hasta, modulo, accion, resultado, q]);

  useEffect(() => {
    void cargarEventos();
  }, [cargarEventos]);

  useEffect(() => {
    if (!seleccionado) {
      setMostrarDatosTecnicos(false);
    }
  }, [seleccionado]);


  return (
    <div className="system-bg app-shell-viewport text-[#e7eef9] min-h-screen h-screen overflow-hidden">
      <div className="app-layout-row">
        {sidebarOpen ? (
          <div
            className="app-sidebar-scrim"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        ) : null}

        <AppSidebar sidebarOpen={sidebarOpen} onLogout={onLogout} onClose={() => setSidebarOpen(false)} />

        <main className="app-layout-main">
          <header className="flex-shrink-0 min-h-16 bg-[#132a52]/90 backdrop-blur-md border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 z-10">
            <div className="flex min-w-0 items-center gap-3">
              <button className="app-menu-toggle text-slate-400" onClick={() => setSidebarOpen((prev) => !prev)} aria-label="Abrir menú">
                <span className="material-symbols-outlined">menu</span>
              </button>
              <span className="material-symbols-outlined shrink-0 text-[#6b8bc3]">policy</span>
              <div className="min-w-0">
                <p className="text-xs uppercase text-slate-400">Control</p>
                <h1 className="text-xl font-semibold truncate">Auditoría del sistema</h1>
              </div>
            </div>
            <div className="w-full shrink-0 text-xs text-slate-400 sm:w-auto">Total eventos: {eventosFiltrados.length} / {total}</div>
          </header>

          <section
            className={`auditoria-page-section flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:gap-5 sm:p-6 ${
              seleccionado
                ? 'max-xl:overflow-hidden'
                : 'max-lg:scroll-region max-lg:app-scroll-content max-lg:overflow-y-auto lg:overflow-hidden'
            }`}
            data-has-selection={seleccionado ? 'true' : 'false'}
          >
            <div
              className={`auditoria-filtros min-w-0 shrink-0 flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#132a52] p-4 ${
                seleccionado ? 'max-xl:hidden' : ''
              }`}
            >
              {/* Fila 1: selectores */}
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
                <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-slate-400 lg:min-w-[150px] lg:flex-1">
                  Período rápido
                  <AppSelect
                    value={rangoRapido}
                    onChange={(v) => setRangoRapido(v as RangoRapido)}
                    allowEmpty
                    emptyLabel="Personalizado"
                    options={[
                      { value: 'ultimos_7_dias', label: 'Últimos 7 días' },
                      { value: 'este_mes', label: 'Este mes' },
                      { value: 'este_anio', label: 'Este año' },
                    ]}
                    triggerClassName="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                  />
                </label>

                <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-slate-400 lg:min-w-[140px] lg:flex-1">
                  Desde
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) => {
                      setDesde(e.target.value);
                      setRangoRapido('');
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-[#f0f4f8]"
                  />
                </label>

                <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-slate-400 lg:min-w-[140px] lg:flex-1">
                  Hasta
                  <input
                    type="date"
                    value={hasta}
                    onChange={(e) => {
                      setHasta(e.target.value);
                      setRangoRapido('');
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-[#f0f4f8]"
                  />
                </label>

                <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-slate-400 lg:min-w-[140px] lg:flex-1">
                  Módulo
                  <AppSelect
                    value={modulo}
                    onChange={(v) => {
                      setModulo(v);
                      setAccion('');
                    }}
                    allowEmpty
                    emptyLabel="Todos"
                    options={modulosDisponibles.map((item) => ({
                      value: item,
                      label: formatearEtiqueta(item),
                    }))}
                    triggerClassName="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                  />
                </label>

                <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-slate-400 lg:min-w-[200px] lg:flex-[2]">
                  Acción
                  <AppSelect
                    value={accion}
                    onChange={setAccion}
                    allowEmpty
                    emptyLabel="Todas"
                    options={accionesDisponibles.map((item) => ({
                      value: item,
                      label: etiquetaAccion(item),
                    }))}
                    triggerClassName="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                  />
                </label>

                <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-slate-400 lg:min-w-[110px] lg:flex-1">
                  Resultado
                  <AppSelect
                    value={resultado}
                    onChange={(v) => setResultado(v as 'ok' | 'error' | '')}
                    allowEmpty
                    emptyLabel="Todos"
                    options={RESULTADOS.map((item) => ({
                      value: item,
                      label: item.toUpperCase(),
                    }))}
                    triggerClassName="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                  />
                </label>
              </div>

              {/* Fila 2: búsqueda + botones */}
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-slate-400 lg:flex-1 lg:min-w-[200px]">
                  Búsqueda
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="correo, recurso, detalle..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-[#f0f4f8]"
                  />
                </label>
                <div className="btn-mobile-stack flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-row lg:items-center">
                  <button
                    type="button"
                    onClick={() => void cargarEventos()}
                    className="btn-modern btn-modern-primary btn-mobile-cta w-full sm:w-auto"
                  >
                    {loading ? 'Cargando...' : 'Aplicar filtros'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDesde('');
                      setHasta('');
                      setRangoRapido('ultimos_7_dias');
                      setModulo('');
                      setAccion('');
                      setResultado('');
                      setQ('');
                    }}
                    className="btn-modern btn-modern-ghost btn-mobile-cta w-full rounded-lg border border-slate-600 bg-slate-900 text-sm text-slate-200 hover:bg-slate-800 sm:w-auto"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportarPdf()}
                    className="btn-modern btn-modern-info btn-mobile-cta w-full sm:w-auto"
                    disabled={loading || exportandoPdf}
                  >
                    {exportandoPdf ? 'Generando PDF...' : 'Exportar PDF'}
                  </button>
                </div>
              </div>
            </div>

            <div
              className="auditoria-workspace flex min-h-0 flex-col gap-3 sm:gap-4"
              data-has-selection={seleccionado ? 'true' : 'false'}
            >
            <div
              className={`auditoria-tabla-panel min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-[#132a52] ${
                seleccionado ? 'max-xl:hidden' : ''
              }`}
            >
              <div className="auditoria-tabla-scroll flex min-h-0 min-w-0 flex-1 flex-col max-lg:max-h-none max-lg:overflow-visible lg:min-h-0 lg:overflow-auto">
                {!eventosFiltrados.length ? (
                  <div className="auditoria-eventos-estado-vacio m-3 flex min-h-[min(42vh,18rem)] flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-[#132a52] dark:text-slate-400 xl:min-h-[min(28vh,14rem)]">
                    {loading ? 'Cargando eventos…' : 'No hay eventos con esos filtros'}
                  </div>
                ) : (
                  <>
                <ul className="auditoria-eventos-tarjetas flex flex-col gap-2.5 p-3 xl:hidden">
                  {eventosFiltrados.map((evento) => (
                      <EventoAuditoriaTarjetaMovil
                        key={evento.id}
                        evento={evento}
                        seleccionado={seleccionado?.id === evento.id}
                        onSeleccionar={() => setSeleccionado(evento)}
                      />
                    ))}
                </ul>

                <div className="scroll-region-table hidden min-w-0 overflow-x-auto overscroll-x-contain xl:block">
                <table className="auditoria-tabla-eventos w-full min-w-[52rem] table-auto text-sm">
                  <colgroup>
                    <col className="w-[1%]" />
                    <col className="w-[1%]" />
                    <col className="w-[1%]" />
                    <col />
                    <col />
                    <col className="w-[1%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-[1] bg-[#0c1a3b] text-slate-300">
                    <tr>
                      <th className="whitespace-nowrap rounded-tl-xl px-3 py-2 text-left align-bottom">Fecha</th>
                      <th className="whitespace-nowrap px-3 py-2 text-left align-bottom">Actor</th>
                      <th className="whitespace-nowrap px-3 py-2 text-left align-bottom">Módulo</th>
                      <th className="px-3 py-2 text-left align-bottom">Acción</th>
                      <th className="px-3 py-2 text-left align-bottom">Recurso</th>
                      <th className="whitespace-nowrap rounded-tr-xl px-3 py-2 text-left align-bottom">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventosFiltrados.map((evento) => (
                      <tr
                        key={evento.id}
                        onClick={() => setSeleccionado(evento)}
                        className={`cursor-pointer border-t border-slate-800 hover:bg-[#1e3a6b] ${
                          seleccionado?.id === evento.id ? 'auditoria-fila-seleccionada bg-[#1e3a6b]' : ''
                        }`}
                      >
                        <td className="whitespace-nowrap px-3 py-2 align-top text-slate-200">
                          {formatearFechaLarga(evento.fecha_hora)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-top text-slate-300">
                          {obtenerActor(evento)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-top text-slate-300">{evento.modulo}</td>
                        <td className="min-w-[10rem] whitespace-normal break-words px-3 py-2 align-top text-slate-200">
                          {etiquetaAccion(evento.accion)}
                        </td>
                        <td className="auditoria-celda-secundaria min-w-[12rem] whitespace-normal break-words px-3 py-2 align-top text-slate-400">
                          {formatearRecurso(evento)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-top">
                          <span
                            className={`rounded px-2 py-1 text-xs font-semibold uppercase ${claseBadgeResultadoAuditoria(evento.resultado)}`}
                          >
                            {evento.resultado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                  </>
                )}
              </div>
            </div>

            <div
              className={`auditoria-detail-panel rounded-xl border p-4 xl:shrink-0 ${
                seleccionado
                  ? 'auditoria-detail-panel--activo max-xl:flex max-xl:min-h-0 max-xl:flex-1 max-xl:flex-col max-xl:overflow-hidden max-xl:p-3'
                  : 'max-xl:hidden'
              }`}
            >
              {seleccionado ? (
                <button
                  type="button"
                  onClick={() => setSeleccionado(null)}
                  className="mb-3 flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800 xl:hidden"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Volver al listado
                </button>
              ) : null}
              <div className="mb-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-[#f0f4f8]">Detalle del evento</h2>
                {seleccionado ? (
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setMostrarDatosTecnicos((prev) => !prev)}
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:flex-none dark:border-slate-500 dark:bg-transparent dark:text-[#e7eef9] dark:hover:bg-white/5 xl:mr-6"
                    >
                      {mostrarDatosTecnicos ? 'Ocultar datos técnicos' : 'Datos técnicos avanzados'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeleccionado(null)}
                      className="auditoria-detalle-cerrar-tablet hidden shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-white/5"
                      aria-label="Cerrar detalle"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ) : null}
              </div>
              {!seleccionado ? (
                <p className="auditoria-detalle-placeholder text-sm text-slate-500 dark:text-slate-400 max-xl:hidden">
                  Selecciona un evento para ver más información.
                </p>
              ) : (
                <div
                  className={`auditoria-detail-body scroll-region app-scroll-content min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-y-contain text-sm max-xl:max-h-none ${
                    mostrarDatosTecnicos ? 'xl:max-h-[min(38vh,22rem)]' : 'xl:max-h-[min(28vh,15rem)]'
                  }`}
                >
                  <div
                    className={`flex w-full min-w-0 flex-col gap-4 max-xl:relative max-xl:z-0 ${
                      mostrarDatosTecnicos
                        ? 'max-xl:gap-5 xl:grid xl:grid-cols-[minmax(10rem,28%)_minmax(0,1fr)] xl:items-start xl:gap-5'
                        : ''
                    }`}
                  >
                    <div
                      className={`w-full min-w-0 text-slate-700 dark:text-[#e7eef9] ${
                        mostrarDatosTecnicos ? 'max-xl:shrink-0 xl:pr-0' : 'xl:flex-1 xl:pr-5'
                      }`}
                    >
                      <div className="auditoria-detalle-movil-stack flex w-full flex-col gap-4 xl:hidden">
                        <DetalleEventoEncabezadoMovil evento={seleccionado} />
                        {!mostrarDatosTecnicos ? (
                          <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white/80 dark:border-slate-700/60 dark:bg-slate-900/25">
                            <DetalleCampoMovil
                              etiqueta="Qué se hizo"
                              valor={<span className="break-words">{construirResumenCambio(seleccionado)}</span>}
                            />
                            <DetalleCampoMovil
                              etiqueta="Quién lo hizo"
                              valor={<span className="break-words">{obtenerActor(seleccionado)}</span>}
                            />
                            <DetalleCampoMovil
                              etiqueta="Cuándo"
                              valor={<span className="tabular-nums">{formatearFechaLarga(seleccionado.fecha_hora)}</span>}
                            />
                            <DetalleCampoMovil
                              etiqueta="Módulo / Acción"
                              valor={
                                <span className="break-words">
                                  {seleccionado.modulo} / {etiquetaAccion(seleccionado.accion)}
                                </span>
                              }
                            />
                            <DetalleCampoMovil
                              etiqueta="Recurso"
                              valor={<span className="break-words">{formatearRecurso(seleccionado)}</span>}
                            />
                            <DetalleCampoMovil
                              etiqueta="Resultado"
                              valor={
                                <span
                                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${claseBadgeResultadoAuditoria(seleccionado.resultado)}`}
                                >
                                  {seleccionado.resultado}
                                </span>
                              }
                            />
                          </div>
                        ) : null}
                      </div>
                      <div className="auditoria-detalle-resumen-pc hidden space-y-2.5 leading-relaxed xl:block">
                        <p>
                          <strong>Qué se hizo:</strong> {construirResumenCambio(seleccionado)}
                        </p>
                        <p>
                          <strong>Quién lo hizo:</strong> {obtenerActor(seleccionado)}
                        </p>
                        <p>
                          <strong>Cuándo:</strong> {formatearFechaLarga(seleccionado.fecha_hora)}
                        </p>
                        <p>
                          <strong>Módulo / Acción:</strong> {seleccionado.modulo} /{' '}
                          {etiquetaAccion(seleccionado.accion)}
                        </p>
                        <p>
                          <strong>Recurso:</strong> {formatearRecurso(seleccionado)}
                        </p>
                        <p>
                          <strong>Resultado:</strong>{' '}
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${claseBadgeResultadoAuditoria(seleccionado.resultado)}`}
                          >
                            {seleccionado.resultado.toUpperCase()}
                          </span>
                        </p>
                      </div>
                    </div>
                    {mostrarDatosTecnicos ? (
                      <div className="auditoria-datos-tecnicos relative z-[1] w-full min-w-0 shrink-0 space-y-2 xl:border-l xl:border-slate-200 xl:pl-5 dark:xl:border-slate-600">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:hidden">
                          Datos técnicos
                        </p>
                        <div
                          ref={panelDatosTecnicosRef}
                          className="w-full rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40 max-xl:max-h-[min(50vh,24rem)] max-xl:overflow-y-auto max-xl:shadow-sm xl:max-h-none xl:overflow-visible"
                        >
                          <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                            <p className="break-words">
                              <strong>ID:</strong> {seleccionado.id}
                            </p>
                            <p className="break-words">
                              <strong>IP:</strong> {seleccionado.ip ?? '-'}
                            </p>
                            <p className="break-words leading-snug">
                              <strong>User-Agent:</strong>{' '}
                              <span className="font-mono text-[11px]">{seleccionado.user_agent ?? '-'}</span>
                            </p>
                            <p className="break-words">
                              <strong>Roles:</strong> {(seleccionado.actor_roles ?? []).join(', ') || '-'}
                            </p>
                            {tieneContenidoTecnico(seleccionado.detalle) ? (
                              <div>
                                <p className="mb-1 text-xs uppercase text-slate-400">Detalle JSON</p>
                                <pre className="max-h-48 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 xl:max-h-none xl:overflow-y-visible">
                                  {JSON.stringify(seleccionado.detalle, null, 2)}
                                </pre>
                              </div>
                            ) : null}
                            {tieneContenidoTecnico(seleccionado.antes) ? (
                              <div>
                                <p className="mb-1 text-xs uppercase text-slate-400">Antes</p>
                                <pre className="max-h-40 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 xl:max-h-none xl:overflow-y-visible">
                                  {JSON.stringify(seleccionado.antes, null, 2)}
                                </pre>
                              </div>
                            ) : null}
                            {tieneContenidoTecnico(seleccionado.despues) ? (
                              <div>
                                <p className="mb-1 text-xs uppercase text-slate-400">Después</p>
                                <pre className="max-h-40 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 xl:max-h-none xl:overflow-y-visible">
                                  {JSON.stringify(seleccionado.despues, null, 2)}
                                </pre>
                              </div>
                            ) : null}
                            {!tieneContenidoTecnico(seleccionado.detalle) &&
                            !tieneContenidoTecnico(seleccionado.antes) &&
                            !tieneContenidoTecnico(seleccionado.despues) ? (
                              <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-400">
                                Este evento no incluye campos técnicos adicionales para mostrar.
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white/80 dark:border-slate-700/60 dark:bg-slate-900/25 lg:hidden">
                          <DetalleCampoMovil
                            etiqueta="Qué se hizo"
                            valor={<span className="break-words">{construirResumenCambio(seleccionado)}</span>}
                          />
                          <DetalleCampoMovil
                            etiqueta="Quién lo hizo"
                            valor={<span className="break-words">{obtenerActor(seleccionado)}</span>}
                          />
                          <DetalleCampoMovil
                            etiqueta="Cuándo"
                            valor={<span className="tabular-nums">{formatearFechaLarga(seleccionado.fecha_hora)}</span>}
                          />
                          <DetalleCampoMovil
                            etiqueta="Módulo / Acción"
                            valor={
                              <span className="break-words">
                                {seleccionado.modulo} / {etiquetaAccion(seleccionado.accion)}
                              </span>
                            }
                          />
                          <DetalleCampoMovil
                            etiqueta="Recurso"
                            valor={<span className="break-words">{formatearRecurso(seleccionado)}</span>}
                          />
                          <DetalleCampoMovil
                            etiqueta="Resultado"
                            valor={
                              <span
                                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${claseBadgeResultadoAuditoria(seleccionado.resultado)}`}
                              >
                                {seleccionado.resultado}
                              </span>
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
