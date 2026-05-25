import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { AppSelect } from '../components/ui/app-select';
import { API_BASE_URL, abrirDocumento, apiFetch, generarYAbrirPdf, notifySessionExpired } from '../utils/api';
import {
  contarFaltasDesdeSesiones,
  descripcionEstadoAsistencia,
  evaluarEstadoAsistencia,
  metricasModuloCurso,
  porcentajeMaximoAlcanzable,
  type EstadoAsistenciaAlumno,
  type MetricasModuloCurso,
} from '../utils/estado-asistencia';
import { puedeAprobarJustificaciones } from '../utils/rbac';
import { agruparJustificacionesPorCarga, claveGrupoJustificacionCarga } from '../utils/justificaciones-grupo';

type Sesion = {
  id: number;
  curso_id: number;
  fecha: string;
  estado: string;
  modalidad: 'presencial' | 'virtual';
  observaciones?: string | null;
  cerrado_por?: string | null;
  cerrado_en?: string | null;
};

type PlanillaRow = {
  sesionId: number;
  cursoId: number;
  fecha: string;
  alumno: string;
  matriculaId: number;
  numeroDocumento?: string | null;
  estadoAcademico?: string | null;
  faltasAcumuladas?: number | null;
  porcentajeAsistencia?: number | null;
  estadoAsistencia?: 'presente' | 'ausente' | 'justificada' | null;
  justificada: boolean;
  observaciones?: string | null;
};

// Mapa matriculaId -> sesionId -> PlanillaRow
type PlanillaMatrix = Map<
  number,
  {
    alumno: string;
    documento: string;
    ordenLista: number | null;
    faltasAcumuladas: number;
    porcentajeAsistencia: number | null;
    estadoAcademico: string | null;
    celdas: Map<number, PlanillaRow>;
  }
>;

type PlanillaAsignada = {
  curso_id: number;
  modulo_id: number;
  materia: string;
  carrera: string;
  facultad: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado_modulo: string;
  aula?: string | null;
  horario_inicio?: string | null;
  horario_fin?: string | null;
  notas?: string | null;
  total_matriculas: number;
  docente: string;
  activa_hoy: boolean;
  periodo_label: string;
};

interface ApiList<T> {
  total: number;
  datos: T[];
}

type JustificacionEstado = 'pendiente' | 'aprobada' | 'rechazada';

interface AusenciaRow {
  asistencia_id: number;
  sesion_id: number;
  fecha: string;
  matricula_id: number;
  alumno: string;
  numero_documento: string;
  estado: string;
  justificada: boolean;
}

interface JustificacionRow {
  id: number;
  asistencia_id: number;
  motivo: string;
  documento_url?: string | null;
  estado_revision: JustificacionEstado;
  comentarios_revision?: string | null;
  estado_asistencia: string;
  fecha: string;
  curso_id: number;
  materia: string;
  alumno: string;
  matricula_id: number;
}

interface Props {
  onLogout?: () => void;
  roles?: string[];
}

/** Normaliza espacios y comas (formato "Apellidos, Nombres"). */
function formatoNombreLegible(raw: string): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

function normalizeDate(value: string) {
  return String(value).slice(0, 10);
}

/** Primeros 7 caracteres YYYY-MM (para input type="month"). */
function yyyyMmDesdeFecha(iso: string) {
  const s = normalizeDate(iso);
  return s.length >= 7 ? s.slice(0, 7) : s;
}

function clampYyyyMm(val: string, minYm: string, maxYm: string) {
  if (val < minYm) return minYm;
  if (val > maxYm) return maxYm;
  return val;
}

function clampFechaIso(val: string, minD: string, maxD: string) {
  if (val < minD) return minD;
  if (val > maxD) return maxD;
  return val;
}

function formatDateLabel(value?: string | null, long = false) {
  if (!value) return 'Sin fecha';
  const iso = normalizeDate(value);
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!partes) return iso;
  const date = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  if (Number.isNaN(date.getTime())) return iso;
  if (long) {
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return date.toLocaleDateString('es-AR');
}

const STICKY_COL_NUM = 36;
const STICKY_COL_CI = 64;
const STICKY_COL_FALTAS = 50;
const STICKY_COL_PCT = 54;
/** Ancho fijo de cada columna de día/sesión (P/A/J); evita solapamiento al achicar el viewport. */
const PLANILLA_SESION_COL_PX = 56;
const PLANILLA_NOMBRE_MIN_PX = 200;
const PLANILLA_NOMBRE_MAX_PX = 720;

type EstadoFilaPlanilla = EstadoAsistenciaAlumno;

function faltasEfectivasAlumno(
  entry: { faltasAcumuladas: number; celdas: Map<number, PlanillaRow> },
  sesionesCurso: Sesion[]
): number {
  const desdePlanilla = contarFaltasDesdeSesiones(entry.celdas, sesionesCurso);
  return Math.max(desdePlanilla, Number(entry.faltasAcumuladas) || 0);
}

function evaluarAlumnoPlanilla(
  entry: {
    faltasAcumuladas: number;
    porcentajeAsistencia: number | null;
    estadoAcademico: string | null;
    celdas: Map<number, PlanillaRow>;
  },
  sesionesCurso: Sesion[],
  metricas: MetricasModuloCurso | null
): { estado: EstadoFilaPlanilla; faltas: number; tooltip: string } {
  const faltas = faltasEfectivasAlumno(entry, sesionesCurso);
  const pctMax = porcentajeMaximoAlcanzable(entry.porcentajeAsistencia, metricas);
  const puedeEvaluarRiesgo = metricas?.puedeEvaluarRiesgo ?? false;
  const estado = evaluarEstadoAsistencia({
    porcentajeAsistencia: entry.porcentajeAsistencia,
    porcentajeMaximoAlcanzable: pctMax,
    puedeEvaluarRiesgo,
  });
  return {
    estado,
    faltas,
    tooltip: descripcionEstadoAsistencia(estado, {
      porcentajeAsistencia: entry.porcentajeAsistencia,
      porcentajeMaximoAlcanzable: pctMax,
      puedeEvaluarRiesgo,
    }),
  };
}

function claseFilaPlanilla(estado: EstadoFilaPlanilla, idx: number): string {
  if (estado === 'inhabilitado') return 'planilla-fila-inhabilitado';
  if (estado === 'riesgo') return 'planilla-fila-riesgo';
  return idx % 2 === 0 ? 'planilla-fila-regular-par' : 'planilla-fila-regular-impar';
}

