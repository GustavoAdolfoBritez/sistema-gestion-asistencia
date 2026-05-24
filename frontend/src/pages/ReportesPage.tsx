import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { ReportesCursoPicker } from '../components/reportes/ReportesCursoPicker';
import { ScopeSelector, ScopeSelectorSkeleton, useAutoAssignScopeId } from '../components/ScopeSelector';
import { calcularContextoSelectorListo, deriveAlcanceVisual } from '../hooks/useAlcanceVisual';
import { AppSelect, appSelectDarkSurfaceClass } from '../components/ui/app-select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useMisAlcances } from '../hooks/useMisAlcances';
import { abrirDocumento, apiFetch, generarYAbrirPdf, toastApiError } from '../utils/api';
import { formatDateTime24 } from '../utils/datetime';
import { puedeEjecutarCierreMensual } from '../utils/rbac';
import { readStoredUser } from '../utils/session-user';

interface Props {
  onLogout?: () => void;
}

interface ApiList<T> {
  total: number;
  datos: T[];
}

interface Acta {
  id: number;
  tipo_acta: string;
  curso_id: number;
  materia: string;
  generado_en: string;
  url_documento: string;
}

interface Habilitado {
  matricula_id: number;
  alumno: string;
  porcentaje_final: number;
  habilitado: boolean;
}

interface ConsolidadoRiesgoItem {
  periodo: string;
  curso_id: number;
  facultad: string;
  carrera: string;
  semestre: number;
  materia: string;
  alumno: string;
  numero_documento: string;
  porcentaje_asistencia: number;
  faltas_acumuladas: number;
  estado_consolidado: 'INHABILITADO';
}

interface AusentismoAgregadoItem {
  facultad: string;
  carrera: string;
  totalCursos: number;
  totalSesiones: number;
  totalFaltas: number;
  promedioAusentismo: number;
  promedioAsistencia: number;
  nivel: string;
}

const MESES_REPORTE_LABELS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

interface ValidacionCierre {
  id: string;
  titulo: string;
  estado: 'ok' | 'warning' | 'blocked' | 'pendiente';
  detalle: string;
}

interface ChecklistCierre {
  cursoId: number;
  moduloId: number;
  periodo: string;
  materia: string;
  estadoModulo: string;
  habilitadosCount: number;
  actaHabilitadosGenerada: boolean;
  pdfLegalGenerado: boolean;
  estadisticaGenerada: boolean;
  validaciones: ValidacionCierre[];
  puedeCerrar: boolean;
}

interface Carrera {
  id: number;
  nombre: string;
  facultad_id?: number;
  facultad?: string;
}

type ReporteTab = 'cierre' | 'consolidado' | 'ausentismo';

interface CursoOpcion {
  id: number;
  materia?: string;
  codigo_materia?: string;
  docente?: string;
  anio?: number;
  mes?: number;
  carrera_id?: number;
  carrera?: string;
  estado_modulo?: string;
}

const selectReportesTriggerClass = appSelectDarkSurfaceClass;

