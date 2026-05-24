import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { AppSelect } from '../components/ui/app-select';
import { API_ORIGIN, apiFetch } from '../utils/api';
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

interface ExportAuditoriaResponse {
  url_documento: string;
  total: number;
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
  const nombreCompleto = obtenerTexto(evento.actor_nombre_completo);
  const correo = obtenerTexto(evento.actor_email);
  const usuario = obtenerTexto(evento.actor_username);

  if (nombreCompleto && correo) return `${nombreCompleto} (${correo})`;
  if (nombreCompleto && usuario) return `${nombreCompleto} (${usuario})`;
  if (nombreCompleto) return nombreCompleto;
  if (correo) return correo;
  if (usuario) return usuario;
  return 'Sistema';
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

const ZONA_AUDITORIA = 'America/Asuncion';

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

  function getDocumentoUrl(url: string) {
    if (!url) return '#';
    if (/^https?:\/\//i.test(url)) return url;
    const apiBase = API_ORIGIN;
    return `${apiBase}${url.startsWith('/') ? url : `/${url}`}`;
  }

  const exportarPdf = useCallback(async () => {
    setExportandoPdf(true);
    try {
      const response = await apiFetch<ExportAuditoriaResponse>('/auditoria/eventos/pdf', {
        method: 'POST',
        body: JSON.stringify({
          desde: desde ? `${desde}T00:00:00Z` : undefined,
          hasta: hasta ? `${hasta}T23:59:59Z` : undefined,
          modulo: modulo.trim() || undefined,
          accion: accion.trim() || undefined,
          resultado: resultado || undefined,
          q: q.trim() || undefined,
        }),
      });
      if (!response?.url_documento) throw new Error('No se obtuvo el PDF exportado');
      window.open(getDocumentoUrl(response.url_documento), '_blank', 'noopener,noreferrer');
      toast.success(`PDF de auditoría generado (${response.total} eventos).`);
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

  useEffect(() => {
    if (!mostrarDatosTecnicos) return;
    const target = panelDatosTecnicosRef.current;
    if (!target) return;

    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        window.scrollBy({ top: 80, behavior: 'smooth' });
      }, 180);
    });
  }, [mostrarDatosTecnicos]);