export function AsistenciasDocentePage({ onLogout, roles = [] }: Props) {
  const mostrarModuloJustificaciones = true;
  const puedeResolverJustificaciones = puedeAprobarJustificaciones(roles);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [subView, setSubView] = useState<'planilla' | 'justificaciones'>('planilla');
  const [planillasAsignadas, setPlanillasAsignadas] = useState<PlanillaAsignada[]>([]);
  const [planillasLoading, setPlanillasLoading] = useState(false);
  const [planillasError, setPlanillasError] = useState<string | null>(null);
  const [cursoId, setCursoId] = useState('');

  // Selector de mes (YYYY-MM)
  const [mesAnio, setMesAnio] = useState(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  });

  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [planillaMatrix, setPlanillaMatrix] = useState<PlanillaMatrix>(new Map());
  const [loading, setLoading] = useState(false);
  const [generandoPdfLegal, setGenerandoPdfLegal] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, 'presente' | 'ausente'>>(new Map());
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [nuevaSesionFecha, setNuevaSesionFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [nuevaSesionModalidad, setNuevaSesionModalidad] = useState<'presencial' | 'virtual'>('presencial');
  const [creandoSesion, setCreandoSesion] = useState(false);
  const [cerrandoSesionId, setCerrandoSesionId] = useState<number | null>(null);
  const [sesionActivaId, setSesionActivaId] = useState<number | null>(null);
  const [justificaciones, setJustificaciones] = useState<JustificacionRow[]>([]);
  const [justificacionesLoading, setJustificacionesLoading] = useState(false);
  const [resolviendoId, setResolviendoId] = useState<number | null>(null);
  const [justificacionEstado, setJustificacionEstado] = useState<'' | JustificacionEstado>('pendiente');
  const [comentariosRevision, setComentariosRevision] = useState<Record<number, string>>({});
  const [cambiandoModalidad, setCambiandoModalidad] = useState(false);
  const [sesionModalidad, setSesionModalidad] = useState<Record<number, 'presencial' | 'virtual'>>({});
  const [ausencias, setAusencias] = useState<AusenciaRow[]>([]);
  const [ausenciasLoading, setAusenciasLoading] = useState(false);
  const [justifAlumnoBusqueda, setJustifAlumnoBusqueda] = useState('');
  const [justifAlumnoSeleccionado, setJustifAlumnoSeleccionado] = useState<number | null>(null);
  const [justifDiasSeleccionados, setJustifDiasSeleccionados] = useState<string[]>([]);
  const [ausenciasError, setAusenciasError] = useState<string | null>(null);
  const [justifMotivo, setJustifMotivo] = useState('');
  const [justifArchivo, setJustifArchivo] = useState<File | null>(null);
  const [subiendoJustif, setSubiendoJustif] = useState(false);
  const [mostrarFormJustif, setMostrarFormJustif] = useState(false);

  const planillaSeleccionada = useMemo(
    () => planillasAsignadas.find((item) => String(item.curso_id) === cursoId) ?? null,
    [cursoId, planillasAsignadas]
  );

  const metricasModulo = useMemo(() => {
    if (!planillaSeleccionada) return null;
    return metricasModuloCurso({
      fechaInicio: planillaSeleccionada.fecha_inicio,
      fechaFin: planillaSeleccionada.fecha_fin,
      sesiones: sesiones.map((s) => ({ fecha: s.fecha, estado: s.estado })),
    });
  }, [planillaSeleccionada, sesiones]);

  const resumen = useMemo(() => {
    let presentes = 0;
    let ausentes = 0;
    let justificados = 0;
    let enRiesgo = 0;
    let inhabilitados = 0;
    let total = 0;
    const puedeEvaluar = metricasModulo?.puedeEvaluarRiesgo ?? false;
    for (const entry of planillaMatrix.values()) {
      total++;
      const { estado } = evaluarAlumnoPlanilla(entry, sesiones, metricasModulo);
      if (puedeEvaluar) {
        if (estado === 'inhabilitado') inhabilitados++;
        else if (estado === 'riesgo') enRiesgo++;
      }
      const hoy = new Date().toISOString().slice(0, 10);
      const sesionHoy = sesiones.find((s) => normalizeDate(s.fecha) === hoy);
      if (sesionHoy) {
        const celda = entry.celdas.get(sesionHoy.id);
        if (celda?.estadoAsistencia === 'presente') presentes++;
        else if (celda?.estadoAsistencia === 'ausente') ausentes++;
        else if (celda?.estadoAsistencia === 'justificada') justificados++;
      }
    }
    return {
      presentes,
      ausentes,
      justificados,
      enRiesgo,
      inhabilitados,
      total,
      puedeEvaluarRiesgo: puedeEvaluar,
      evaluacionPendiente: metricasModulo != null && !puedeEvaluar,
    };
  }, [planillaMatrix, sesiones, metricasModulo]);

  /** Meses (YYYY-MM) dentro del módulo del curso seleccionado — el docente no puede tomar lista fuera de ese rango. */
  const rangoMesModulo = useMemo(() => {
    if (!planillaSeleccionada?.fecha_inicio || !planillaSeleccionada?.fecha_fin) return null;
    const minYm = yyyyMmDesdeFecha(planillaSeleccionada.fecha_inicio);
    const maxYm = yyyyMmDesdeFecha(planillaSeleccionada.fecha_fin);
    if (minYm > maxYm) return { min: maxYm, max: minYm };
    return { min: minYm, max: maxYm };
  }, [planillaSeleccionada?.fecha_inicio, planillaSeleccionada?.fecha_fin]);

  // Sesiones del mes seleccionado
  const sesionesDelMes = useMemo(() => {
    const [anio, mes] = mesAnio.split('-').map(Number);
    return sesiones
      .filter((s) => {
        const f = new Date(`${normalizeDate(s.fecha)}T00:00:00`);
        return f.getFullYear() === anio && f.getMonth() + 1 === mes;
      })
      .sort((a, b) => normalizeDate(a.fecha).localeCompare(normalizeDate(b.fecha)));
  }, [sesiones, mesAnio]);

  /** Sesión abierta en edición: mientras exista, no se puede volver a «Tomar lista». */
  const sesionListaAbierta = useMemo(() => {
    if (sesionActivaId) {
      return sesionesDelMes.find((s) => s.id === sesionActivaId && s.estado.toLowerCase() !== 'cerrada') ?? null;
    }
    return [...sesionesDelMes].reverse().find((s) => s.estado.toLowerCase() !== 'cerrada') ?? null;
  }, [sesionActivaId, sesionesDelMes]);

  // Todos los días lectivos (Lun–Jue) del mes seleccionado, acotados al rango del módulo
  const diasLectivosDelMes = useMemo(() => {
    const [anio, mes] = mesAnio.split('-').map(Number);
    const diasEnMes = new Date(anio, mes, 0).getDate();
    const fechaInicio = planillaSeleccionada ? normalizeDate(planillaSeleccionada.fecha_inicio) : null;
    const fechaFin    = planillaSeleccionada ? normalizeDate(planillaSeleccionada.fecha_fin)    : null;
    const dias: { fecha: string; modalidadDefault: 'presencial' | 'virtual' }[] = [];
    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (fechaInicio && fecha < fechaInicio) continue;
      if (fechaFin    && fecha > fechaFin)    continue;
      const diaSemana = new Date(`${fecha}T00:00:00`).getDay();
      if (diaSemana >= 1 && diaSemana <= 4) {
        dias.push({ fecha, modalidadDefault: 'presencial' });
      }
    }
    return dias;
  }, [mesAnio, planillaSeleccionada]);

  type ColumnaPlanilla = {
    fecha: string;
    modalidadDefault: 'presencial' | 'virtual';
    sesion: Sesion | null;
    /** Clase reprogramada fuera del calendario fijo (p. ej. viernes) — columna “Lista”. */
    esListaExcepcional: boolean;
  };

  // Días fijos Lun–Jue + columnas extra por sesiones en fechas no estándar (mismo mes, orden cronológico)
  const columnasDelMes = useMemo((): ColumnaPlanilla[] => {
    const fechasEstandar = new Set(diasLectivosDelMes.map((d) => d.fecha));
    const fechaInicio = planillaSeleccionada ? normalizeDate(planillaSeleccionada.fecha_inicio) : null;
    const fechaFin = planillaSeleccionada ? normalizeDate(planillaSeleccionada.fecha_fin) : null;
    const enRangoModulo = (fecha: string) => {
      if (fechaInicio && fecha < fechaInicio) return false;
      if (fechaFin && fecha > fechaFin) return false;
      return true;
    };

    const base: ColumnaPlanilla[] = diasLectivosDelMes.map((dia) => {
      const sesion = sesionesDelMes.find((s) => normalizeDate(s.fecha) === dia.fecha) ?? null;
      return { ...dia, sesion, esListaExcepcional: false };
    });

    const extras: ColumnaPlanilla[] = [];
    for (const s of sesionesDelMes) {
      const f = normalizeDate(s.fecha);
      if (fechasEstandar.has(f)) continue;
      if (!enRangoModulo(f)) continue;
      extras.push({
        fecha: f,
        modalidadDefault: s.modalidad ?? 'presencial',
        sesion: s,
        esListaExcepcional: true,
      });
    }

    return [...base, ...extras].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [diasLectivosDelMes, sesionesDelMes, planillaSeleccionada]);

  // Filas de la tabla (orden de importación / matrícula; fallback alfabético)
  const alumnosOrdenados = useMemo(() => {
    return [...planillaMatrix.entries()].sort(([, a], [, b]) => {
      const oa = a.ordenLista ?? Number.MAX_SAFE_INTEGER;
      const ob = b.ordenLista ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return a.alumno.localeCompare(b.alumno, 'es');
    });
  }, [planillaMatrix]);

  const planillaNombreMedirRef = useRef<HTMLSpanElement>(null);
  const [planillaNombreColPx, setPlanillaNombreColPx] = useState(260);

  const longestNombrePlanilla = useMemo(() => {
    let best = 'Apellidos y Nombres';
    for (const [, e] of alumnosOrdenados) {
      const t = formatoNombreLegible(e.alumno);
      if (t.length > best.length) best = t;
    }
    return best;
  }, [alumnosOrdenados]);

  const stickyPlanillaLeft = useMemo(() => {
    const afterNombre = STICKY_COL_NUM + planillaNombreColPx;
    return {
      ci: afterNombre,
      faltas: afterNombre + STICKY_COL_CI,
      pct: afterNombre + STICKY_COL_CI + STICKY_COL_FALTAS,
      nombreW: planillaNombreColPx,
    };
  }, [planillaNombreColPx]);

  const anchoMinPlanillaTabla = useMemo(
    () =>
      STICKY_COL_NUM +
      planillaNombreColPx +
      STICKY_COL_CI +
      STICKY_COL_FALTAS +
      STICKY_COL_PCT +
      columnasDelMes.length * PLANILLA_SESION_COL_PX,
    [planillaNombreColPx, columnasDelMes.length]
  );

  useLayoutEffect(() => {
    if (!cursoId) return;
    const el = planillaNombreMedirRef.current;
    if (!el) return;

    let raf = 0;
    const runMeasure = () => {
      const w = Math.ceil(el.getBoundingClientRect().width) + 40;
      setPlanillaNombreColPx(Math.min(PLANILLA_NOMBRE_MAX_PX, Math.max(PLANILLA_NOMBRE_MIN_PX, w)));
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(runMeasure);
      });
    };

    schedule();
    const ro = new ResizeObserver(() => schedule());
    ro.observe(el);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [longestNombrePlanilla, cursoId, loading]);

  // alumnosConAusencias: un entry por alumno con todas sus ausencias sin justificar
  const alumnosConAusencias = useMemo(() => {
    const map = new Map<number, { matriculaId: number; alumno: string; documento: string; dias: AusenciaRow[] }>();
    for (const a of ausencias) {
      if (!map.has(a.matricula_id)) {
        map.set(a.matricula_id, { matriculaId: a.matricula_id, alumno: a.alumno, documento: a.numero_documento, dias: [] });
      }
      map.get(a.matricula_id)!.dias.push(a);
    }
    return Array.from(map.values());
  }, [ausencias]);

  const alumnosFiltrados = useMemo(() => {
    const q = justifAlumnoBusqueda.trim().toLowerCase();
    if (!q) return alumnosConAusencias;
    return alumnosConAusencias.filter(
      (a) => a.alumno.toLowerCase().includes(q) || a.documento.toLowerCase().includes(q)
    );
  }, [alumnosConAusencias, justifAlumnoBusqueda]);

  const cargarPlanillasAsignadas = useCallback(async () => {
    setPlanillasLoading(true);
    setPlanillasError(null);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const resp = await apiFetch<ApiList<PlanillaAsignada>>(
        `/asistencias/mis-planillas?fecha=${encodeURIComponent(hoy)}`
      );
      const items = resp?.datos ?? [];
      setPlanillasAsignadas(items);
      setCursoId((prev) => {
        if (prev && items.some((item) => String(item.curso_id) === prev)) return prev;
        const preferida = items.find((item) => item.activa_hoy) ?? items[0];
        return preferida ? String(preferida.curso_id) : '';
      });
      if (!items.length) { setSesiones([]); setPlanillaMatrix(new Map()); setPendingChanges(new Map()); }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudieron cargar las planillas';
      setPlanillasAsignadas([]); setCursoId(''); setSesiones([]); setPlanillaMatrix(new Map()); setPendingChanges(new Map());
      setPlanillasError(mensaje);
    } finally {
      setPlanillasLoading(false);
    }
  }, []);

  // Carga todas las sesiones + planilla completa del curso (sin filtro de fecha)
  const cargarPlanillaMes = useCallback(async () => {
    const cursoNum = Number(cursoId);
    if (!cursoId || Number.isNaN(cursoNum)) return;
    setLoading(true);
    setSessionError(null);
    try {
      const [sesionesResp, planillaResp, alumnosResp] = await Promise.all([
        apiFetch<ApiList<Sesion>>(`/asistencias/sesiones?cursoId=${cursoNum}`),
        apiFetch<ApiList<Record<string, any>>>(`/asistencias/planilla?cursoId=${cursoNum}`),
        apiFetch<ApiList<Record<string, any>>>(`/asistencias/alumnos-curso?cursoId=${cursoNum}`),
      ]);
      const todasSesiones = sesionesResp?.datos ?? [];
      setSesiones(todasSesiones);
      // Modalidades
      const mod: Record<number, 'presencial' | 'virtual'> = {};
      for (const s of todasSesiones) mod[s.id] = s.modalidad ?? 'presencial';
      setSesionModalidad(mod);
      // Construir matrix sembrando primero con todos los alumnos matriculados
      const matrix: PlanillaMatrix = new Map();
      for (const al of (alumnosResp?.datos ?? [])) {
        matrix.set(Number(al.matricula_id), {
          alumno: al.alumno ?? 'Alumno sin nombre',
          documento: al.numero_documento ?? '',
          ordenLista: al.orden_lista != null ? Number(al.orden_lista) : null,
          faltasAcumuladas: Number(al.faltas_acumuladas) || 0,
          porcentajeAsistencia: al.porcentaje_asistencia != null ? Number(al.porcentaje_asistencia) : null,
          estadoAcademico: al.estado_academico ?? null,
          celdas: new Map(),
        });
      }
      // Superponer datos de sesiones sobre el matrix (nuevo formato agregado)
      for (const alumno of (planillaResp?.datos ?? [])) {
        const mid = Number(alumno.matricula_id);
        const entry = matrix.get(mid);
        if (!entry) continue;
        entry.faltasAcumuladas = Number(alumno.faltas_acumuladas) || 0;
        entry.porcentajeAsistencia = alumno.porcentaje_asistencia != null ? Number(alumno.porcentaje_asistencia) : null;
        if (alumno.estado_academico) entry.estadoAcademico = alumno.estado_academico;
        if (!entry.alumno || entry.alumno === 'Alumno sin nombre') entry.alumno = alumno.alumno;
        if (entry.ordenLista == null && alumno.orden_lista != null) {
          entry.ordenLista = Number(alumno.orden_lista);
        }
        for (const ses of (alumno.sesiones ?? [])) {
          entry.celdas.set(ses.sesion_id, {
            sesionId: ses.sesion_id,
            cursoId: cursoNum,
            fecha: ses.fecha,
            alumno: entry.alumno,
            matriculaId: mid,
            estadoAsistencia: ses.estado_asistencia,
            justificada: Boolean(ses.justificada),
            observaciones: ses.observaciones ?? null,
          });
        }
      }
      setPlanillaMatrix(matrix);
      setPendingChanges(new Map());
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo cargar la planilla';
      setSessionError(mensaje);
      toast.error(mensaje);
    } finally {
      setLoading(false);
    }
  }, [cursoId]);

  const handleRegistrar = useCallback(
    (matriculaId: number, sesionId: number, estado: 'presente' | 'ausente') => {
      const key = `${matriculaId}:${sesionId}`;
      setPlanillaMatrix((prev) => {
        const next = new Map(prev);
        const entry = next.get(matriculaId);
        if (!entry) return prev;
        const celda = entry.celdas.get(sesionId) ?? {
          sesionId,
          cursoId: Number(cursoId),
          fecha: '',
          alumno: entry.alumno,
          matriculaId,
          justificada: false,
        };
        entry.celdas.set(sesionId, { ...celda, estadoAsistencia: estado, justificada: false });
        return next;
      });
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(key, estado);
        return next;
      });
    },
    [cursoId]
  );

  const guardarCambiosLote = useCallback(async () => {
    if (!pendingChanges.size) return;

    const bySesion = new Map<number, Array<{ matriculaId: number; estado: 'presente' | 'ausente' }>>();
    for (const [key, estado] of pendingChanges) {
      const [matStr, sesStr] = key.split(':');
      const matriculaId = Number(matStr);
      const sesionId = Number(sesStr);
      let arr = bySesion.get(sesionId);
      if (!arr) { arr = []; bySesion.set(sesionId, arr); }
      arr.push({ matriculaId, estado });
    }

    for (const [sesionId, registros] of bySesion) {
      await apiFetch('/asistencias/registro-lote', {
        method: 'POST',
        body: JSON.stringify({
          sesionId,
          registros: registros.map((r) => ({
            matriculaId: r.matriculaId,
            estado: r.estado,
            justificada: false,
          })),
        }),
      });
    }

    setPendingChanges(new Map());
  }, [pendingChanges]);

  const descargarPlanillaLegal = useCallback(async () => {
    const cursoNum = Number(cursoId);
    if (!cursoId || Number.isNaN(cursoNum)) {
      toast.error('Selecciona un curso para generar la planilla legal.');
      return;
    }

    setGenerandoPdfLegal(true);
    try {
      await generarYAbrirPdf('/reportes/actas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cursoId: cursoNum,
          tipoActa: 'pdf_legal',
          periodo: mesAnio,
        }),
      });
      toast.success('Planilla legal generada correctamente.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar la planilla legal');
    } finally {
      setGenerandoPdfLegal(false);
    }
  }, [cursoId, mesAnio]);

  const getEstadoSiguiente = useCallback((estadoActual: 'presente' | 'ausente' | 'justificada' | null) => {
    if (estadoActual === 'presente') return 'ausente' as const;
    return 'presente' as const;
  }, []);

  const cargarJustificaciones = useCallback(async () => {
    if (!cursoId) {
      setJustificaciones([]);
      return;
    }

    const estadoQuery = justificacionEstado ? `&estado=${encodeURIComponent(justificacionEstado)}` : '';
    const cursoQuery = cursoId ? `cursoId=${Number(cursoId)}` : '';
    const qs = [cursoQuery, estadoQuery.slice(1)].filter(Boolean).join('&');
    const endpoint = qs ? `/asistencias/justificaciones?${qs}` : '/asistencias/justificaciones';

    setJustificacionesLoading(true);
    try {
      const resp = await apiFetch<ApiList<JustificacionRow>>(endpoint);
      setJustificaciones(resp?.datos ?? []);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo listar justificaciones';
      toast.error(mensaje);
      setJustificaciones([]);
    } finally {
      setJustificacionesLoading(false);
    }
  }, [cursoId, justificacionEstado]);

  const resolver = useCallback(
    async (justificacionId: number, accion: 'aprobar' | 'rechazar') => {
      setResolviendoId(justificacionId);
      try {
        await apiFetch(`/asistencias/justificaciones/${justificacionId}/resolucion`, {
          method: 'POST',
          body: JSON.stringify({
            accion,
            comentarios: comentariosRevision[justificacionId]?.trim() || undefined,
          }),
        });
        toast.success(`Justificación ${accion === 'aprobar' ? 'aprobada' : 'rechazada'}`);
        await cargarJustificaciones();
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : 'No se pudo resolver la justificación';
        toast.error(mensaje);
      } finally {
        setResolviendoId(null);
      }
    },
    [cargarJustificaciones, comentariosRevision]
  );

  const cambiarModalidad = useCallback(
    async (sesionId: number, nueva: 'presencial' | 'virtual') => {
      const s = sesiones.find((x) => x.id === sesionId);
      if (!s) {
        toast.error('Sesión no encontrada.');
        return;
      }
      if (s.estado.toLowerCase() === 'cerrada') {
        toast.error('La jornada está cerrada; no se puede cambiar la modalidad.');
        return;
      }
      setCambiandoModalidad(true);
      try {
        const actualizada = await apiFetch<Sesion>(`/asistencias/sesiones/${sesionId}/modalidad`, {
          method: 'PATCH',
          body: JSON.stringify({ modalidad: nueva }),
        });
        setSesiones((prev) => prev.map((x) => x.id === sesionId ? actualizada : x));
        setSesionModalidad((prev) => ({ ...prev, [sesionId]: nueva }));
        toast.success(`Modalidad cambiada a ${nueva === 'virtual' ? 'Virtual' : 'Presencial'}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo cambiar la modalidad');
      } finally {
        setCambiandoModalidad(false);
      }
    },
    [sesiones]
  );

  const cerrarSesionById = useCallback(async (sesionId: number) => {
    const s = sesiones.find((x) => x.id === sesionId);
    if (!s || s.estado.toLowerCase() === 'cerrada') { toast.error('La sesión ya está cerrada.'); return; }
    setCerrandoSesionId(sesionId);
    try {
      await guardarCambiosLote();
      const cerrada = await apiFetch<Sesion>(`/asistencias/sesiones/${sesionId}/cierre`, { method: 'POST' });
      setSesiones((prev) => prev.map((x) => x.id === sesionId ? cerrada : x));
      setSesionActivaId((prev) => prev === sesionId ? null : prev);
      toast.success('Lista cerrada. Se actualizó el porcentaje del curso.');
      void cargarPlanillaMes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cerrar la jornada');
    } finally {
      setCerrandoSesionId(null);
    }
  }, [sesiones, cargarPlanillaMes, guardarCambiosLote]);

  const cargarAusencias = useCallback(async (cId: string) => {
    if (!cId) { setAusencias([]); setAusenciasError(null); return; }
    setAusenciasLoading(true);
    setAusenciasError(null);
    try {
      const resp = await apiFetch<ApiList<AusenciaRow>>(`/asistencias/ausentes?cursoId=${Number(cId)}`);
      setAusencias(resp?.datos ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudieron cargar las ausencias';
      setAusenciasError(msg);
      setAusencias([]);
      toast.error(msg);
    } finally {
      setAusenciasLoading(false);
    }
  }, []);

  const enviarJustificacion = useCallback(async () => {
    if (!justifDiasSeleccionados.length || !justifMotivo.trim() || !justifArchivo) {
      toast.error('Selecciona al menos un día, completa el motivo y adjunta un PDF.');
      return;
    }
    setSubiendoJustif(true);
    try {
      // 1. Subir el archivo una sola vez
      const token = localStorage.getItem('token') ?? sessionStorage.getItem('token') ?? '';
      const formData = new FormData();
      formData.append('archivo', justifArchivo);
      const uploadResp = await fetch(`${API_BASE_URL}/asistencias/justificaciones/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (uploadResp.status === 401) {
        notifySessionExpired();
        throw new Error('Sesión expirada. Iniciá sesión de nuevo.');
      }
      if (!uploadResp.ok) {
        const err = await uploadResp.json().catch(() => ({}));
        throw new Error((err as any)?.mensaje ?? 'Error al subir el archivo');
      }
      const { url } = await uploadResp.json() as { url: string };

      // 2. Registrar una justificación por cada día seleccionado
      for (const diaKey of justifDiasSeleccionados) {
        const [sesionId, matriculaId] = diaKey.split(':').map(Number);
        // buscar asistencia_id si existe (puede ser null para filas sin registro)
        const ausenciaRow = ausencias.find((a) => a.sesion_id === sesionId && a.matricula_id === matriculaId);
        const body = ausenciaRow?.asistencia_id
          ? { asistenciaId: ausenciaRow.asistencia_id, motivo: justifMotivo.trim(), documentoUrl: url }
          : { sesionId, matriculaId, motivo: justifMotivo.trim(), documentoUrl: url };
        await apiFetch('/asistencias/justificaciones', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      toast.success(`${justifDiasSeleccionados.length} justificación/es registradas correctamente.`);
      setMostrarFormJustif(false);
      setJustifAlumnoBusqueda('');
      setJustifAlumnoSeleccionado(null);
      setJustifDiasSeleccionados([]);
      setJustifMotivo('');
      setJustifArchivo(null);
      await cargarAusencias(cursoId);
      await cargarJustificaciones();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la justificación');
    } finally {
      setSubiendoJustif(false);
    }
  }, [justifDiasSeleccionados, justifMotivo, justifArchivo, cursoId, cargarAusencias, cargarJustificaciones]);

  useEffect(() => {
    void cargarPlanillasAsignadas();
  }, [cargarPlanillasAsignadas]);

  useEffect(() => {
    if (!mostrarModuloJustificaciones && subView === 'justificaciones') {
      setSubView('planilla');
    }
  }, [mostrarModuloJustificaciones, subView]);

  useEffect(() => {
    if (subView !== 'planilla' || !cursoId || planillasLoading) return;
    void cargarPlanillaMes();
  }, [cursoId, subView, planillasLoading, cargarPlanillaMes]);

  useEffect(() => {
    if (subView !== 'justificaciones') {
      return;
    }
    void cargarJustificaciones();
    if (cursoId) void cargarAusencias(cursoId);
  }, [subView, cargarJustificaciones, cargarAusencias, cursoId]);

  // Pre-llenar la fecha y el mes con la fecha planificada del módulo (acotado al rango del módulo)
  useEffect(() => {
    if (!planillaSeleccionada) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const inicio = normalizeDate(planillaSeleccionada.fecha_inicio);
    const fin = normalizeDate(planillaSeleccionada.fecha_fin);
    let fechaDefault = inicio > hoy ? inicio : hoy;
    fechaDefault = clampFechaIso(fechaDefault, inicio, fin);
    setNuevaSesionFecha(fechaDefault);
    const minYm = yyyyMmDesdeFecha(inicio);
    const maxYm = yyyyMmDesdeFecha(fin);
    const rMin = minYm <= maxYm ? minYm : maxYm;
    const rMax = minYm <= maxYm ? maxYm : minYm;
    const ym = fechaDefault.slice(0, 7);
    setMesAnio(clampYyyyMm(ym, rMin, rMax));
  }, [planillaSeleccionada?.curso_id, planillaSeleccionada?.fecha_inicio, planillaSeleccionada?.fecha_fin]);

  /** Si el mes quedó fuera del módulo (p. ej. datos del curso se actualizaron), lo acota. */
  useEffect(() => {
    if (!rangoMesModulo) return;
    setMesAnio((prev) => {
      const next = clampYyyyMm(prev, rangoMesModulo.min, rangoMesModulo.max);
      return next === prev ? prev : next;
    });
  }, [rangoMesModulo?.min, rangoMesModulo?.max]);

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
          {cursoId ? (
            <span
              ref={planillaNombreMedirRef}
              className="pointer-events-none fixed top-0 left-0 z-0 translate-x-[120vw] text-sm font-medium px-3 whitespace-nowrap opacity-0"
              aria-hidden
            >
              {longestNombrePlanilla}
            </span>
          ) : null}
          <header className="flex-shrink-0 h-16 bg-[#132a52]/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 z-10">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="lg:hidden text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg p-1 transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menú"
              >
                <span className="material-symbols-outlined">menu</span>
              </button>
              <span className="material-symbols-outlined text-[#6b8bc3]">fact_check</span>
              <div>
                <p className="text-xs uppercase text-slate-400">Asistencias</p>
                <h1 className="text-xl font-semibold">
                  {subView === 'planilla' || !mostrarModuloJustificaciones
                    ? 'Planilla de Asistencia'
                    : 'Gestión de Justificaciones'}
                </h1>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Cargando...
              </div>
            ) : null}
          </header>

          <section className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
            <div className="rounded-xl border border-slate-800 bg-[#132a52] p-2 inline-flex gap-2">
              <button
                type="button"
                onClick={() => setSubView('planilla')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                  subView === 'planilla'
                    ? 'bg-primary text-[#f0f4f8]'
                    : 'text-[#9fb3d4] hover:bg-slate-800'
                }`}
              >
                 Planilla de Asistencia
              </button>
              {mostrarModuloJustificaciones ? (
                <button
                  type="button"
                  onClick={() => setSubView('justificaciones')}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                    subView === 'justificaciones'
                      ? 'bg-primary text-[#f0f4f8]'
                      : 'text-[#9fb3d4] hover:bg-slate-800'
                  }`}
                >
                   Justificaciones
                </button>
              ) : null}
            </div>

            {subView === 'planilla' ? <div className="flex-1 flex flex-col overflow-hidden gap-4 min-h-0">

            {/* Barra + KPI por encima de la tabla (z-index) */}
            <div className="relative z-30 flex flex-col gap-4 shrink-0">
            <div className="rounded-xl border border-slate-800 bg-[#132a52] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs uppercase text-slate-400">Planilla de asistencia</p>
                  <h2 className="text-lg font-semibold">{planillaSeleccionada?.materia ?? 'Selecciona un curso'}</h2>
                  {planillaSeleccionada ? (
                    <p className="text-xs text-slate-400">
                      {planillaSeleccionada.carrera} · {planillaSeleccionada.total_matriculas} alumnos
                      {' · '}
                      {(() => { const mes = new Date(`${planillaSeleccionada.fecha_inicio}T00:00:00`).getMonth() + 1; return mes <= 6 ? '1er Semestre' : '2do Semestre'; })()}
                    </p>
                  ) : null}
                </div>
                <div className="relative z-40 flex items-center gap-2 flex-wrap">
                  {/* Selector de curso */}
                  <AppSelect
                    className="min-w-[12rem]"
                    aria-label="Seleccionar curso"
                    value={cursoId}
                    onChange={setCursoId}
                    disabled={planillasLoading || !planillasAsignadas.length}
                    loading={planillasLoading}
                    placeholder="Selecciona un curso"
                    allowEmpty
                    emptyLabel="Selecciona un curso"
                    options={planillasAsignadas.map((item) => ({
                      value: String(item.curso_id),
                      label: item.materia,
                    }))}
                    triggerClassName="pl-3 pr-8 py-2 rounded-lg bg-white border border-slate-300 text-sm text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                  />
                  {/* Selector de mes */}
                  <input
                    type="month"
                    aria-label="Mes y año"
                    title="Solo meses dentro del dictado del módulo"
                    className="px-3 py-2 rounded-lg bg-[#132a52] border border-[#4f8cdb] text-sm text-[#e7eef9] disabled:opacity-50"
                    value={mesAnio}
                    min={rangoMesModulo?.min}
                    max={rangoMesModulo?.max}
                    disabled={!cursoId || !rangoMesModulo}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setMesAnio(rangoMesModulo ? clampYyyyMm(v, rangoMesModulo.min, rangoMesModulo.max) : v);
                    }}
                  />
                  <button
                    type="button"
                    className="btn-modern btn-modern-ghost btn-modern-sm"
                    onClick={() => void cargarPlanillaMes()}
                    disabled={loading || !cursoId}
                  >
                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                    {loading ? 'Cargando...' : 'Actualizar'}
                  </button>
                  <button
                    type="button"
                    className="btn-modern btn-modern-ghost btn-modern-sm"
                    onClick={() => void descargarPlanillaLegal()}
                    disabled={generandoPdfLegal || !cursoId}
                    title="Generar y abrir planilla legal PDF del mes seleccionado"
                  >
                    <span className="material-symbols-outlined text-[16px]">print</span>
                    {generandoPdfLegal ? 'Generando PDF...' : 'Imprimir planilla legal'}
                  </button>
                </div>
              </div>

              {!planillasLoading && !planillasError && planillasAsignadas.length === 0 ? (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-6 text-center">
                  <span className="material-symbols-outlined text-[40px] text-amber-300/90">event_busy</span>
                  <p className="mt-2 text-sm font-medium text-[#e7eef9]">No hay planillas</p>
                  <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
                    Si deberías ver cursos, confirmá con secretaría o coordinación académica que tengas planillas registradas.
                  </p>
                </div>
              ) : null}

              {/* Nueva sesión */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60 flex-wrap">
                <span className="text-xs text-slate-500">Nueva sesión:</span>
                <input
                  type="date"
                  aria-label="Fecha de nueva sesión"
                  title="Solo fechas dentro del dictado del módulo"
                  className="px-2 py-1 rounded-lg bg-[#132a52] border border-[#4f8cdb] text-sm text-[#e7eef9]"
                  value={nuevaSesionFecha}
                  min={planillaSeleccionada ? normalizeDate(planillaSeleccionada.fecha_inicio) : undefined}
                  max={planillaSeleccionada ? normalizeDate(planillaSeleccionada.fecha_fin) : undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!planillaSeleccionada) {
                      setNuevaSesionFecha(v);
                      return;
                    }
                    const lo = normalizeDate(planillaSeleccionada.fecha_inicio);
                    const hi = normalizeDate(planillaSeleccionada.fecha_fin);
                    setNuevaSesionFecha(clampFechaIso(v, lo, hi));
                  }}
                />
                {/* Selector Presencial / Virtual */}
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-600">
                  <button
                    type="button"
                    onClick={() => {
                      setNuevaSesionModalidad('presencial');
                      if (sesionActivaId) {
                        const act = sesiones.find((x) => x.id === sesionActivaId);
                        if (act && act.estado.toLowerCase() !== 'cerrada') {
                          void cambiarModalidad(sesionActivaId, 'presencial');
                        }
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-none ${
                      nuevaSesionModalidad === 'presencial'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">location_on</span>
                    Presencial
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNuevaSesionModalidad('virtual');
                      if (sesionActivaId) {
                        const act = sesiones.find((x) => x.id === sesionActivaId);
                        if (act && act.estado.toLowerCase() !== 'cerrada') {
                          void cambiarModalidad(sesionActivaId, 'virtual');
                        }
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-none border-l border-slate-600 ${
                      nuevaSesionModalidad === 'virtual'
                        ? 'bg-violet-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">videocam</span>
                    Virtual
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-modern btn-modern-primary btn-modern-sm"
                  disabled={creandoSesion || !cursoId || !nuevaSesionFecha || !!sesionListaAbierta}
                  title={
                    sesionListaAbierta
                      ? 'Hay una lista abierta. Usá «Cerrar lista» antes de tomar otra sesión.'
                      : undefined
                  }
                  onClick={async () => {
                    if (!cursoId || !nuevaSesionFecha) return;
                    const existente = sesionesDelMes.find(
                      (s) => normalizeDate(s.fecha) === normalizeDate(nuevaSesionFecha)
                    );
                    if (existente) {
                      if (existente.estado.toLowerCase() === 'cerrada') {
                        toast.error('La lista de ese día ya está cerrada', {
                          description: `Ya registraste y cerraste la lista del ${formatDateLabel(existente.fecha, true)}. Elegí otra fecha para tomar asistencia.`,
                        });
                        return;
                      }
                      setSesionActivaId(existente.id);
                      toast.success('Sesión reanudada. Podés seguir marcando asistencia.');
                      void cargarPlanillaMes();
                      return;
                    }
                    setCreandoSesion(true);
                    try {
                      const nuevaSesion = await apiFetch<Sesion>('/asistencias/sesiones', {
                        method: 'POST',
                        body: JSON.stringify({ cursoId: Number(cursoId), fecha: nuevaSesionFecha, modalidad: nuevaSesionModalidad }),
                      });
                      toast.success('Sesión creada. Todos presentes por defecto; marcá solo ausentes.');
                      setSesiones((prev) => [...prev, nuevaSesion]);
                      setSesionActivaId(nuevaSesion.id);
                      void cargarPlanillaMes();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'No se pudo crear la sesión');
                    } finally {
                      setCreandoSesion(false);
                    }
                  }}
                >
                  {creandoSesion ? 'Creando...' : 'Tomar lista'}
                </button>

                {sesionListaAbierta ? (
                  <button
                    type="button"
                    className="btn-modern btn-modern-sm flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white border-0 font-semibold shadow-md"
                    disabled={cerrandoSesionId === sesionListaAbierta.id}
                    onClick={() => void cerrarSesionById(sesionListaAbierta.id)}
                  >
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    {cerrandoSesionId === sesionListaAbierta.id ? 'Cerrando...' : 'Cerrar lista'}
                  </button>
                ) : null}
              </div>

              {planillasError ? (
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  {planillasError}
                </div>
              ) : null}
              {sessionError ? (
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  {sessionError}
                </div>
              ) : null}
            </div>

            {/* KPI chips */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Matrículas', value: planillaMatrix.size, color: 'border-slate-700 text-slate-300' },
                { label: 'Sesiones del mes', value: sesionesDelMes.length, color: 'border-slate-700 text-slate-300' },
                {
                  label: 'En riesgo',
                  value: resumen.evaluacionPendiente ? '—' : resumen.enRiesgo,
                  color: 'border-amber-500/40 text-[#ef8001]',
                  title: resumen.evaluacionPendiente
                    ? `Se evalúa al cerrar el 75% de las clases del módulo (${metricasModulo?.sesionesCerradas ?? 0}/${metricasModulo?.clasesMinimasParaEvaluar ?? '?'})`
                    : undefined,
                },
                {
                  label: 'Inhabilitados',
                  value: resumen.evaluacionPendiente ? '—' : resumen.inhabilitados,
                  color: 'border-rose-500/40 text-rose-300',
                  title: resumen.evaluacionPendiente
                    ? `Se evalúa al cerrar el 75% de las clases del módulo (${metricasModulo?.sesionesCerradas ?? 0}/${metricasModulo?.clasesMinimasParaEvaluar ?? '?'})`
                    : undefined,
                },
              ].map((k) => (
                <div
                  key={k.label}
                  title={'title' in k ? k.title : undefined}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${k.color} bg-[#132a52]`}
                >
                  <span className="font-bold">{k.value}</span> <span className="text-xs opacity-70">{k.label}</span>
                </div>
              ))}
              <div className="rounded-lg border border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-[#0f1f3d] dark:text-slate-300 px-3 py-1.5 text-xs inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded border text-xs font-bold bg-emerald-100 text-emerald-700 border-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-400/40">P</span>
                  Presente
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded border text-xs font-bold bg-rose-100 text-rose-700 border-rose-400 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-400/40">A</span>
                  Ausente
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded border text-xs font-bold bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-400/40">J</span>
                  Justificada
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-slate-400 dark:text-slate-600">—</span>
                  Sin marcar
                </span>
              </div>
            </div>
            </div>

            {/* Tabla tipo planilla (min-h-0: sticky thead funciona dentro de flex) */}
            <div className="relative z-0 rounded-xl border border-slate-800 bg-[#07101f] overflow-hidden flex-1 flex flex-col min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
                  <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  Cargando planilla...
                </div>
              ) : !cursoId ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
                  <span className="material-symbols-outlined text-[40px]">assignment</span>
                  <p>Selecciona un curso para ver la planilla</p>
                </div>
              ) : !sesionesDelMes.length && !planillaMatrix.size ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
                  <span className="material-symbols-outlined text-[40px]">calendar_month</span>
                  <p>No hay sesiones registradas para {mesAnio}</p>
                  <p className="text-xs">Agrega una sesión desde el formulario de arriba</p>
                </div>
              ) : !sesionesDelMes.length ? (
                <div className="overflow-auto flex-1 min-h-0">
                  <table className="text-sm border-collapse w-full">
                    <thead className="sticky top-0 z-50 bg-[#0d1b2e] border-b border-slate-800/40">
                      <tr>
                        <th
                          className="bg-[#0d1b2e] px-3 py-2 text-left border-b border-r border-slate-800/40 font-semibold text-slate-300 whitespace-nowrap"
                          style={{ width: stickyPlanillaLeft.nombreW, minWidth: stickyPlanillaLeft.nombreW }}
                        >
                          Apellidos y Nombres
                        </th>
                        <th className="bg-[#0d1b2e] px-0 py-2 border-b border-r border-slate-800/40 w-20 min-w-[5rem]">
                          <span className="flex w-full items-center justify-center font-semibold text-slate-300 text-xs">CI</span>
                        </th>
                        <th className="bg-[#0d1b2e] px-0 py-2 border-b border-r border-slate-800/40">
                          <span className="flex w-full items-center justify-center font-semibold text-slate-300 text-xs">Faltas</span>
                        </th>
                        <th className="bg-[#0d1b2e] px-0 py-2 border-b border-slate-800/40">
                          <span className="flex w-full items-center justify-center font-semibold text-slate-300 text-xs">% Asist.</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {alumnosOrdenados.map(([matriculaId, entry]) => {
                        const evaluado = evaluarAlumnoPlanilla(entry, sesiones, metricasModulo);
                        return (
                        <tr
                          key={matriculaId}
                          className={`border-t border-slate-800/40 hover:bg-slate-900/30 ${evaluado.estado === 'inhabilitado' ? 'planilla-fila-inhabilitado' : evaluado.estado === 'riesgo' ? 'planilla-fila-riesgo' : ''}`}
                          title={evaluado.tooltip}
                        >
                          <td
                            className="px-3 py-2 text-[#e7eef9] font-medium align-middle whitespace-nowrap"
                            style={{ width: stickyPlanillaLeft.nombreW, minWidth: stickyPlanillaLeft.nombreW, maxWidth: stickyPlanillaLeft.nombreW }}
                          >
                            {formatoNombreLegible(entry.alumno)}
                          </td>
                          <td className="px-0 py-2 align-middle w-20 min-w-[5rem]">
                            <span className="flex w-full items-center justify-center text-xs text-slate-400">
                              {entry.documento}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={`text-xs font-bold planilla-celda-metrica ${evaluado.estado === 'regular' ? 'text-slate-300' : ''}`}>
                              {evaluado.faltas}
                            </span>
                          </td>
                          <td className="px-0 py-2 align-middle">
                            <span className="flex w-full items-center justify-center text-xs text-slate-300 tabular-nums">
                              {entry.porcentajeAsistencia != null ? `${entry.porcentajeAsistencia}%` : '—'}
                            </span>
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                  <div className="px-4 py-3 text-center text-xs text-slate-500 border-t border-slate-800/40">
                    Sin sesiones en {mesAnio} — agrega una desde el formulario de arriba para registrar asistencia
                  </div>
                </div>
              ) : (
                <div className="overflow-auto flex-1 min-h-0 isolate rounded-t-xl">
                  <table
                    className="text-sm border-separate border-spacing-0 w-full min-w-max table-fixed"
                    style={{ minWidth: anchoMinPlanillaTabla }}
                  >
                    <colgroup>
                      <col style={{ width: STICKY_COL_NUM }} />
                      <col style={{ width: stickyPlanillaLeft.nombreW }} />
                      <col style={{ width: STICKY_COL_CI }} />
                      <col style={{ width: STICKY_COL_FALTAS }} />
                      <col style={{ width: STICKY_COL_PCT }} />
                      {columnasDelMes.map((col) => (
                        <col key={col.fecha} style={{ width: PLANILLA_SESION_COL_PX }} />
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-[70] bg-[#0d1b2e]">
                      <tr>
                        <th className="sticky top-0 left-0 z-[61] bg-[#0d1b2e] px-1 py-2 text-center border-l border-t border-b border-r border-slate-800/40 rounded-tl-xl font-semibold text-slate-500 text-xs w-[36px] min-w-[36px] max-w-[36px] whitespace-nowrap align-middle">
                          #
                        </th>
                        <th
                          className="sticky top-0 left-[36px] z-[60] bg-[#0d1b2e] px-3 py-2 text-left border-t border-b border-r border-slate-800/40 font-semibold text-slate-300 whitespace-nowrap align-middle overflow-hidden"
                          style={{
                            width: stickyPlanillaLeft.nombreW,
                            minWidth: stickyPlanillaLeft.nombreW,
                            maxWidth: stickyPlanillaLeft.nombreW,
                          }}
                        >
                          Apellidos y Nombres
                        </th>
                        <th
                          className="sticky top-0 z-[59] bg-[#0d1b2e] px-0 py-2 border-t border-b border-r border-slate-800/40 w-[64px] min-w-[64px] max-w-[64px] whitespace-nowrap align-middle"
                          style={{ left: stickyPlanillaLeft.ci }}
                        >
                          <span className="flex w-full items-center justify-center font-semibold text-slate-300 text-sm">
                            CI
                          </span>
                        </th>
                        <th
                          className="sticky top-0 z-[58] bg-[#0d1b2e] px-0 py-2 border-t border-b border-r border-slate-800/40 w-[50px] min-w-[50px] max-w-[50px] whitespace-nowrap align-middle"
                          style={{ left: stickyPlanillaLeft.faltas }}
                        >
                          <span className="flex w-full items-center justify-center font-semibold text-slate-400 text-sm">
                            Faltas
                          </span>
                        </th>
                        <th
                          className={`sticky top-0 z-[57] bg-[#0d1b2e] px-0 py-2 border-t border-b border-r border-slate-800/40 font-semibold text-slate-400 text-sm whitespace-nowrap align-middle overflow-hidden ${columnasDelMes.length === 0 ? 'rounded-tr-xl' : ''}`}
                          style={{ left: stickyPlanillaLeft.pct, width: STICKY_COL_PCT, minWidth: STICKY_COL_PCT, maxWidth: STICKY_COL_PCT }}
                        >
                          <span className="flex w-full items-center justify-center">%</span>
                        </th>
                        {columnasDelMes.map((col, colIdx) => {
                          const f = new Date(`${col.fecha}T00:00:00`);
                          const s = col.sesion;
                          const esCerrada = s ? s.estado.toLowerCase() === 'cerrada' : false;
                          const esActiva = s ? sesionActivaId === s.id : false;
                          const dimmed = sesionActivaId !== null && !esActiva;
                          const modalidadActual = s ? (sesionModalidad[s.id] ?? s.modalidad) : col.modalidadDefault;
                          const isUltimaFecha = colIdx === columnasDelMes.length - 1;
                          const tituloColumna =
                            col.esListaExcepcional && s
                              ? `Clase reprogramada (${formatDateLabel(col.fecha)}). Fuera del calendario habitual Lun–Jue.`
                              : undefined;
                          return (
                            <th
                              key={col.fecha}
                              title={tituloColumna}
                              className={`sticky top-0 z-40 px-1 py-2 align-middle text-center border-t border-b border-r border-slate-800/40 min-w-[56px] transition-none ${
                                esActiva ? 'bg-[#0d2540]' : 'bg-[#0d1b2e]'
                              } ${isUltimaFecha ? 'rounded-tr-xl' : ''}`}
                            >
                              <div className={`flex flex-col items-center gap-0.5 ${dimmed ? 'opacity-45' : ''}`}>
                                {s ? (
                                  esActiva && !esCerrada ? (
                                    <button
                                      type="button"
                                      title={`Modalidad: ${modalidadActual === 'presencial' ? 'Presencial — clic para cambiar a Virtual' : 'Virtual — clic para cambiar a Presencial'}`}
                                      disabled={cambiandoModalidad}
                                      onClick={() => void cambiarModalidad(s.id, modalidadActual === 'presencial' ? 'virtual' : 'presencial')}
                                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-sm font-bold leading-none shadow-sm transition-opacity hover:opacity-80 disabled:opacity-50 ${
                                        modalidadActual === 'presencial'
                                          ? 'text-white bg-emerald-600'
                                          : 'text-white bg-violet-600'
                                      }`}
                                    >
                                      <span className="material-symbols-outlined text-sm leading-none">
                                        {modalidadActual === 'presencial' ? 'location_on' : 'videocam'}
                                      </span>
                                      {modalidadActual === 'presencial' ? 'P' : 'V'}
                                    </button>
                                  ) : (
                                    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-sm font-bold leading-none shadow-sm ${
                                      modalidadActual === 'presencial'
                                        ? 'text-white bg-emerald-600'
                                        : 'text-white bg-violet-600'
                                    }`}>
                                      <span className="material-symbols-outlined text-sm leading-none">
                                        {modalidadActual === 'presencial' ? 'location_on' : 'videocam'}
                                      </span>
                                      {modalidadActual === 'presencial' ? 'P' : 'V'}
                                    </span>
                                  )
                                ) : null}
                                <span className={`text-sm font-bold ${s ? 'text-slate-300' : 'text-slate-600'}`}>
                                  {f.getDate()}
                                </span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {alumnosOrdenados.map(([matriculaId, entry], idx) => {
                        const evaluado = evaluarAlumnoPlanilla(entry, sesiones, metricasModulo);
                        const filaClass = claseFilaPlanilla(evaluado.estado, idx);
                        const celdaBase = 'border-b border-r border-slate-800/40';
                        const celdaFila =
                          evaluado.estado === 'riesgo' || evaluado.estado === 'inhabilitado'
                            ? 'planilla-celda-fila'
                            : '';
                        return (
                          <tr
                            key={matriculaId}
                            className={`planilla-fila ${filaClass}`}
                            title={evaluado.tooltip}
                          >
                            {/* # */}
                            <td
                              className={`sticky left-0 z-[57] px-1 py-2.5 text-center text-xs w-[36px] min-w-[36px] max-w-[36px] border-l ${celdaBase} ${celdaFila} planilla-celda-indice planilla-celda-texto`}
                            >
                              <span className="opacity-70">{entry.ordenLista ?? idx + 1}</span>
                            </td>
                            {/* Nombre */}
                            <td
                              className={`sticky left-[36px] z-[56] px-3 py-2.5 ${celdaBase} ${celdaFila} align-middle overflow-hidden`}
                              style={{
                                width: stickyPlanillaLeft.nombreW,
                                minWidth: stickyPlanillaLeft.nombreW,
                                maxWidth: stickyPlanillaLeft.nombreW,
                              }}
                            >
                              <span className="planilla-celda-texto font-medium text-sm whitespace-nowrap block">
                                {formatoNombreLegible(entry.alumno)}
                              </span>
                            </td>
                            {/* CI */}
                            <td
                              className={`sticky z-[55] px-0 py-2.5 w-[64px] min-w-[64px] max-w-[64px] ${celdaBase} ${celdaFila} align-middle`}
                              style={{ left: stickyPlanillaLeft.ci }}
                            >
                              <span className="flex w-full items-center justify-center text-sm planilla-celda-texto opacity-80">
                                {entry.documento || '—'}
                              </span>
                            </td>
                            {/* Faltas */}
                            <td
                              className={`sticky z-[54] px-2 py-2.5 text-center w-[50px] min-w-[50px] max-w-[50px] ${celdaBase} ${celdaFila}`}
                              style={{ left: stickyPlanillaLeft.faltas }}
                            >
                              <span className="text-sm font-bold planilla-celda-metrica">
                                {evaluado.faltas}
                              </span>
                            </td>
                            {/* % Asistencia */}
                            <td
                              className={`sticky z-[53] px-0 py-2.5 ${celdaBase} ${celdaFila} overflow-hidden align-middle`}
                              style={{
                                left: stickyPlanillaLeft.pct,
                                width: STICKY_COL_PCT,
                                minWidth: STICKY_COL_PCT,
                                maxWidth: STICKY_COL_PCT,
                              }}
                            >
                              <span className={`flex w-full items-center justify-center text-sm tabular-nums font-semibold ${evaluado.estado === 'regular' ? 'text-slate-300' : 'planilla-celda-metrica'}`}>
                                {entry.porcentajeAsistencia != null ? `${entry.porcentajeAsistencia}%` : '—'}
                              </span>
                            </td>
                            {/* Celdas de cada columna (día lectivo) */}
                            {columnasDelMes.map((col) => {
                              const s = col.sesion;
                              if (!s) {
                                return (
                                  <td
                                    key={col.fecha}
                                    title="Día lectivo sin sesión — no se toma lista ni computa ausencias."
                                    className={`px-1 py-1.5 ${celdaBase} ${celdaFila} text-center min-w-[56px]`}
                                  >
                                    <span className="planilla-celda-texto opacity-50 text-[10px] font-black select-none">—</span>
                                  </td>
                                );
                              }

                              const celda = entry.celdas.get(s.id);
                              const estado = celda?.estadoAsistencia ?? null;
                              const cerrada = s.estado.toLowerCase() === 'cerrada';
                              const siguiente = getEstadoSiguiente(estado);
                              const esActiva = sesionActivaId === s.id;
                              const dimmed = sesionActivaId !== null && !esActiva;

                              const cellLabel = estado === 'presente' ? 'P'
                                : estado === 'ausente' ? 'A'
                                : estado === 'justificada' ? 'J'
                                : '-';

                              const badgeCerradaClases =
                                estado === 'presente'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-400/40'
                                  : estado === 'ausente'
                                    ? 'bg-rose-100 text-rose-800 border-rose-400 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-400/40'
                                    : estado === 'justificada'
                                      ? 'bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-400/40'
                                      : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/70 dark:text-slate-300 dark:border-slate-600';

                              return (
                                <td
                                  key={col.fecha}
                                  className={`px-1 py-1.5 ${celdaBase} ${celdaFila} text-center min-w-[56px] transition-opacity ${dimmed ? 'opacity-40' : ''}`}
                                >
                                  {cerrada ? (
                                    estado === null ? (
                                      <span className="text-slate-600 text-[10px] font-black">—</span>
                                    ) : (
                                      <span
                                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold border text-sm ${badgeCerradaClases}`}
                                      >
                                        {cellLabel}
                                      </span>
                                    )
                                  ) : estado === 'justificada' ? (
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold border text-amber-900 bg-amber-100 border-amber-400 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30">J</span>
                                  ) : (
                                    <div className="flex justify-center">
                                      <button
                                        type="button"
                                        title={`Estado actual: ${estado === 'presente' ? 'Presente' : estado === 'ausente' ? 'Ausente' : 'Sin marcar'}. Clic para marcar ${siguiente === 'presente' ? 'Presente' : 'Ausente'}.`}
                                        className={`h-8 w-8 rounded-lg font-black inline-flex items-center justify-center transition-transform duration-100 hover:scale-[1.02] active:scale-[0.98] ${
                                          estado === 'presente'
                                            ? 'text-sm border bg-emerald-100 text-emerald-700 border-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-400/40'
                                            : estado === 'ausente'
                                              ? 'text-sm border bg-rose-100 text-rose-700 border-rose-400 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-400/40'
                                              : 'text-[10px] border-0 bg-transparent text-[#0a0a0a] hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400'
                                        }`}
                                        onClick={() => handleRegistrar(matriculaId, s.id, siguiente)}
                                      >
                                        {estado === 'presente' ? 'P' : estado === 'ausente' ? 'A' : '—'}
                                      </button>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {!alumnosOrdenados.length && !loading ? (
                        <tr>
                          <td colSpan={columnasDelMes.length + 5} className="py-10 text-center text-slate-500 text-sm">
                            No hay alumnos matriculados en este curso.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            </div> : null}

            {mostrarModuloJustificaciones && subView === 'justificaciones' ? <div className="flex-1 overflow-auto space-y-4">

              {/* Formulario nueva justificación */}
              <div className="rounded-xl border border-slate-800 bg-[#132a52] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                  <div>
                    <p className="text-xs uppercase text-slate-400">Nueva justificación</p>
                    <h3 className="text-lg font-semibold">Registrar justificativo de inasistencia</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <AppSelect
                      aria-label="Seleccionar curso para justificación"
                      value={cursoId}
                      onChange={(v) => {
                        setCursoId(v);
                        void cargarAusencias(v);
                      }}
                      disabled={planillasLoading || !planillasAsignadas.length}
                      placeholder="Selecciona una planilla"
                      options={planillasAsignadas.map((item) => ({
                        value: String(item.curso_id),
                        label: item.materia,
                      }))}
                      triggerClassName="pl-3 pr-8 py-2 rounded-lg bg-white border border-slate-300 text-sm text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                    />
                    <button
                      type="button"
                      className="btn-modern btn-modern-primary btn-modern-sm"
                      onClick={() => {
                        if (mostrarFormJustif) {
                          setJustifAlumnoBusqueda('');
                          setJustifAlumnoSeleccionado(null);
                          setJustifDiasSeleccionados([]);
                          setJustifMotivo('');
                          setJustifArchivo(null);
                        } else {
                          // cargar ausencias si aún no están cargadas para este curso
                          void cargarAusencias(cursoId);
                        }
                        setMostrarFormJustif((v) => !v);
                      }}
                      disabled={!cursoId}
                    >
                      <span className="material-symbols-outlined text-[16px]">{mostrarFormJustif ? 'expand_less' : 'add'}</span>
                      {mostrarFormJustif ? 'Cancelar' : 'Nueva justificación'}
                    </button>
                  </div>
                </div>

                {mostrarFormJustif ? (
                  <div className="p-4 space-y-5">

                    {/* Paso 1: Buscar alumno */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold">1</span>
                        Buscar alumno
                      </p>
                      <div className="space-y-2">
                          <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">search</span>
                            <input
                              type="text"
                              className="w-full pl-9 pr-4 py-2 rounded-lg bg-[#132a52] border border-[#4f8cdb] focus:border-primary focus:outline-none text-sm text-[#e7eef9]"
                              placeholder="Buscar por nombre o CI..."
                              value={justifAlumnoBusqueda}
                              onChange={(e) => {
                                setJustifAlumnoBusqueda(e.target.value);
                                setJustifAlumnoSeleccionado(null);
                                setJustifDiasSeleccionados([]);
                              }}
                            />
                          </div>
                          <div className="max-h-52 overflow-y-auto space-y-1.5 py-0.5">
                            {ausenciasLoading ? (
                              <p className="px-4 py-3 text-sm text-slate-500 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                Cargando ausencias...
                              </p>
                            ) : ausenciasError ? (
                              <div className="px-4 py-3 flex items-start gap-2 text-rose-300 text-sm">
                                <span className="material-symbols-outlined text-[16px] mt-0.5">error</span>
                                <div>
                                  <p className="font-medium">Error al cargar ausencias</p>
                                  <p className="text-xs text-rose-400">{ausenciasError}</p>
                                  <button
                                    type="button"
                                    className="mt-1 text-xs text-blue-400 hover:underline"
                                    onClick={() => void cargarAusencias(cursoId)}
                                  >
                                    Reintentar
                                  </button>
                                </div>
                              </div>
                            ) : !alumnosFiltrados.length ? (
                              <p className="px-4 py-3 text-sm text-slate-500">
                                {justifAlumnoBusqueda.trim()
                                  ? `Sin resultados para «${justifAlumnoBusqueda}».`
                                  : 'No hay alumnos matriculados en este curso.'}
                              </p>
                            ) : alumnosFiltrados.map((al) => (
                              <button
                                key={al.matriculaId}
                                type="button"
                                onClick={() => {
                                  setJustifAlumnoSeleccionado(al.matriculaId);
                                  setJustifDiasSeleccionados([]);
                                }}
                                className={`group w-full flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-all
                                  ${justifAlumnoSeleccionado === al.matriculaId
                                    ? 'border-primary/50 bg-primary/15 ring-1 ring-primary/25 shadow-sm'
                                    : 'border-slate-700/60 bg-[#0d1b2e] hover:border-slate-500 hover:bg-[#132a52]'}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-[13px] font-semibold text-[#e7eef9] leading-snug tracking-tight whitespace-normal break-words">
                                    {formatoNombreLegible(al.alumno)}
                                  </p>
                                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                                    <span className="material-symbols-outlined text-[13px] leading-none text-slate-500 shrink-0">id_card</span>
                                    <span>
                                      CI <span className="tabular-nums text-slate-400">{al.documento}</span>
                                    </span>
                                  </p>
                                </div>
                                <span className="shrink-0 inline-flex items-center rounded-md border border-rose-500/45 bg-rose-500/18 px-2 py-0.5 text-[10px] font-semibold text-rose-100 shadow-sm shadow-rose-950/30">
                                  {al.dias.length} {al.dias.length === 1 ? 'falta' : 'faltas'}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                    </div>

                    {/* Paso 2: Seleccionar días */}
                    {justifAlumnoSeleccionado !== null ? (() => {
                      const alumno = alumnosConAusencias.find((a) => a.matriculaId === justifAlumnoSeleccionado);
                      if (!alumno) return null;
                      return (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold">2</span>
                            Días a justificar —
                            <span className="text-slate-300 normal-case font-medium">{formatoNombreLegible(alumno.alumno)}</span>
                          </p>
                          <div className="rounded-lg border border-slate-700/60 bg-[#0d1b2e] p-3">
                            {!alumno.dias.length ? (
                              <p className="text-sm text-slate-500">
                                Este alumno no tiene inasistencias sin justificar registradas.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {[...alumno.dias].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((d) => {
                                  const diaKey = `${d.sesion_id}:${d.matricula_id}`;
                                  const checked = justifDiasSeleccionados.includes(diaKey);
                                  return (
                                    <button
                                      key={diaKey}
                                      type="button"
                                      onClick={() => setJustifDiasSeleccionados((prev) =>
                                        checked ? prev.filter((k) => k !== diaKey) : [...prev, diaKey]
                                      )}
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${checked
                                          ? 'bg-primary/20 border-primary text-[#e7eef9]'
                                          : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}
                                    >
                                      <span className={`material-symbols-outlined text-[15px] ${checked ? 'text-primary' : 'text-slate-600'}`}>
                                        {checked ? 'check_box' : 'check_box_outline_blank'}
                                      </span>
                                      {new Date(`${d.fecha}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {justifDiasSeleccionados.length > 0 ? (
                              <p className="mt-2 text-xs text-slate-500">
                                {justifDiasSeleccionados.length} {justifDiasSeleccionados.length === 1 ? 'día seleccionado' : 'días seleccionados'}
                              </p>
                            ) : alumno.dias.length > 0 ? (
                              <p className="mt-2 text-xs text-slate-600">Haz clic en los días que quieres justificar.</p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })() : null}

                    {/* Paso 3: Motivo + PDF */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold">3</span>
                        Completar datos
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex flex-col gap-1 text-sm">
                          <span className="text-slate-400 text-xs uppercase">Motivo</span>
                          <textarea
                            className="px-3 py-2 rounded-lg bg-[#132a52] border border-[#4f8cdb] text-sm resize-none h-[80px] text-[#e7eef9]"
                            placeholder="Describe el motivo de la inasistencia..."
                            value={justifMotivo}
                            onChange={(e) => setJustifMotivo(e.target.value)}
                            maxLength={500}
                          />
                        </label>
                        <div className="flex flex-col gap-1 text-sm">
                          <span className="text-slate-400 text-xs uppercase">Documento justificativo (PDF)</span>
                          <div
                            className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed h-[80px] min-w-0
                              ${justifArchivo ? 'border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-500/10' : 'border-slate-600 bg-[#0d1b2e] hover:border-slate-500 hover:bg-[#132a52]'}`}
                          >
                            <label
                              htmlFor="justif-file-input"
                              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                            >
                              <span className={`material-symbols-outlined shrink-0 text-[24px] ${justifArchivo ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {justifArchivo ? 'task' : 'upload_file'}
                              </span>
                              <div className="min-w-0">
                                {justifArchivo ? (
                                  <>
                                    <p className="text-emerald-300 font-medium text-sm truncate">{justifArchivo.name}</p>
                                    <p className="text-slate-500 text-xs">{(justifArchivo.size / 1024).toFixed(1)} KB</p>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-slate-300 text-sm">Haz clic para adjuntar</p>
                                    <p className="text-slate-500 text-xs">PDF · máx. 10 MB</p>
                                  </>
                                )}
                              </div>
                            </label>
                            {justifArchivo ? (
                              <button
                                type="button"
                                className="ml-auto shrink-0 text-slate-500 hover:text-rose-400"
                                onClick={() => setJustifArchivo(null)}
                              >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                              </button>
                            ) : null}
                          </div>
                          <input
                            id="justif-file-input"
                            type="file"
                            accept="application/pdf"
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              setJustifArchivo(f);
                              e.target.value = '';
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="btn-modern btn-modern-primary"
                        onClick={() => void enviarJustificacion()}
                        disabled={subiendoJustif || !justifDiasSeleccionados.length || !justifMotivo.trim() || !justifArchivo}
                      >
                        {subiendoJustif
                          ? 'Enviando...'
                          : `Registrar justificación${justifDiasSeleccionados.length > 1 ? ` (${justifDiasSeleccionados.length} días)` : ''}`}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Bandeja de revisión */}
              <div className="rounded-xl border border-slate-800 bg-[#132a52] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 gap-3 flex-wrap">
                  <div>
                    <p className="text-xs uppercase text-slate-400">Historial</p>
                    <h3 className="text-lg font-semibold">Bandeja de revisión y resolución</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <AppSelect
                      aria-label="Filtrar justificaciones por estado"
                      value={justificacionEstado}
                      onChange={(v) => setJustificacionEstado(v as '' | JustificacionEstado)}
                      allowEmpty
                      emptyLabel="Todos los estados"
                      options={[
                        { value: 'pendiente', label: 'Pendiente' },
                        { value: 'aprobada', label: 'Aprobada' },
                        { value: 'rechazada', label: 'Rechazada' },
                      ]}
                      triggerClassName="px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-black dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                    />
                    <button
                      type="button"
                      className="btn-modern btn-modern-ghost btn-modern-sm"
                      onClick={() => void cargarJustificaciones()}
                      disabled={justificacionesLoading}
                    >
                      {justificacionesLoading ? 'Actualizando...' : 'Actualizar'}
                    </button>
                  </div>
                </div>
                <div className="overflow-auto max-h-[420px]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[#0d1b2e] text-[#9fb3d4] sticky top-0 z-10">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">Alumno</th>
                        <th className="text-left px-4 py-3 font-semibold">Curso</th>
                        <th className="text-left px-4 py-3 font-semibold">Motivo</th>
                        <th className="text-left px-4 py-3 font-semibold">Fechas</th>
                        <th className="text-left px-4 py-3 font-semibold">Estado</th>
                        {puedeResolverJustificaciones ? (
                          <th className="text-right px-4 py-3 font-semibold">Acciones</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {justificacionesLoading ? (
                        <tr>
                          <td colSpan={puedeResolverJustificaciones ? 6 : 5} className="px-4 py-6 text-center text-slate-400">Cargando justificaciones...</td>
                        </tr>
                      ) : null}
                      {!justificacionesLoading && !justificaciones.length ? (
                        <tr>
                          <td colSpan={puedeResolverJustificaciones ? 6 : 5} className="px-4 py-6 text-center text-slate-500">
                            {cursoId ? 'No hay justificaciones para el filtro actual.' : 'Selecciona una planilla para revisar justificaciones.'}
                          </td>
                        </tr>
                      ) : null}
                      {!justificacionesLoading &&
                        agruparJustificacionesPorCarga(justificaciones, claveGrupoJustificacionCarga).map((g) => {
                          const j = g.representante;
                          const pendiente = j.estado_revision === 'pendiente';
                          const resolviendo = g.ids.some((id) => resolviendoId === id);
                          return (
                            <tr key={g.ids.join('-')} className="border-t border-slate-800 hover:bg-[#0d1b2e]/60 align-top">
                              <td className="px-4 py-3 text-[#e7eef9]">
                                <div className="font-medium">{formatoNombreLegible(j.alumno)}</div>
                                <div className="text-xs text-slate-500">Matrícula #{j.matricula_id}</div>
                              </td>
                              <td className="px-4 py-3 text-[#9fb3d4]">
                                <div>#{j.curso_id}</div>
                                <div className="text-xs text-slate-500">{j.materia}</div>
                              </td>
                              <td className="px-4 py-3 text-[#9fb3d4] max-w-[240px]">
                                <p className="line-clamp-2">{j.motivo}</p>
                                {j.documento_url ? (
                                  <a
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      void abrirDocumento(j.documento_url).catch((err) =>
                                        toast.error(err instanceof Error ? err.message : 'No se pudo abrir el PDF')
                                      );
                                    }}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                                    Ver PDF
                                  </a>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-[#9fb3d4] text-xs">
                                {[...g.fechas].sort().map((f) => (
                                  <span key={f} className="inline-block mr-1 mb-1 px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300">
                                    {new Date(`${normalizeDate(f)}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                  </span>
                                ))}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border ${
                                    j.estado_revision === 'aprobada'
                                      ? 'bg-emerald-500/10 text-emerald-100 border-emerald-500/30'
                                      : j.estado_revision === 'rechazada'
                                        ? 'bg-rose-500/10 text-rose-100 border-rose-500/30'
                                        : 'bg-amber-500/10 text-amber-100 border-amber-500/30'
                                  }`}
                                >
                                  {j.estado_revision}
                                </span>
                                {!pendiente && j.comentarios_revision ? (
                                  <p className="text-xs text-slate-500 mt-1">{j.comentarios_revision}</p>
                                ) : null}
                              </td>
                              {puedeResolverJustificaciones ? (
                                <td className="px-4 py-3 text-right">
                                  {pendiente ? (
                                    <div className="space-y-2">
                                      <input
                                        className="w-full px-2 py-1 rounded-lg bg-[#132a52] border border-[#4f8cdb] text-xs text-[#e7eef9]"
                                        placeholder="Comentario (opcional)"
                                        value={comentariosRevision[j.id] ?? ''}
                                        onChange={(e) =>
                                          setComentariosRevision((prev) => ({ ...prev, [j.id]: e.target.value }))
                                        }
                                      />
                                      <div className="inline-flex gap-2">
                                        <button
                                          className="btn-modern btn-modern-success btn-modern-xs"
                                          onClick={() => void Promise.all(g.ids.map((id) => resolver(id, 'aprobar')))}
                                          disabled={resolviendo}
                                        >
                                          Aprobar
                                        </button>
                                        <button
                                          className="btn-modern btn-modern-danger btn-modern-xs"
                                          onClick={() => void Promise.all(g.ids.map((id) => resolver(id, 'rechazar')))}
                                          disabled={resolviendo}
                                        >
                                          Rechazar
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-500">{j.comentarios_revision ?? 'Sin comentarios'}</span>
                                  )}
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div> : null}
          </section>
        </main>
      </div>
    </div>
  );
}