export function ReportesPage({ onLogout }: Props) {
  const puedeCerrarModulo = puedeEjecutarCierreMensual(readStoredUser()?.roles);
  const { alcance, listo: alcanceListo } = useMisAlcances();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reporteTab, setReporteTab] = useState<ReporteTab>('cierre');
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [cierrePasswordConfirm, setCierrePasswordConfirm] = useState('');
  const [consolidado, setConsolidado] = useState<ConsolidadoRiesgoItem[]>([]);
  const [consolidadoLoading, setConsolidadoLoading] = useState(false);
  const [consolidadoPdfLoading, setConsolidadoPdfLoading] = useState(false);
  const [ausentismoPdfLoading, setAusentismoPdfLoading] = useState(false);
  const [ausentismoDatos, setAusentismoDatos] = useState<AusentismoAgregadoItem[]>([]);
  const [ausentismoDatosLoading, setAusentismoDatosLoading] = useState(false);
  /** Periodo mensual exclusivo del PDF Fac/Carr (no usa curso ni semestre del plan). */
  const [ausentismoMes, setAusentismoMes] = useState(() =>
    String(new Date().getMonth() + 1).padStart(2, '0')
  );
  const [ausentismoAnio, setAusentismoAnio] = useState(() => String(new Date().getFullYear()));
  const [ausentismoAcotarAlcance, setAusentismoAcotarAlcance] = useState(false);
  const [consolidadoSearch, setConsolidadoSearch] = useState('');
  const [consolidadoSort, setConsolidadoSort] = useState<'faltas_desc' | 'asistencia_asc' | 'alumno_asc'>('faltas_desc');

  useEffect(() => {
    if (reporteTab !== 'cierre') {
      setConfirmCloseOpen(false);
      setCierrePasswordConfirm('');
    }
  }, [reporteTab]);

  // Selector en cascada
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [cursoOpciones, setCursoOpciones] = useState<CursoOpcion[]>([]);
  /** Cursos por carrera sin filtrar semestre: sirve para listar años antes del paso Semestre */
  const [cursosCatalogoPorCarrera, setCursosCatalogoPorCarrera] = useState<CursoOpcion[]>([]);
  const [facultadSeleccionadaId, setFacultadSeleccionadaId] = useState('');
  const [carreraSeleccionadaId, setCarreraSeleccionadaId] = useState('');
  const [cursoSeleccionadoId, setCursoSeleccionadoId] = useState('');
  const [catalogoCursosLoading, setCatalogoCursosLoading] = useState(false);
  const [cursosLoading, setCursosLoading] = useState(false);
  const alcanceVisualReportes = useMemo(
    () => deriveAlcanceVisual(alcance),
    [alcance.carreras.length, alcance.facultades.length]
  );

  const carrerasEnAlcance = useMemo(() => {
    if (alcance.carreras.length === 0) return carreras;
    const ids = new Set(alcance.carreras.map((c) => c.id));
    return carreras.filter((c) => ids.has(c.id));
  }, [carreras, alcance.carreras]);

  const facultadesDisponibles = useMemo(() => {
    if (alcance.facultades.length > 0) {
      return alcance.facultades.map((f) => ({ id: f.id, nombre: f.nombre }));
    }
    const mapa = new Map<number, string>();
    for (const c of carrerasEnAlcance) {
      if (c.facultad_id != null) mapa.set(c.facultad_id, c.facultad ?? 'Sin facultad');
    }
    return Array.from(mapa.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [alcance.facultades, carrerasEnAlcance]);

  const carrerasFiltradas = useMemo(() => {
    const base = carrerasEnAlcance;
    if (alcanceVisualReportes === 'carrera') return base;
    if (!facultadSeleccionadaId) return base;
    return base.filter((c) => String(c.facultad_id ?? '') === facultadSeleccionadaId);
  }, [carrerasEnAlcance, facultadSeleccionadaId, alcanceVisualReportes]);

  useAutoAssignScopeId(
    alcanceVisualReportes === 'carrera' ? [] : facultadesDisponibles,
    facultadSeleccionadaId,
    setFacultadSeleccionadaId
  );
  const carrerasOpciones = useMemo(
    () => carrerasFiltradas.map((c) => ({ id: c.id, nombre: c.nombre })),
    [carrerasFiltradas]
  );

  const contextoSelectorListo = calcularContextoSelectorListo({
    alcanceListo,
    datosListos: carreras.length > 0,
    alcanceVisual: alcanceVisualReportes,
    carrerasOpciones,
    carreraId: carreraSeleccionadaId,
  });

  const aniosAusentismoOpciones = useMemo(() => {
    const actual = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => actual - i);
  }, []);

  const mesesAusentismoOpciones = useMemo(
    () => [
      { value: 'todos', label: 'Todos' },
      ...MESES_REPORTE_LABELS.map((label, i) => ({
        value: String(i + 1).padStart(2, '0'),
        label,
      })),
    ],
    []
  );

  const ausentismoResumen = useMemo(() => {
    if (!ausentismoDatos.length) return null;
    const totalCarreras = ausentismoDatos.length;
    const totalCursos = ausentismoDatos.reduce((s, r) => s + r.totalCursos, 0);
    const totalFaltas = ausentismoDatos.reduce((s, r) => s + r.totalFaltas, 0);
    const promAus =
      ausentismoDatos.reduce((s, r) => s + r.promedioAusentismo, 0) / totalCarreras;
    return {
      totalCarreras,
      totalCursos,
      totalFaltas,
      promedioAusentismo: Number(promAus.toFixed(1)),
      promedioAsistencia: Number((100 - promAus).toFixed(1)),
    };
  }, [ausentismoDatos]);

  const ausentismoPeriodoApi = useMemo(() => {
    if (!ausentismoAnio || !ausentismoMes) return '';
    if (ausentismoMes === 'todos') return ausentismoAnio;
    return `${ausentismoAnio}-${ausentismoMes}`;
  }, [ausentismoAnio, ausentismoMes]);

  const ausentismoPeriodoListo = Boolean(ausentismoPeriodoApi);
  const ausentismoAlcanceListo =
    !ausentismoAcotarAlcance || Boolean(carreraSeleccionadaId || facultadSeleccionadaId);

  const ausentismoVistaPrevia = useMemo(() => {
    const periodoTxt = ausentismoPeriodoApi
      ? ausentismoMes === 'todos'
        ? `Año ${ausentismoAnio} (todos los meses)`
        : `${ausentismoMes}/${ausentismoAnio}`
      : 'Seleccioná mes y año';
    if (!ausentismoAcotarAlcance) {
      return `Periodo ${periodoTxt} · Todo tu alcance institucional`;
    }
    const carreraNom = carrerasEnAlcance.find((c) => String(c.id) === carreraSeleccionadaId)?.nombre;
    const facultadNom = facultadesDisponibles.find((f) => String(f.id) === facultadSeleccionadaId)?.nombre;
    if (carreraNom) return `Periodo ${periodoTxt} · Carrera: ${carreraNom}`;
    if (facultadNom) return `Periodo ${periodoTxt} · Facultad: ${facultadNom}`;
    return `Periodo ${periodoTxt} · Elegí facultad o carrera para acotar`;
  }, [
    ausentismoPeriodoApi,
    ausentismoMes,
    ausentismoAnio,
    ausentismoAcotarAlcance,
    carreraSeleccionadaId,
    facultadSeleccionadaId,
    carrerasEnAlcance,
    facultadesDisponibles,
  ]);

  useAutoAssignScopeId(carrerasOpciones, carreraSeleccionadaId, setCarreraSeleccionadaId);

  const cursoId = cursoSeleccionadoId;

  const [periodo, setPeriodo] = useState(() => {
    const d = new Date();
    const rawMonth = d.getMonth() + 1;
    const boundedMonth = Math.min(Math.max(rawMonth, 1), 10);
    const month = String(boundedMonth).padStart(2, '0');
    return `${d.getFullYear()}-${month}`;
  });
  const [semestreSeleccionado, setSemestreSeleccionado] = useState('');
  /** Año del módulo académico: filtra la lista de cursos antes del paso final */
  const [anioFiltroCursos, setAnioFiltroCursos] = useState('');

  const [actas, setActas] = useState<Acta[]>([]);
  const [habilitados, setHabilitados] = useState<Habilitado[]>([]);
  const [checklist, setChecklist] = useState<ChecklistCierre | null>(null);

  const aniosDisponibles = useMemo(() => {
    const s = new Set<number>();
    for (const c of cursosCatalogoPorCarrera) {
      const a = Number(c.anio);
      if (Number.isFinite(a)) s.add(a);
    }
    return [...s].sort((a, b) => b - a);
  }, [cursosCatalogoPorCarrera]);

  const cursoOpcionesFiltradas = useMemo(() => {
    if (!anioFiltroCursos) return [];
    const y = Number(anioFiltroCursos);
    return cursoOpciones.filter((c) => Number(c.anio) === y);
  }, [cursoOpciones, anioFiltroCursos]);

  // Cargar carreras al montar
  useEffect(() => {
    apiFetch<ApiList<Carrera>>('/academico/carreras')
      .then((resp) => setCarreras(resp?.datos ?? []))
      .catch(() => setCarreras([]));
  }, []);

  // Catálogo por carrera (sin semestre) → años disponibles antes de elegir semestre
  useEffect(() => {
    if (!carreraSeleccionadaId) {
      setCursosCatalogoPorCarrera([]);
      setAnioFiltroCursos('');
      return;
    }
    setCursosCatalogoPorCarrera([]);
    setAnioFiltroCursos('');
    const params = new URLSearchParams({ carreraId: carreraSeleccionadaId });
    setCatalogoCursosLoading(true);
    apiFetch<ApiList<CursoOpcion>>(`/academico/cursos?${params.toString()}`)
      .then((resp) => setCursosCatalogoPorCarrera(resp?.datos ?? []))
      .catch(() => setCursosCatalogoPorCarrera([]))
      .finally(() => setCatalogoCursosLoading(false));
  }, [carreraSeleccionadaId]);

  // Cursos filtrados por carrera + semestre (+ año en API si ya está elegido)
  useEffect(() => {
    if (!carreraSeleccionadaId || !semestreSeleccionado) {
      setCursoOpciones([]);
      setCursoSeleccionadoId('');
      return;
    }
    setCursoOpciones([]);
    setCursoSeleccionadoId('');
    const params = new URLSearchParams({
      carreraId: carreraSeleccionadaId,
      semestre: semestreSeleccionado,
    });
    if (anioFiltroCursos) params.set('anio', anioFiltroCursos);
    setCursosLoading(true);
    apiFetch<ApiList<CursoOpcion>>(`/academico/cursos?${params.toString()}`)
      .then((resp) => {
        const datos = resp?.datos ?? [];
        setCursoOpciones(datos);
        setCursoSeleccionadoId('');
      })
      .catch(() => setCursoOpciones([]))
      .finally(() => setCursosLoading(false));
  }, [carreraSeleccionadaId, semestreSeleccionado, anioFiltroCursos]);

  useEffect(() => {
    if (!aniosDisponibles.length) {
      if (anioFiltroCursos) setAnioFiltroCursos('');
      return;
    }
    if (aniosDisponibles.length === 1) {
      setAnioFiltroCursos(String(aniosDisponibles[0]));
      return;
    }
    if (anioFiltroCursos && !aniosDisponibles.includes(Number(anioFiltroCursos))) {
      setAnioFiltroCursos('');
    }
  }, [aniosDisponibles, anioFiltroCursos]);

  useEffect(() => {
    setCursoSeleccionadoId('');
  }, [anioFiltroCursos]);

  useEffect(() => {
    if (anioFiltroCursos) setAusentismoAnio(anioFiltroCursos);
  }, [anioFiltroCursos]);

  // Cuando se selecciona un curso, autocompletar el periodo con su anio/mes
  useEffect(() => {
    if (!cursoSeleccionadoId) return;
    const curso =
      cursoOpcionesFiltradas.find((c) => String(c.id) === cursoSeleccionadoId) ??
      cursoOpciones.find((c) => String(c.id) === cursoSeleccionadoId);
    if (curso?.anio && curso?.mes) {
      const mes = String(curso.mes).padStart(2, '0');
      const next = `${curso.anio}-${mes}`;
      setPeriodo((prev) => (prev === next ? prev : next));
    }
  }, [cursoSeleccionadoId, cursoOpcionesFiltradas, cursoOpciones]);


  const cursoNum = Number(cursoId);
  const cursoValido = Boolean(cursoId) && !Number.isNaN(cursoNum) && cursoNum > 0;

  const cargarActas = useCallback(async () => {
    setLoading(true);
    try {
      const query = cursoValido ? `/reportes/actas?cursoId=${cursoNum}` : '/reportes/actas';
      const actasResp = await apiFetch<ApiList<Acta>>(query);
      setActas(actasResp?.datos ?? []);
    } catch (error) {
      toastApiError(error, 'No se pudo cargar actas');
    } finally {
      setLoading(false);
    }
  }, [cursoNum, cursoValido]);

  useEffect(() => {
    void cargarActas();
  }, [cargarActas]);

  const cargarHabilitados = useCallback(async () => {
    if (!cursoValido) {
      toast.error('Ingresa un curso valido para consultar habilitados.');
      return;
    }
    try {
      const data = await apiFetch<ApiList<Habilitado>>(`/asistencias/habilitados/${cursoNum}`);
      setHabilitados(data?.datos ?? []);
    } catch (error) {
      toastApiError(error, 'No se pudo consultar habilitados');
      setHabilitados([]);
    }
  }, [cursoNum, cursoValido]);

  const cargarChecklist = useCallback(async () => {
    if (!cursoValido) {
      setChecklist(null);
      return;
    }

    setChecklistLoading(true);
    try {
      const data = await apiFetch<ChecklistCierre>(`/reportes/cierre-mensual?cursoId=${cursoNum}&periodo=${encodeURIComponent(periodo)}`);
      setChecklist(data);
    } catch (error) {
      setChecklist(null);
      toastApiError(error, 'No se pudo validar el cierre mensual');
    } finally {
      setChecklistLoading(false);
    }
  }, [cursoNum, cursoValido, periodo]);

  const recalcular = useCallback(async () => {
    if (!cursoValido) {
      toast.error('Ingresa un curso valido para recalcular.');
      return;
    }
    try {
      await apiFetch('/reportes/estadisticas/recalcular', {
        method: 'POST',
        body: JSON.stringify({ cursoId: cursoNum, periodo }),
      });
      toast.success('Estadistica recalculada');
      await Promise.all([cargarChecklist(), cargarHabilitados()]);
    } catch (error) {
      toastApiError(error, 'No se pudo recalcular');
    }
  }, [cursoNum, cursoValido, periodo, cargarChecklist, cargarHabilitados]);

  const generarActa = useCallback(async (tipoActa: string) => {
    if (!cursoValido) {
      toast.error('Ingresa un curso valido para generar acta.');
      return;
    }
    try {
      const abrirPdf = tipoActa === 'pdf_legal' || tipoActa === 'habilitados_no_habilitados';
      await generarYAbrirPdf(
        '/reportes/actas',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursoId: cursoNum, tipoActa, periodo }),
        },
        abrirPdf
      );
      toast.success(`Acta ${tipoActa} generada correctamente`);
      await Promise.all([cargarActas(), cargarChecklist()]);
    } catch (error) {
      toastApiError(error, 'No se pudo generar el acta');
    }
  }, [cursoNum, cursoValido, periodo, cargarActas, cargarChecklist]);

  const cerrarModulo = useCallback(async () => {
    if (!cursoValido) {
      toast.error('Ingresa un curso valido para cerrar el módulo.');
      return;
    }

    setClosing(true);
    try {
      await apiFetch('/reportes/cierre-mensual', {
        method: 'POST',
        body: JSON.stringify({ cursoId: cursoNum, periodo, password: cierrePasswordConfirm }),
      });
      toast.success('Módulo mensual cerrado correctamente');
      setConfirmCloseOpen(false);
      setCierrePasswordConfirm('');
      await Promise.all([cargarChecklist(), cargarActas(), cargarHabilitados()]);
    } catch (error) {
      toastApiError(error, 'No se pudo cerrar el módulo');
    } finally {
      setClosing(false);
    }
  }, [cursoNum, cursoValido, periodo, cierrePasswordConfirm, cargarChecklist, cargarActas, cargarHabilitados]);

  const consolidadoFiltrosListos = Boolean(semestreSeleccionado && anioFiltroCursos);

  const cargarConsolidado = useCallback(async () => {
    if (!consolidadoFiltrosListos) {
      setConsolidado([]);
      return;
    }
    setConsolidadoLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('periodo', periodo);
      params.set('anio', anioFiltroCursos);
      params.set('semestre', semestreSeleccionado);
      if (alcanceVisualReportes !== 'carrera' && facultadSeleccionadaId) params.set('facultadId', facultadSeleccionadaId);
      if (carreraSeleccionadaId) params.set('carreraId', carreraSeleccionadaId);
      if (cursoValido) params.set('cursoId', String(cursoNum));
      if (consolidadoSearch.trim()) params.set('search', consolidadoSearch.trim());
      params.set('orderBy', consolidadoSort);
      const data = await apiFetch<ApiList<ConsolidadoRiesgoItem>>(`/reportes/consolidado-riesgo?${params.toString()}`);
      setConsolidado(data?.datos ?? []);
    } catch (error) {
      toastApiError(error, 'No se pudo cargar el consolidado');
      setConsolidado([]);
    } finally {
      setConsolidadoLoading(false);
    }
  }, [
    periodo,
    anioFiltroCursos,
    semestreSeleccionado,
    consolidadoFiltrosListos,
    facultadSeleccionadaId,
    carreraSeleccionadaId,
    cursoValido,
    cursoNum,
    consolidadoSearch,
    consolidadoSort,
    alcanceVisualReportes,
  ]);

  const generarConsolidadoPdf = useCallback(async () => {
    if (!consolidadoFiltrosListos) {
      toast.error('Seleccioná año y semestre en los filtros de inhabilitados.');
      return;
    }
    setConsolidadoPdfLoading(true);
    try {
      await generarYAbrirPdf('/reportes/consolidado-riesgo/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo,
          anio: Number(anioFiltroCursos),
          semestre: Number(semestreSeleccionado),
          facultadId:
            alcanceVisualReportes !== 'carrera' && facultadSeleccionadaId
              ? Number(facultadSeleccionadaId)
              : undefined,
          carreraId: carreraSeleccionadaId ? Number(carreraSeleccionadaId) : undefined,
          cursoId: cursoValido ? cursoNum : undefined,
          search: consolidadoSearch.trim() || undefined,
          orderBy: consolidadoSort,
        }),
      });
      toast.success('PDF consolidado generado correctamente.');
    } catch (error) {
      toastApiError(error, 'No se pudo generar el PDF consolidado');
    } finally {
      setConsolidadoPdfLoading(false);
    }
  }, [
    periodo,
    anioFiltroCursos,
    semestreSeleccionado,
    consolidadoFiltrosListos,
    facultadSeleccionadaId,
    carreraSeleccionadaId,
    cursoValido,
    cursoNum,
    consolidadoSearch,
    consolidadoSort,
    alcanceVisualReportes,
  ]);

  const cargarAusentismoAgregado = useCallback(async () => {
    if (!ausentismoPeriodoListo || !ausentismoAlcanceListo) {
      setAusentismoDatos([]);
      return;
    }
    setAusentismoDatosLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('periodo', ausentismoPeriodoApi);
      if (ausentismoAcotarAlcance && facultadSeleccionadaId && !carreraSeleccionadaId && alcanceVisualReportes !== 'carrera') {
        params.set('facultadId', facultadSeleccionadaId);
      }
      if (ausentismoAcotarAlcance && carreraSeleccionadaId) {
        params.set('carreraId', carreraSeleccionadaId);
      }
      const data = await apiFetch<{
        total: number;
        periodo: string;
        datos: AusentismoAgregadoItem[];
      }>(`/reportes/estadisticas/ausentismo/agregado?${params.toString()}`);
      setAusentismoDatos(data?.datos ?? []);
    } catch (error) {
      setAusentismoDatos([]);
      toastApiError(error, 'No se pudo cargar el ranking de ausentismo');
    } finally {
      setAusentismoDatosLoading(false);
    }
  }, [
    ausentismoPeriodoApi,
    ausentismoPeriodoListo,
    ausentismoAlcanceListo,
    ausentismoAcotarAlcance,
    facultadSeleccionadaId,
    carreraSeleccionadaId,
    alcanceVisualReportes,
  ]);

  const generarAusentismoPdf = useCallback(async () => {
    if (!ausentismoPeriodoListo) {
      toast.error('Seleccioná el periodo (mes o Todos + año) para el PDF de ausentismo.');
      return;
    }
    if (!ausentismoAlcanceListo) {
      toast.error('Activaste acotar alcance: elegí facultad o carrera.');
      return;
    }
    setAusentismoPdfLoading(true);
    try {
      await generarYAbrirPdf('/reportes/estadisticas/ausentismo/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo: ausentismoPeriodoApi,
          facultadId:
            ausentismoAcotarAlcance &&
            facultadSeleccionadaId &&
            !carreraSeleccionadaId &&
            alcanceVisualReportes !== 'carrera'
              ? Number(facultadSeleccionadaId)
              : undefined,
          carreraId:
            ausentismoAcotarAlcance && carreraSeleccionadaId
              ? Number(carreraSeleccionadaId)
              : undefined,
        }),
      });
      toast.success('PDF de ausentismo generado correctamente.');
      void cargarAusentismoAgregado();
    } catch (error) {
      toastApiError(error, 'No se pudo generar el PDF de ausentismo');
    } finally {
      setAusentismoPdfLoading(false);
    }
  }, [
    cargarAusentismoAgregado,
    ausentismoPeriodoApi,
    ausentismoPeriodoListo,
    ausentismoAlcanceListo,
    ausentismoAcotarAlcance,
    facultadSeleccionadaId,
    carreraSeleccionadaId,
    alcanceVisualReportes,
  ]);

  useEffect(() => {
    if (reporteTab !== 'cierre') return;
    if (!cursoValido) {
      setChecklist(null);
      setHabilitados([]);
      return;
    }

    void Promise.all([cargarChecklist(), cargarHabilitados(), cargarActas()]);
  }, [reporteTab, cursoValido, cursoNum, periodo, cargarChecklist, cargarHabilitados, cargarActas]);

  useEffect(() => {
    if (reporteTab === 'consolidado') {
      void cargarConsolidado();
    }
  }, [reporteTab, cargarConsolidado]);

  useEffect(() => {
    if (reporteTab === 'ausentismo') {
      void cargarAusentismoAgregado();
    }
  }, [reporteTab, cargarAusentismoAgregado]);

  const habilitadosCount = useMemo(() => habilitados.filter((h) => h.habilitado).length, [habilitados]);
  const validacionesOk = useMemo(() => checklist?.validaciones.filter((item) => item.estado === 'ok').length ?? 0, [checklist]);
  const validacionesBloqueadas = useMemo(
    () =>
      checklist?.validaciones.filter((item) => item.estado === 'blocked' || item.estado === 'pendiente')
        .length ?? 0,
    [checklist],
  );

  function getEstadoClasses(estado: ValidacionCierre['estado']) {
    if (estado === 'ok') {
      return 'border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
    }
    if (estado === 'warning') {
      return 'border-amber-500/40 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100';
    }
    if (estado === 'pendiente') {
      return 'border-amber-500/40 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100';
    }
    return 'border-rose-500/40 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100';
  }

  function nivelAusentismoClass(nivel: string): string {
    const u = nivel.toUpperCase();
    if (u === 'CRITICO') {
      return 'border-rose-500/40 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200';
    }
    if (u === 'ALTO') {
      return 'border-amber-500/40 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200';
    }
    if (u === 'MEDIO') {
      return 'border-yellow-500/40 bg-yellow-50 text-yellow-900 dark:border-yellow-500/40 dark:bg-yellow-500/10 dark:text-yellow-200';
    }
    return 'border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200';
  }

  function tipoActaLabel(tipo: string): string {
    const map: Record<string, string> = {
      habilitados_no_habilitados: 'Acta de Habilitados / No Habilitados',
      pdf_legal: 'Planilla Legal',
      consolidado_riesgo: 'Consolidado de Inhabilitados',
      estadisticas_ausentismo: 'Estadísticas de Ausentismo',
      informe_alumno: 'Informe Individual',
      listado_usuarios: 'Listado de Usuarios',
      reporte_auditoria: 'Reporte de Auditoría',
    };
    return map[tipo] ?? tipo.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  const consolidadoView = useMemo(() => consolidado, [consolidado]);

  const tabBtnInactive =
    'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 dark:bg-[#0c1a3b] dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/40';

  const tabBtnClass = (tab: ReporteTab) => {
    const active = reporteTab === tab;
    if (tab === 'cierre') {
      return active
        ? 'bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-500/20 dark:border-blue-500/40 dark:text-blue-200'
        : tabBtnInactive;
    }
    if (tab === 'consolidado') {
      return active
        ? 'bg-purple-100 border-purple-400 text-purple-700 dark:bg-purple-500/20 dark:border-purple-500/40 dark:text-purple-200'
        : tabBtnInactive;
    }
    return active
      ? 'bg-sky-100 border-sky-400 text-sky-700 dark:bg-sky-500/20 dark:border-sky-500/40 dark:text-sky-200'
      : tabBtnInactive;
  };

  const filtrosFacultadCarreraGrid = !contextoSelectorListo ? (
    <ScopeSelectorSkeleton
      soloCarrera={alcanceListo && alcanceVisualReportes === 'carrera'}
      gridClassName={
        alcanceVisualReportes === 'carrera' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'
      }
    />
  ) : (
    <div
      className={`grid gap-3 min-w-0 ${
        alcanceVisualReportes === 'carrera' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'
      }`}
    >
      {alcanceVisualReportes === 'carrera' ? null : (
        <ScopeSelector
          className="min-w-0"
          label="Facultad"
          options={facultadesDisponibles}
          value={facultadSeleccionadaId}
          placeholder="Seleccioná facultad"
          controlClassName={selectReportesTriggerClass}
          onChange={(id) => {
            setFacultadSeleccionadaId(id);
            setCarreraSeleccionadaId('');
            setCursoSeleccionadoId('');
          }}
        />
      )}
      <ScopeSelector
        className="min-w-0"
        label="Carrera"
        options={carrerasOpciones}
        value={carreraSeleccionadaId}
        placeholder="Seleccioná carrera"
        disabled={alcanceVisualReportes === 'carrera' ? false : !facultadSeleccionadaId}
        controlClassName={selectReportesTriggerClass}
        onChange={(id) => {
          setCarreraSeleccionadaId(id);
          if (id) {
            const c = carrerasFiltradas.find((x) => String(x.id) === id);
            if (c?.facultad_id != null) setFacultadSeleccionadaId(String(c.facultad_id));
          }
          setCursoSeleccionadoId('');
        }}
      />
    </div>
  );

  const filtroAnioModulo = (
    <div className="w-[min(100%,7.5rem)] min-w-0 flex flex-col gap-1 shrink-0">
      <label className="text-xs text-slate-400">Año del módulo</label>
      <AppSelect
        title="Seleccionar año del módulo"
        aria-label="Año del módulo"
        value={anioFiltroCursos}
        onChange={setAnioFiltroCursos}
        placeholder={catalogoCursosLoading ? '...' : aniosDisponibles.length === 0 ? '—' : 'Año'}
        loading={catalogoCursosLoading}
        disabled={!carreraSeleccionadaId || catalogoCursosLoading || aniosDisponibles.length === 0}
        options={aniosDisponibles.map((a) => ({ value: String(a), label: String(a) }))}
        triggerClassName={selectReportesTriggerClass}
      />
    </div>
  );

  const filtroSemestrePlan = (
    <div className="w-[min(100%,11rem)] min-w-0 flex flex-col gap-1 shrink-0">
      <label className="text-xs text-slate-400">Semestre del plan</label>
      <AppSelect
        title="Seleccionar semestre"
        aria-label="Semestre"
        value={semestreSeleccionado}
        onChange={setSemestreSeleccionado}
        placeholder="Semestre"
        disabled={!carreraSeleccionadaId || !anioFiltroCursos}
        options={Array.from({ length: 10 }, (_, i) => i + 1).map((n) => ({
          value: String(n),
          label: `${n}° Semestre`,
        }))}
        triggerClassName={selectReportesTriggerClass}
      />
    </div>
  );

  return (
    <div className="system-bg text-[#e7eef9] min-h-screen h-screen overflow-hidden">
      <div className="flex h-full w-full overflow-hidden">
        {sidebarOpen ? <div className="fixed inset-0 bg-black/70 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} /> : null}

        <AppSidebar sidebarOpen={sidebarOpen} onLogout={onLogout} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 flex flex-col h-full overflow-hidden">
          <header className="flex-shrink-0 h-16 bg-[#132a52]/90 backdrop-blur-md border-b border-slate-800 flex items-center px-6 z-10 gap-3">
            <button className="lg:hidden text-slate-400" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="material-symbols-outlined text-[#6b8bc3]">description</span>
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">Módulo</p>
              <h1 className="text-xl font-semibold leading-none">Reportes y cierre mensual</h1>
            </div>
          </header>

          <section className="flex-1 overflow-auto p-6 space-y-5">

            <div className="rounded-2xl border border-[#2d466d]/70 bg-[#132a52] p-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg text-sm border ${tabBtnClass('cierre')}`}
                onClick={() => setReporteTab('cierre')}
              >
                Cierre mensual
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg text-sm border ${tabBtnClass('consolidado')}`}
                onClick={() => setReporteTab('consolidado')}
              >
                Inhabilitados
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg text-sm border ${tabBtnClass('ausentismo')}`}
                onClick={() => setReporteTab('ausentismo')}
              >
                Estadísticas Facultad/Carrera
              </button>
            </div>

            {reporteTab === 'cierre' ? (
              <div className="rounded-2xl border border-[#2d466d]/70 bg-[#132a52] p-5 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-[#eff3ff]">
                  Filtros — cierre mensual
                </p>
                {filtrosFacultadCarreraGrid}
                <div className="flex flex-wrap items-end gap-3 min-w-0">
                  {filtroAnioModulo}
                  {filtroSemestrePlan}
                  <div className="min-w-0 flex-1 basis-full sm:basis-[min(100%,20rem)] flex flex-col gap-1">
                    <label className="text-xs text-slate-400">Curso</label>
                    <ReportesCursoPicker
                      options={cursoOpcionesFiltradas}
                      value={cursoSeleccionadoId}
                      onChange={setCursoSeleccionadoId}
                      loading={cursosLoading}
                      disabled={
                        !carreraSeleccionadaId ||
                        !semestreSeleccionado ||
                        !anioFiltroCursos ||
                        cursosLoading
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-modern btn-modern-primary btn-modern-sm flex items-center justify-center gap-1.5 w-full min-[900px]:w-auto min-[900px]:shrink-0 min-[900px]:self-end py-2.5 min-[900px]:min-w-[9.5rem]"
                    onClick={() => void cargarChecklist()}
                    disabled={!cursoValido || checklistLoading}
                  >
                    <span className="material-symbols-outlined text-[18px]">search</span>
                    {checklistLoading ? 'Buscando...' : 'Consultar'}
                  </button>
                </div>
                {checklist ? (
                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-800">
                    <span className="material-symbols-outlined text-[#6b8bc3] text-[18px]">school</span>
                    <span className="font-medium text-[#e7eef9]">{checklist.materia}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs border ${
                        String(checklist.estadoModulo).toLowerCase() === 'cerrado'
                          ? 'border-rose-500/40 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'
                          : 'border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                      }`}
                    >
                      {checklist.estadoModulo}
                    </span>
                    <span className="text-xs text-slate-400 ml-auto">Periodo: {checklist.periodo}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {reporteTab === 'consolidado' ? (
              <div className="rounded-2xl border border-[#2d466d]/70 bg-[#132a52] p-5 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-[#eff3ff]">
                  Filtros — inhabilitados
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
                  Facultad, carrera, año del módulo y semestre del plan. No requiere elegir un curso.
                </p>
                {filtrosFacultadCarreraGrid}
                <div className="flex flex-wrap items-end gap-3 min-w-0">
                  {filtroAnioModulo}
                  {filtroSemestrePlan}
                </div>
              </div>
            ) : null}

            {reporteTab === 'cierre' ? (
            <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-800 bg-[#132a52] p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px]">article</span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Actas</p>
                  <p className="text-2xl font-bold text-[#f0f4f8]">{actas.length}</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#132a52] p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Habilitados</p>
                  <p className="text-2xl font-bold text-emerald-300">{habilitadosCount}</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#132a52] p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px]">checklist</span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Checklist</p>
                  <p className="text-2xl font-bold">{checklist ? `${validacionesOk}/${checklist.validaciones.length}` : '—'}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

              {/* Izquierda: flujo + checklist */}
              <div className="xl:col-span-2 space-y-4">

                {/* Pasos del flujo */}
                <div className="rounded-2xl border border-[#2d466d]/70 bg-[#132a52] p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-[#eff3ff] mb-4">Flujo de cierre guiado</p>
                  <div className="space-y-3">

                    <div className="flex items-center gap-4 p-3 rounded-xl bg-[#0c1a3b] border border-slate-800">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-300 text-sm font-bold">1</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">Recalcular ausentismo</p>
                        <p className="text-xs text-slate-400">Actualiza las estadísticas de asistencia del periodo.</p>
                      </div>
                      <button className="btn-modern btn-modern-primary btn-modern-sm flex-shrink-0 flex items-center gap-1.5" onClick={() => void recalcular()} disabled={!cursoValido || loading}>
                        <span className="material-symbols-outlined text-[15px]">refresh</span>
                        Recalcular
                      </button>
                    </div>

                    <div className="flex items-center gap-4 p-3 rounded-xl bg-[#0c1a3b] border border-slate-800">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 text-sm font-bold">2</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">Generar acta habilitados/no habilitados</p>
                        <p className="text-xs text-slate-400">Registra quiénes quedan habilitados para el examen final.</p>
                      </div>
                      <button className="btn-modern btn-modern-success btn-modern-sm flex-shrink-0 flex items-center gap-1.5" onClick={() => void generarActa('habilitados_no_habilitados')} disabled={!cursoValido || loading}>
                        <span className="material-symbols-outlined text-[15px]">how_to_reg</span>
                        Generar
                      </button>
                    </div>

                    <div className="flex items-center gap-4 p-3 rounded-xl bg-[#0c1a3b] border border-slate-800">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-blue-600 text-sm font-bold">3</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">Generar PDF legal</p>
                        <p className="text-xs text-slate-400">Documento oficial con el registro de asistencias del periodo.</p>
                      </div>
                      <button className="btn-modern btn-modern-info btn-modern-sm flex-shrink-0 flex items-center gap-1.5" onClick={() => void generarActa('pdf_legal')} disabled={!cursoValido || loading}>
                        <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                        Generar PDF
                      </button>
                    </div>

                    {puedeCerrarModulo ? (
                      <div
                        className={`flex items-center gap-4 p-3 rounded-xl border ${
                          checklist?.puedeCerrar
                            ? 'bg-rose-50 border-rose-300/70 dark:bg-[rgba(59,18,29,0.5)] dark:border-rose-500/60 dark:shadow-[inset_0_0_0_1px_rgba(244,63,94,0.35)]'
                            : 'bg-[#0c1a3b] border-slate-800'
                        }`}
                      >
                        <div
                          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            checklist?.puedeCerrar
                              ? 'bg-rose-100 border border-rose-400 text-rose-800 dark:bg-[rgba(171,18,51,0.45)] dark:border-rose-400/80 dark:text-rose-100'
                              : 'bg-slate-700/30 border border-slate-700 text-slate-500'
                          }`}
                        >
                          4
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-semibold ${
                              checklist?.puedeCerrar ? 'text-rose-900 dark:text-rose-50' : 'text-[#f0f4f8]'
                            }`}
                          >
                            Cerrar módulo mensual
                          </p>
                          <p
                            className={`text-xs ${
                              checklist?.puedeCerrar
                                ? 'text-rose-800/90 dark:text-rose-200'
                                : 'text-slate-400'
                            }`}
                          >
                            {checklist?.puedeCerrar
                              ? 'Todos los requisitos están cumplidos. Puedes cerrar el módulo.'
                              : 'Completa los pasos anteriores para habilitar el cierre.'}
                          </p>
                        </div>
                        <button
                          className="btn-modern btn-modern-danger btn-modern-sm flex-shrink-0 flex items-center gap-1.5"
                          onClick={() => setConfirmCloseOpen(true)}
                          disabled={!checklist?.puedeCerrar || closing}
                        >
                          <span className="material-symbols-outlined text-[15px]">lock</span>
                          Cerrar
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 px-1">
                        El cierre del módulo lo realizan Administración, Secretaría Académica o Jefe de Carrera.
                      </p>
                    )}
                  </div>
                </div>

                {/* Checklist de validaciones */}
                <div className="rounded-2xl border border-[#2d466d]/70 bg-[#132a52] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-[#eff3ff]">Checklist de cierre</p>
                      <p className="text-xs text-slate-500 mt-0.5">Requisitos que deben cumplirse para habilitar el cierre.</p>
                    </div>
                    {checklist ? (
                      <span className="text-xs text-slate-400">
                        Bloqueos: <span className="text-rose-300 font-semibold">{validacionesBloqueadas}</span>
                      </span>
                    ) : null}
                  </div>

                  {checklist ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {checklist.validaciones.map((item) => (
                        <div key={item.id} className={`rounded-xl border p-3 ${getEstadoClasses(item.estado)}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="material-symbols-outlined text-[16px]">
                              {item.estado === 'ok' ? 'check_circle' : item.estado === 'warning' ? 'warning' : 'cancel'}
                            </span>
                            <p className="text-sm font-semibold flex-1">{item.titulo}</p>
                            <span className="text-[10px] uppercase tracking-widest opacity-60">{item.estado}</span>
                          </div>
                          <p className="text-xs opacity-80 ml-6">{item.detalle}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                      <span className="material-symbols-outlined text-4xl mb-2 opacity-40">checklist</span>
                      <p className="text-sm">Consultá un curso para ver el checklist.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Derecha: actas y habilitados */}
              <div className="space-y-4">

                <div className="rounded-2xl border border-[#2d466d]/70 bg-[#132a52] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-[#eff3ff]">Actas generadas</p>
                    <span className="text-xs bg-[#0c1a3b] border border-slate-800 px-2 py-0.5 rounded-full text-slate-400">{actas.length}</span>
                  </div>
                  <div className="max-h-[300px] overflow-auto space-y-2">
                    {actas.length ? actas.map((a) => (
                      <div key={a.id} className="rounded-xl bg-[#0c1a3b] border border-slate-800 p-3 flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tipoActaLabel(a.tipo_acta)}</p>
                          <p className="text-xs text-slate-400 truncate">{a.materia}</p>
                          <p className="text-xs text-slate-500">{formatDateTime24(a.generado_en, { locale: 'es-AR' })}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void abrirDocumento(a.url_documento).catch((err) => toastApiError(err, 'No se pudo abrir el documento'))}
                          className="flex-shrink-0 p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 "
                          title="Abrir documento (datos actuales)"
                        >
                          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                        </button>
                      </div>
                    )) : (
                      <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                        <span className="material-symbols-outlined text-3xl mb-1 opacity-40">article</span>
                        <p className="text-sm">Sin actas generadas.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#2d466d]/70 bg-[#132a52] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-[#eff3ff]">Habilitados a examen</p>
                    <span className="text-xs bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full text-emerald-300">{habilitadosCount}</span>
                  </div>
                  <div className="max-h-[300px] overflow-auto space-y-2">
                    {habilitados.filter((h) => h.habilitado).length ? (
                      habilitados.filter((h) => h.habilitado).map((h) => (
                        <div key={h.matricula_id} className="flex items-center justify-between gap-2 rounded-xl bg-[#0c1a3b] border border-slate-800 px-3 py-2.5">
                          <div>
                            <p className="text-sm font-medium">{h.alumno}</p>
                            <p className="text-xs text-slate-500">Matrícula #{h.matricula_id}</p>
                          </div>
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${h.porcentaje_final >= 75 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
                            {h.porcentaje_final}%
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                        <span className="material-symbols-outlined text-3xl mb-1 opacity-40">how_to_reg</span>
                        <p className="text-sm">{cursoValido ? 'Sin habilitados.' : 'Consultá un curso.'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            </>
            ) : null}

            {reporteTab === 'consolidado' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-[#2d466d]/70 dark:bg-[#132a52]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-[#eff3ff]">Inhabilitados</p>
                    <p className="text-xs text-slate-600 mt-1 dark:text-slate-400">
                      Alumnos que no pueden rendir el examen final: asistencia menor al 75% en el periodo.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-modern btn-modern-ghost btn-modern-sm flex items-center gap-1.5"
                      onClick={() => void cargarConsolidado()}
                      disabled={consolidadoLoading || !consolidadoFiltrosListos}
                    >
                      <span className="material-symbols-outlined text-[15px]">refresh</span>
                      {consolidadoLoading ? 'Cargando...' : 'Actualizar'}
                    </button>
                    <button
                      className="btn-modern btn-modern-info btn-modern-sm flex items-center gap-1.5"
                      onClick={() => void generarConsolidadoPdf()}
                      disabled={consolidadoPdfLoading || !consolidadoFiltrosListos}
                    >
                      <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                      {consolidadoPdfLoading ? 'Generando PDF...' : 'Exportar PDF'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full border border-rose-500/40 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                    Inhabilitados: {consolidadoView.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-800 placeholder-slate-500 focus:outline-none dark:bg-[#0c1a3b] dark:border-slate-800 dark:text-[#e7eef9] dark:placeholder-slate-600"
                    placeholder="Buscar alumno, CI, materia..."
                    value={consolidadoSearch}
                    onChange={(e) => setConsolidadoSearch(e.target.value)}
                  />
                  <AppSelect
                    title="Ordenar consolidado"
                    value={consolidadoSort}
                    onChange={(v) => setConsolidadoSort(v as 'faltas_desc' | 'asistencia_asc' | 'alumno_asc')}
                    options={[
                      { value: 'faltas_desc', label: 'Orden: más faltas' },
                      { value: 'asistencia_asc', label: 'Orden: menor asistencia' },
                      { value: 'alumno_asc', label: 'Orden: alumno A-Z' },
                    ]}
                    triggerClassName={selectReportesTriggerClass}
                  />
                </div>

                <div className="overflow-auto max-h-[520px] rounded-xl border border-slate-300 dark:border-slate-800">
                  <table className="w-full text-sm text-slate-800 dark:text-[#e7eef9]">
                    <thead className="sticky top-0 bg-slate-100 text-xs text-slate-700 uppercase dark:bg-[#0b1827] dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Periodo</th>
                        <th className="px-3 py-2 text-left font-medium">Facultad</th>
                        <th className="px-3 py-2 text-left font-medium">Carrera</th>
                        <th className="px-3 py-2 text-left font-medium">Semestre</th>
                        <th className="px-3 py-2 text-left font-medium">Materia</th>
                        <th className="px-3 py-2 text-left font-medium">Alumno</th>
                        <th className="px-3 py-2 text-left font-medium">CI</th>
                        <th className="px-3 py-2 text-left font-medium">% Asist.</th>
                        <th className="px-3 py-2 text-left font-medium">Faltas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consolidadoView.map((item, idx) => (
                        <tr key={`${item.curso_id}-${item.numero_documento}-${idx}`} className="border-t border-slate-200 dark:border-slate-800/60">
                          <td className="px-3 py-2">{item.periodo}</td>
                          <td className="px-3 py-2">{item.facultad}</td>
                          <td className="px-3 py-2">{item.carrera}</td>
                          <td className="px-3 py-2">
                            {item.semestre > 0 ? `${item.semestre}°` : '—'}
                          </td>
                          <td className="px-3 py-2">{item.materia}</td>
                          <td className="px-3 py-2">{item.alumno}</td>
                          <td className="px-3 py-2 tabular-nums">{item.numero_documento || '—'}</td>
                          <td className="px-3 py-2">{Number(item.porcentaje_asistencia ?? 0).toFixed(1)}%</td>
                          <td className="px-3 py-2">{item.faltas_acumuladas}</td>
                        </tr>
                      ))}
                      {!consolidadoLoading && consolidadoView.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-8 text-center text-slate-500 dark:text-slate-500">
                            {!consolidadoFiltrosListos
                              ? 'Seleccioná año y semestre en los filtros de arriba.'
                              : 'No hay alumnos inhabilitados para el filtro actual.'}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {reporteTab === 'ausentismo' ? (
              <div className="rounded-2xl border border-[#2d466d]/70 bg-[#132a52] p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-[#eff3ff]">
                      Estadísticas por facultad / carrera
                    </p>
                    <p className="text-xs text-slate-500 mt-1 dark:text-slate-400 max-w-2xl">
                      Promedio de ausentismo por carrera en un mes o en todo el año (opción Todos). Los datos provienen de estadísticas
                      calculadas por curso (recálculo en cierre mensual). No usa semestre del plan ni curso puntual.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-modern btn-modern-ghost btn-modern-sm flex items-center gap-1.5"
                      onClick={() => void cargarAusentismoAgregado()}
                      disabled={ausentismoDatosLoading || !ausentismoPeriodoListo || !ausentismoAlcanceListo}
                    >
                      <span className="material-symbols-outlined text-[15px]">refresh</span>
                      {ausentismoDatosLoading ? 'Cargando...' : 'Actualizar'}
                    </button>
                    <button
                      type="button"
                      className="btn-modern btn-modern-primary btn-modern-sm flex items-center gap-1.5"
                      onClick={() => void generarAusentismoPdf()}
                      disabled={ausentismoPdfLoading || !ausentismoPeriodoListo || !ausentismoAlcanceListo}
                    >
                      <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                      {ausentismoPdfLoading ? 'Generando PDF...' : 'Exportar PDF'}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-medium text-slate-400">Periodo y alcance</p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-[min(100%,9rem)] flex flex-col gap-1">
                      <label className="text-xs text-slate-400">Mes</label>
                      <AppSelect
                        aria-label="Mes del reporte"
                        value={ausentismoMes}
                        onChange={setAusentismoMes}
                        options={mesesAusentismoOpciones}
                        triggerClassName={selectReportesTriggerClass}
                      />
                    </div>
                    <div className="w-[min(100%,7rem)] flex flex-col gap-1">
                      <label className="text-xs text-slate-400">Año</label>
                      <AppSelect
                        aria-label="Año del reporte"
                        value={ausentismoAnio}
                        onChange={setAusentismoAnio}
                        options={aniosAusentismoOpciones.map((a) => ({
                          value: String(a),
                          label: String(a),
                        }))}
                        triggerClassName={selectReportesTriggerClass}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-300 pb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-slate-500"
                        checked={ausentismoAcotarAlcance}
                        onChange={(e) => setAusentismoAcotarAlcance(e.target.checked)}
                      />
                      Acotar por facultad o carrera
                    </label>
                  </div>
                  {ausentismoAcotarAlcance ? filtrosFacultadCarreraGrid : null}
                  <p className="text-xs text-slate-500">{ausentismoVistaPrevia}</p>
                </div>

                {ausentismoResumen ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-800 bg-[#0c1a3b] p-3">
                      <p className="text-[10px] uppercase text-slate-500">Carreras</p>
                      <p className="text-xl font-bold text-[#f0f4f8]">{ausentismoResumen.totalCarreras}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-[#0c1a3b] p-3">
                      <p className="text-[10px] uppercase text-slate-500">Cursos</p>
                      <p className="text-xl font-bold text-[#f0f4f8]">{ausentismoResumen.totalCursos}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-[#0c1a3b] p-3">
                      <p className="text-[10px] uppercase text-slate-500">% Ausentismo prom.</p>
                      <p className="text-xl font-bold text-amber-300">{ausentismoResumen.promedioAusentismo}%</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-[#0c1a3b] p-3">
                      <p className="text-[10px] uppercase text-slate-500">Faltas totales</p>
                      <p className="text-xl font-bold text-[#f0f4f8]">{ausentismoResumen.totalFaltas}</p>
                    </div>
                  </div>
                ) : null}

                <div className="overflow-auto max-h-[480px] rounded-xl border border-slate-800">
                  <table className="w-full text-sm text-[#e7eef9]">
                    <thead className="sticky top-0 bg-[#0b1827] text-xs text-slate-400 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Facultad</th>
                        <th className="px-3 py-2 text-left font-medium">Carrera</th>
                        <th className="px-3 py-2 text-center font-medium">Cursos</th>
                        <th className="px-3 py-2 text-center font-medium">% Ausentismo</th>
                        <th className="px-3 py-2 text-center font-medium">% Asistencia</th>
                        <th className="px-3 py-2 text-center font-medium">Nivel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ausentismoDatos.map((row, idx) => (
                        <tr
                          key={`${row.facultad}-${row.carrera}-${idx}`}
                          className="border-t border-slate-800/60"
                        >
                          <td className="px-3 py-2">{row.facultad}</td>
                          <td className="px-3 py-2">{row.carrera}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{row.totalCursos}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{row.promedioAusentismo.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-center tabular-nums">{row.promedioAsistencia.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${nivelAusentismoClass(row.nivel)}`}
                            >
                              {row.nivel}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!ausentismoDatosLoading && ausentismoDatos.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                            {!ausentismoPeriodoListo || !ausentismoAlcanceListo
                              ? 'Completá periodo y alcance para ver el ranking.'
                              : 'Sin estadísticas para este periodo y alcance.'}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <Dialog
              open={confirmCloseOpen && reporteTab === 'cierre'}
              onOpenChange={(open) => {
                setConfirmCloseOpen(open);
                if (!open) setCierrePasswordConfirm('');
              }}
            >
              <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl ring-1 ring-slate-200/80 dark:border-slate-500/30 dark:bg-gradient-to-b dark:from-[#162d55] dark:to-[#0f2244] dark:text-[#e7eef9] dark:ring-sky-500/20">
                <div className="relative overflow-hidden border-b border-slate-200 bg-slate-50 px-5 pb-5 pt-6 sm:px-6 dark:border-white/10 dark:bg-[#0c1a32]/90">
                  <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-rose-200/40 blur-2xl dark:bg-rose-500/15" aria-hidden />
                  <div className="pointer-events-none absolute -left-10 top-8 h-28 w-28 rounded-full bg-sky-200/50 blur-2xl dark:bg-sky-500/10" aria-hidden />
                  <DialogHeader className="space-y-3 text-left">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-rose-100 text-rose-600 shadow-sm dark:border-rose-400/35 dark:from-rose-500/25 dark:to-rose-600/10 dark:text-rose-200 dark:shadow-inner">
                        <span className="material-symbols-outlined text-[26px]" aria-hidden>
                          verified_user
                        </span>
                      </div>
                      <div className="min-w-0 space-y-1 pt-0.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-600 dark:text-rose-300/90">
                          Confirmación segura
                        </p>
                        <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                          Cerrar módulo mensual
                        </DialogTitle>
                        <DialogDescription className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                          Esta acción marca el período como cerrado y restringe cambios académicos sobre ese módulo. Ingresá tu contraseña de usuario para confirmar.
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                </div>

                <div className="space-y-4 bg-white px-5 py-5 sm:px-6 dark:bg-transparent">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm shadow-sm dark:border-white/10 dark:bg-[#0a162c]/80 dark:shadow-inner">
                    <dl className="grid gap-2.5 sm:grid-cols-2">
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Curso</dt>
                        <dd className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{cursoId || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Período</dt>
                        <dd className="mt-0.5 font-medium tabular-nums text-slate-900 dark:text-slate-100">{periodo}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Materia</dt>
                        <dd className="mt-0.5 font-medium leading-snug text-slate-900 dark:text-slate-100">{checklist?.materia ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="cierre-password-confirm" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Contraseña de tu usuario
                    </label>
                    <input
                      id="cierre-password-confirm"
                      type="password"
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-600/80 dark:bg-[#071222] dark:text-white dark:shadow-inner dark:placeholder:text-slate-500 dark:focus:border-sky-400/60 dark:focus:ring-sky-500/25"
                      placeholder="••••••••"
                      value={cierrePasswordConfirm}
                      onChange={(e) => setCierrePasswordConfirm(e.target.value)}
                      disabled={closing}
                    />
                    <p className="text-[11px] leading-snug text-slate-500">
                      Usá la misma contraseña con la que iniciás sesión en el sistema.
                    </p>
                  </div>

                  <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-500/50 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/5"
                      onClick={() => {
                        setConfirmCloseOpen(false);
                        setCierrePasswordConfirm('');
                      }}
                      disabled={closing}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-600/40 bg-gradient-to-r from-rose-600 to-rose-700 px-4 text-sm font-semibold text-white shadow-md shadow-rose-600/25 transition-[transform,box-shadow] hover:from-rose-500 hover:to-rose-600 hover:shadow-rose-600/35 disabled:pointer-events-none disabled:opacity-50 dark:border-rose-500/50 dark:shadow-lg dark:shadow-rose-900/30 dark:hover:shadow-rose-900/40"
                      onClick={() => void cerrarModulo()}
                      disabled={!cierrePasswordConfirm.trim() || closing}
                    >
                      <span className="material-symbols-outlined text-[18px]" aria-hidden>
                        lock
                      </span>
                      {closing ? 'Cerrando…' : 'Confirmar cierre'}
                    </button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </section>
        </main>
      </div>
    </div>
  );
}