  return (
    <div className="system-bg text-[#e7eef9] min-h-screen h-screen overflow-hidden">
      <div className="flex h-full w-full overflow-hidden">
        {sidebarOpen ? (
          <div
            className="fixed inset-0 bg-black/70 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        ) : null}

        <AppSidebar sidebarOpen={sidebarOpen} onLogout={onLogout} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 flex flex-col h-full overflow-hidden">
          <header className="flex-shrink-0 h-16 bg-[#132a52]/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 z-10">
            <div className="flex items-center gap-3">
              <button className="lg:hidden text-slate-400" onClick={() => setSidebarOpen((prev) => !prev)} aria-label="Abrir menú">
                <span className="material-symbols-outlined">menu</span>
              </button>
              <span className="material-symbols-outlined text-[#6b8bc3]">policy</span>
              <div>
                <p className="text-xs uppercase text-slate-400">Control</p>
                <h1 className="text-xl font-semibold">Auditoría del sistema</h1>
              </div>
            </div>
            <div className="text-xs text-slate-400">Total eventos: {eventosFiltrados.length} / {total}</div>
          </header>

          <section className="flex-1 overflow-y-auto p-6 space-y-5">
            <div className="rounded-xl border border-slate-800 bg-[#132a52] p-4 flex flex-col gap-3">
              {/* Fila 1: selectores */}
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs text-slate-400 min-w-[150px] flex-1">
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
                    triggerClassName="px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-400 min-w-[140px] flex-1">
                  Desde
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) => {
                      setDesde(e.target.value);
                      setRangoRapido('');
                    }}
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-[#f0f4f8]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-400 min-w-[140px] flex-1">
                  Hasta
                  <input
                    type="date"
                    value={hasta}
                    onChange={(e) => {
                      setHasta(e.target.value);
                      setRangoRapido('');
                    }}
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-[#f0f4f8]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-400 min-w-[140px] flex-1">
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
                    triggerClassName="px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-400 min-w-[200px] flex-[2]">
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
                    triggerClassName="px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-400 min-w-[110px] flex-1">
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
                    triggerClassName="px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                  />
                </label>
              </div>

              {/* Fila 2: búsqueda + botones */}
              <div className="flex flex-wrap gap-3 items-end">
                <label className="flex flex-col gap-1 text-xs text-slate-400 flex-1 min-w-[200px]">
                  Búsqueda
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="correo, recurso, detalle..."
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-[#f0f4f8]"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void cargarEventos()}
                    className="btn-modern btn-modern-primary"
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
                    className="rounded-lg px-4 py-2 border border-slate-600 bg-slate-900 hover:bg-slate-800 text-sm text-slate-200"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportarPdf()}
                    className="btn-modern btn-modern-info"
                    disabled={loading || exportandoPdf}
                  >
                    {exportandoPdf ? 'Generando PDF...' : 'Exportar PDF'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#132a52] overflow-hidden">
              <div className="overflow-auto max-h-[45vh]">
                <table className="w-full min-w-[720px] table-auto text-sm">
                  <colgroup>
                    <col className="w-[1%]" />
                    <col className="w-[1%]" />
                    <col className="w-[1%]" />
                    <col />
                    <col />
                    <col className="w-[1%]" />
                  </colgroup>
                  <thead className="bg-[#0c1a3b] text-slate-300 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 align-bottom whitespace-nowrap">Fecha</th>
                      <th className="text-left px-3 py-2 align-bottom whitespace-nowrap">Actor</th>
                      <th className="text-left px-3 py-2 align-bottom whitespace-nowrap">Módulo</th>
                      <th className="text-left px-3 py-2 align-bottom">Acción</th>
                      <th className="text-left px-3 py-2 align-bottom">Recurso</th>
                      <th className="text-left px-3 py-2 align-bottom whitespace-nowrap">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventosFiltrados.map((evento) => (
                      <tr
                        key={evento.id}
                        onClick={() => setSeleccionado(evento)}
                        className={`cursor-pointer border-t border-slate-800 hover:bg-[#162b52] ${seleccionado?.id === evento.id ? 'bg-[#162b52]' : ''}`}
                      >
                        <td className="px-3 py-2 align-top text-slate-200 whitespace-nowrap">
                          {formatearFechaLarga(evento.fecha_hora)}
                        </td>
                        <td className="px-3 py-2 align-top text-slate-300 whitespace-nowrap">
                          {obtenerActor(evento)}
                        </td>
                        <td className="px-3 py-2 align-top text-slate-300 whitespace-nowrap">
                          {evento.modulo}
                        </td>
                        <td className="px-3 py-2 align-top text-slate-200 whitespace-normal break-words min-w-[10rem]">
                          {etiquetaAccion(evento.accion)}
                        </td>
                        <td className="px-3 py-2 align-top text-slate-400 whitespace-normal break-words min-w-[12rem]">
                          {formatearRecurso(evento)}
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${evento.resultado === 'ok' ? 'bg-emerald-600/20 text-emerald-300' : 'bg-rose-600/20 text-rose-300'}`}>
                            {evento.resultado.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!eventosFiltrados.length ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-400" colSpan={6}>
                          {loading ? 'Cargando eventos...' : 'No hay eventos con esos filtros'}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#132a52] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold">Detalle del evento</h2>
                {seleccionado ? (
                  <button
                    type="button"
                    onClick={() => setMostrarDatosTecnicos((prev) => !prev)}
                    className="mr-6 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  >
                    {mostrarDatosTecnicos ? 'Ocultar datos técnicos' : 'Datos técnicos avanzados'}
                  </button>
                ) : null}
              </div>
              {!seleccionado ? (
                <p className="text-sm text-slate-400">Selecciona un evento para ver más información.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1 text-slate-300">
                    <p><strong>Qué se hizo:</strong> {construirResumenCambio(seleccionado)}</p>
                    <p><strong>Quién lo hizo:</strong> {obtenerActor(seleccionado)}</p>
                    <p><strong>Cuándo:</strong> {formatearFechaLarga(seleccionado.fecha_hora)}</p>
                    <p><strong>Módulo / Acción:</strong> {seleccionado.modulo} / {etiquetaAccion(seleccionado.accion)}</p>
                    <p><strong>Recurso:</strong> {formatearRecurso(seleccionado)}</p>
                    <p>
                      <strong>Resultado:</strong>{' '}
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${seleccionado.resultado === 'ok' ? 'bg-emerald-600/20 text-emerald-300' : 'bg-rose-600/20 text-rose-300'}`}>
                        {seleccionado.resultado.toUpperCase()}
                      </span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    {mostrarDatosTecnicos ? (
                      <div ref={panelDatosTecnicosRef} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                        <div className="space-y-2 text-xs text-slate-300">
                          <p><strong>ID:</strong> {seleccionado.id}</p>
                          <p><strong>IP:</strong> {seleccionado.ip ?? '-'}</p>
                          <p><strong>User-Agent:</strong> {seleccionado.user_agent ?? '-'}</p>
                          <p><strong>Roles:</strong> {(seleccionado.actor_roles ?? []).join(', ') || '-'}</p>
                          {tieneContenidoTecnico(seleccionado.detalle) ? (
                            <div>
                              <p className="text-xs uppercase text-slate-400 mb-1">Detalle JSON</p>
                              <pre className="text-xs bg-slate-900 border border-slate-700 rounded-lg p-3 overflow-auto max-h-40 text-slate-200">{JSON.stringify(seleccionado.detalle, null, 2)}</pre>
                            </div>
                          ) : null}
                          {tieneContenidoTecnico(seleccionado.antes) ? (
                            <div>
                              <p className="text-xs uppercase text-slate-400 mb-1">Antes</p>
                              <pre className="text-xs bg-slate-900 border border-slate-700 rounded-lg p-3 overflow-auto max-h-32 text-slate-200">{JSON.stringify(seleccionado.antes, null, 2)}</pre>
                            </div>
                          ) : null}
                          {tieneContenidoTecnico(seleccionado.despues) ? (
                            <div>
                              <p className="text-xs uppercase text-slate-400 mb-1">Después</p>
                              <pre className="text-xs bg-slate-900 border border-slate-700 rounded-lg p-3 overflow-auto max-h-32 text-slate-200">{JSON.stringify(seleccionado.despues, null, 2)}</pre>
                            </div>
                          ) : null}
                          {!tieneContenidoTecnico(seleccionado.detalle) && !tieneContenidoTecnico(seleccionado.antes) && !tieneContenidoTecnico(seleccionado.despues) ? (
                            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-400">
                              Este evento no incluye campos técnicos adicionales para mostrar.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
