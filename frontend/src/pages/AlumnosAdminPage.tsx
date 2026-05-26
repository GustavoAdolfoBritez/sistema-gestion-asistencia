import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { JustificacionFechasGrupo } from '../components/JustificacionFechasGrupo';
import { ScopeSelector, ScopeSelectorSkeleton } from '../components/ScopeSelector';
import { AppSelect } from '../components/ui/app-select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useMisAlcances } from '../hooks/useMisAlcances';
import { useScopeForm } from '../hooks/useScopeForm';
import { abrirDocumento, apiFetch, generarYAbrirPdf } from '../utils/api';
import { readStoredUser } from '../utils/session-user';
import { esGestionUnicaCarreraAlumnosListado, puedeAprobarJustificaciones } from '../utils/rbac';
import {
  agruparJustificacionesPorCarga,
  claveGrupoJustificacionCarga,
  etiquetaModuloJustificacion,
} from '../utils/justificaciones-grupo';
import { etiquetaPorcentajeAsistencia, tieneAsistenciaRegistrada } from '../utils/estado-asistencia';

interface Props {
  onLogout?: () => void;
}

interface ApiList<T> {
  total: number;
  datos: T[];
  hasMore?: boolean;
}

interface AlumnoBusqueda {
  id: string;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  nombre_apellido?: string | null;
  total_matriculas?: number | string;
  carreras?: string | null;
  referencia_carrera_id?: number | null;
  facultad_referencia_nombre?: string | null;
  carrera_referencia_nombre?: string | null;
  /** Semestre curricular institucional (importación / promoción). */
  semestre_curricular?: number | string | null;
  /** Año de ingreso / cohorte institucional. */
  cohorte_anio?: number | string | null;
}

interface TrayectoriaItem {
  matricula_id: number;
  curso_id: number;
  estado_academico: string;
  porcentaje_asistencia: number;
  faltas_acumuladas: number;
  justificaciones_aprobadas: number;
  fecha_inscripcion: string;
  anio: number;
  mes: number;
  materia: string;
  plan: string;
  carrera: string;
  facultad: string;
  sesiones_registradas: number;
  presentes: number;
  ausentes: number;
  justificadas: number;
}

interface FichaAlumno {
  alumno: AlumnoBusqueda;
  resumen: {
    totalMatriculas: number;
    activas: number;
    totalAusencias: number;
    totalJustificadas: number;
    promedioPorcentajeAsistenciaMaterias: number;
    anioPromedioAsistencia: number;
    materiasPromedioAnio: number;
  };
  trayectoria: TrayectoriaItem[];
}

interface JustificacionAlumnoFicha {
  id: number;
  motivo: string | null;
  documento_url: string | null;
  estado_revision: string | null;
  revisado_en: string | null;
  comentarios_revision: string | null;
  fecha: string | null;
  curso_id: number | null;
  materia: string | null;
  modulo_anio: number | null;
  modulo_mes: number | null;
}

interface FacultadItem {
  id: number;
  nombre: string;
}

interface CarreraItem {
  id: number;
  nombre: string;
  facultad_id: number;
}

const inpList =
  'w-full min-h-[2.5rem] rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white text-black border-slate-300 placeholder:text-slate-400 dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:text-[#e7eef9] dark:border-slate-700 dark:placeholder:text-slate-500 dark:shadow-none';

/** Selector de año en ficha alumno: compacto, alineado al panel */
const inpYearSelect =
  'w-auto min-w-[5.25rem] max-w-[7rem] shrink-0 cursor-pointer rounded-lg border px-2.5 py-1.5 text-sm font-semibold tabular-nums shadow-sm transition-[border-color,box-shadow] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white text-black border-slate-300 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:text-[#e7eef9] dark:border-slate-700 dark:hover:border-slate-600 dark:shadow-none';

function etiquetaSemestreCurricularAlumno(sem: unknown): string | null {
  const v = Number(sem);
  if (!Number.isFinite(v) || v < 1 || v > 10) return null;
  return `Semestre curricular ${Math.trunc(v)}°`;
}

function MetaAlumnoFichaMovil({ alumno }: { alumno: AlumnoBusqueda }) {
  const filas = [
    { etiqueta: 'Facultad', valor: alumno.facultad_referencia_nombre?.trim() || null },
    { etiqueta: 'Carrera', valor: alumno.carrera_referencia_nombre?.trim() || null },
    {
      etiqueta: 'Semestre',
      valor: etiquetaSemestreCurricularAlumno(alumno.semestre_curricular),
    },
    {
      etiqueta: 'Ingreso',
      valor: alumno.cohorte_anio ? `Año ${alumno.cohorte_anio}` : null,
    },
  ].filter((f) => f.valor);

  if (!filas.length) return null;

  return (
    <dl className="w-full rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2.5 dark:border-slate-700/60 dark:bg-slate-900/25">
      {filas.map((f) => (
        <div
          key={f.etiqueta}
          className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 border-b border-slate-200/80 py-2.5 text-xs first:pt-0 last:border-b-0 last:pb-0 dark:border-slate-700/60"
        >
          <dt className="shrink-0 pt-0.5 font-semibold text-slate-500 dark:text-slate-400">{f.etiqueta}</dt>
          <dd className="break-words leading-snug text-slate-800 dark:text-slate-200">{f.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AlumnosAdminPage({ onLogout }: Props) {
  const esJefeCarrera = esGestionUnicaCarreraAlumnosListado(readStoredUser()?.roles);
  const ocultarFiltrosFacultadCarrera = esJefeCarrera;
  const puedeResolverJustificaciones = useMemo(() => puedeAprobarJustificaciones(readStoredUser()?.roles), []);
  const { alcance, listo: alcanceListo } = useMisAlcances();
  const [catalogoFiltrosListo, setCatalogoFiltrosListo] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filtrosMovilAbiertos, setFiltrosMovilAbiertos] = useState(false);
  const [termino, setTermino] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [resultados, setResultados] = useState<AlumnoBusqueda[]>([]);
  const activeQueryRef = useRef('');
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [selectedAlumnoId, setSelectedAlumnoId] = useState<string | null>(null);
  const [ficha, setFicha] = useState<FichaAlumno | null>(null);
  const [fichaLoading, setFichaLoading] = useState(false);
  const [justificacionesAlumno, setJustificacionesAlumno] = useState<JustificacionAlumnoFicha[]>([]);
  const [justificacionesLoading, setJustificacionesLoading] = useState(false);
  const [justificacionesDialogOpen, setJustificacionesDialogOpen] = useState(false);
  const [resolviendoJustId, setResolviendoJustId] = useState<number | null>(null);
  const [comentariosJustModal, setComentariosJustModal] = useState<Record<number, string>>({});
  const [generandoInforme, setGenerandoInforme] = useState(false);
  /** Filtros del listado (no de la ficha): acotan la búsqueda en servidor. */
  const [listaFacultadId, setListaFacultadId] = useState('');
  const [listaCarreraId, setListaCarreraId] = useState('');
  const [listaSemestreCurricular, setListaSemestreCurricular] = useState('');
  const [facultades, setFacultades] = useState<FacultadItem[]>([]);
  const [carreras, setCarreras] = useState<CarreraItem[]>([]);
  /** Año calendario del módulo en la ficha: tabla y promedio solo para ese año. */
  const [anioPromedioSeleccionado, setAnioPromedioSeleccionado] = useState<number | null>(null);

  const PAGE_SIZE = 30;

  const buildBusquedaUrl = useCallback((term: string, offset: number) => {
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    if (!ocultarFiltrosFacultadCarrera) {
      if (listaCarreraId) params.set('carreraId', listaCarreraId);
      else if (listaFacultadId) params.set('facultadId', listaFacultadId);
    }
    if (listaSemestreCurricular) params.set('semestreCurricular', listaSemestreCurricular);
    return `/academico/alumnos/buscar?${params.toString()}`;
  }, [listaFacultadId, listaCarreraId, listaSemestreCurricular, ocultarFiltrosFacultadCarrera]);

  const facultadesFallback = useMemo(
    () => facultades.map((f) => ({ id: f.id, nombre: f.nombre })),
    [facultades]
  );

  const carrerasCatalogo = useMemo(
    () => carreras.map((c) => ({ id: c.id, nombre: c.nombre, facultad_id: c.facultad_id })),
    [carreras]
  );

  const { facultadesDisponibles, carrerasDisponibles, requiereElegirFacultad, contextoSelectorListo } =
    useScopeForm({
      alcance,
      carrerasCatalogo,
      ocultarFacultad: ocultarFiltrosFacultadCarrera,
      facultadId: listaFacultadId,
      setFacultadId: setListaFacultadId,
      carreraId: listaCarreraId,
      setCarreraId: setListaCarreraId,
      facultadesFallback,
      alcanceListo,
      datosListos: ocultarFiltrosFacultadCarrera ? true : catalogoFiltrosListo,
    });

  const filtrosAlumnosListos = ocultarFiltrosFacultadCarrera ? alcanceListo : contextoSelectorListo;

  const buscar = useCallback(async (q: string) => {
    const term = q.trim();
    activeQueryRef.current = term;
    offsetRef.current = 0;
    setLoading(true);
    try {
      const url = buildBusquedaUrl(term, 0);
      const data = await apiFetch<ApiList<AlumnoBusqueda>>(url);
      const lista = data?.datos ?? [];
      setResultados(lista);
      setHasMore(data?.hasMore ?? false);
      if (!term) {
        setSelectedAlumnoId(null);
        setFicha(null);
      } else {
        setSelectedAlumnoId(lista[0]?.id ?? null);
        if (!lista.length) setFicha(null);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo buscar alumnos';
      toast.error(msg);
      setResultados([]);
      setHasMore(false);
      setFicha(null);
      setSelectedAlumnoId(null);
    } finally {
      setLoading(false);
    }
  }, [buildBusquedaUrl]);

  const cargarMas = useCallback(async () => {
    const nextOffset = offsetRef.current + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const q = activeQueryRef.current;
      const url = buildBusquedaUrl(q, nextOffset);
      const data = await apiFetch<ApiList<AlumnoBusqueda>>(url);
      const lista = data?.datos ?? [];
      setResultados((prev) => [...prev, ...lista]);
      setHasMore(data?.hasMore ?? false);
      offsetRef.current = nextOffset;
    } catch {
      toast.error('No se pudieron cargar más alumnos');
    } finally {
      setLoadingMore(false);
    }
  }, [buildBusquedaUrl]);

  useEffect(() => {
    if (ocultarFiltrosFacultadCarrera) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ datos: FacultadItem[] }>('/academico/facultades?limit=500');
        if (!cancelled) setFacultades(data?.datos ?? []);
      } catch {
        if (!cancelled) setFacultades([]);
      } finally {
        if (!cancelled) setCatalogoFiltrosListo(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ocultarFiltrosFacultadCarrera]);

  useEffect(() => {
    if (ocultarFiltrosFacultadCarrera) return;
    let cancelled = false;
    void (async () => {
      try {
        const q = listaFacultadId
          ? `?facultadId=${encodeURIComponent(listaFacultadId)}&limit=500`
          : '?limit=500';
        const data = await apiFetch<{ datos: CarreraItem[] }>(`/academico/carreras${q}`);
        if (!cancelled) setCarreras(data?.datos ?? []);
      } catch {
        if (!cancelled) setCarreras([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listaFacultadId, ocultarFiltrosFacultadCarrera]);

  // Debounce: primera carga inmediata; luego 350ms al cambiar texto o filtros de listado
  const listadoDebounceInicial = useRef(false);
  useEffect(() => {
    if (!filtrosAlumnosListos) return;
    const delay = listadoDebounceInicial.current ? 350 : 0;
    listadoDebounceInicial.current = true;
    const timer = setTimeout(() => {
      void buscar(termino);
    }, delay);
    return () => clearTimeout(timer);
  }, [termino, listaFacultadId, listaCarreraId, listaSemestreCurricular, buscar, filtrosAlumnosListos]);

  // IntersectionObserver: carga más al llegar al final de la lista
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          void cargarMas();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, cargarMas]);

  const cargarFicha = useCallback(async (alumnoId: string) => {
    setFichaLoading(true);
    try {
      const data = await apiFetch<FichaAlumno>(`/reportes/alumnos/${alumnoId}/historial`);
      setFicha(data);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo cargar la ficha académica';
      toast.error(msg);
      setFicha(null);
    } finally {
      setFichaLoading(false);
    }
  }, []);

  const refrescarFichaSilenciosa = useCallback(async (alumnoId: string) => {
    try {
      const data = await apiFetch<FichaAlumno>(`/reportes/alumnos/${alumnoId}/historial`);
      setFicha(data);
    } catch {
      /* no sustituir ficha si falla un refresco en segundo plano */
    }
  }, []);

  useEffect(() => {
    if (!selectedAlumnoId) return;
    void cargarFicha(selectedAlumnoId);
  }, [selectedAlumnoId, cargarFicha]);

  const justificacionesAgrupadas = useMemo(
    () => agruparJustificacionesPorCarga(justificacionesAlumno, claveGrupoJustificacionCarga),
    [justificacionesAlumno]
  );

  const resolverJustificacionGrupo = useCallback(
    async (ids: number[], accion: 'aprobar' | 'rechazar') => {
      if (!selectedAlumnoId || !ids.length) return;
      const idRef = ids[0];
      setResolviendoJustId(idRef);
      const comentarios = comentariosJustModal[idRef]?.trim() || undefined;
      try {
        await Promise.all(
          ids.map((justificacionId) =>
            apiFetch(`/asistencias/justificaciones/${justificacionId}/resolucion`, {
              method: 'POST',
              body: JSON.stringify({ accion, comentarios }),
            })
          )
        );
        const etiqueta = ids.length > 1 ? `${ids.length} justificaciones` : 'Justificación';
        toast.success(
          `${etiqueta} ${accion === 'aprobar' ? 'aprobadas' : 'rechazadas'} correctamente.`
        );
        const list = await apiFetch<ApiList<JustificacionAlumnoFicha>>(
          `/reportes/alumnos/${selectedAlumnoId}/justificaciones`
        );
        setJustificacionesAlumno(list?.datos ?? []);
        await refrescarFichaSilenciosa(selectedAlumnoId);
        setComentariosJustModal((prev) => {
          const next = { ...prev };
          for (const id of ids) delete next[id];
          return next;
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo registrar la resolución');
      } finally {
        setResolviendoJustId(null);
      }
    },
    [selectedAlumnoId, comentariosJustModal, refrescarFichaSilenciosa]
  );

  const descargarInformeAlumno = useCallback(async () => {
    if (!selectedAlumnoId) {
      toast.error('Selecciona un alumno para generar su informe.');
      return;
    }
    setGenerandoInforme(true);
    try {
      await generarYAbrirPdf(`/reportes/alumnos/${selectedAlumnoId}/informe-pdf`, {
        method: 'POST',
      });
      toast.success('Informe individual generado correctamente.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo generar el informe individual';
      toast.error(msg);
    } finally {
      setGenerandoInforme(false);
    }
  }, [selectedAlumnoId]);

  useEffect(() => {
    setAnioPromedioSeleccionado(null);
  }, [selectedAlumnoId]);

  useEffect(() => {
    if (!ficha?.resumen) return;
    setAnioPromedioSeleccionado(ficha.resumen.anioPromedioAsistencia);
  }, [ficha?.alumno?.id, ficha?.resumen?.anioPromedioAsistencia]);

  const anioPromedioOptions = useMemo(() => {
    const raw = (ficha?.trayectoria ?? []).map((t) => Number(t.anio)).filter((a) => Number.isFinite(a));
    return [...new Set(raw)].sort((a, b) => b - a);
  }, [ficha]);

  const trayectoriaFiltrada = useMemo(() => {
    const rows = ficha?.trayectoria ?? [];
    if (anioPromedioSeleccionado == null) return rows;
    return rows.filter((item) => Number(item.anio) === anioPromedioSeleccionado);
  }, [ficha, anioPromedioSeleccionado]);

  useEffect(() => {
    if (anioPromedioSeleccionado == null) return;
    const añosDisponibles = [
      ...new Set((ficha?.trayectoria ?? []).map((t) => Number(t.anio)).filter((a) => Number.isFinite(a))),
    ];
    if (!añosDisponibles.length) return;
    if (!añosDisponibles.includes(anioPromedioSeleccionado)) {
      setAnioPromedioSeleccionado(Math.max(...añosDisponibles));
    }
  }, [ficha?.trayectoria, anioPromedioSeleccionado]);

  const promedioTrayectoriaVisible = useMemo(() => {
    if (anioPromedioSeleccionado == null) return null;
    const conAsistencia = trayectoriaFiltrada.filter((item) =>
      tieneAsistenciaRegistrada(item.sesiones_registradas)
    );
    if (!conAsistencia.length) return null;
    const sum = conAsistencia.reduce((acc, item) => acc + Number(item.porcentaje_asistencia ?? 0), 0);
    return {
      pct: sum / conAsistencia.length,
      count: conAsistencia.length,
      anio: anioPromedioSeleccionado,
    };
  }, [trayectoriaFiltrada, anioPromedioSeleccionado]);

  const muestraComparacionHistorico =
    ficha != null &&
    anioPromedioSeleccionado != null &&
    anioPromedioSeleccionado !== ficha.resumen.anioPromedioAsistencia;

  const hayFiltrosListado = useMemo(
    () =>
      esJefeCarrera
        ? Boolean(listaSemestreCurricular)
        : Boolean(listaFacultadId || listaCarreraId || listaSemestreCurricular),
    [esJefeCarrera, listaFacultadId, listaCarreraId, listaSemestreCurricular]
  );

  useEffect(() => {
    if (!selectedAlumnoId) {
      setJustificacionesAlumno([]);
      return;
    }
    let cancelled = false;
    setJustificacionesLoading(true);
    void apiFetch<ApiList<JustificacionAlumnoFicha>>(`/reportes/alumnos/${selectedAlumnoId}/justificaciones`)
      .then((data) => {
        if (!cancelled) setJustificacionesAlumno(data?.datos ?? []);
      })
      .catch((error) => {
        if (!cancelled) {
          setJustificacionesAlumno([]);
          const msg = error instanceof Error ? error.message : 'No se pudieron cargar las justificaciones';
          toast.error(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setJustificacionesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAlumnoId]);

  useEffect(() => {
    setJustificacionesDialogOpen(false);
  }, [selectedAlumnoId]);

  type CamposNombreAlumno = {
    nombres?: string | null;
    apellidos?: string | null;
    nombre_apellido?: string | null;
    numero_documento?: string | null;
  };

  /** Nombre para listado/ficha: prioriza apellidos+nombres; si faltan (p. ej. solo import con nombre_apellido), usa ese campo. */
  function displayNombreAlumno(a: CamposNombreAlumno): string {
    const ap = a.apellidos?.trim();
    const nom = a.nombres?.trim();
    if (ap && nom) return `${ap}, ${nom}`;
    if (ap || nom) return ap || nom || '';
    const na = a.nombre_apellido?.trim();
    if (na) return na;
    const ci = a.numero_documento?.trim();
    return ci ? `CI ${ci}` : 'Alumno';
  }

  function getInitialsAlumno(a: CamposNombreAlumno): string {
    const n = a.nombres?.trim() ?? '';
    const ap = a.apellidos?.trim() ?? '';
    if (n && ap) return ((n[0] ?? '') + (ap[0] ?? '')).toUpperCase();
    if (n || ap) return ((n[0] ?? '') + (ap[0] ?? '')).toUpperCase();
    const na = a.nombre_apellido?.trim();
    if (na) {
      const partes = na.split(',').map((s) => s.trim()).filter(Boolean);
      if (partes.length >= 2) {
        const apellidoBloque = partes[0];
        const nombreBloque = partes.slice(1).join(' ');
        return ((apellidoBloque[0] ?? '') + (nombreBloque[0] ?? '')).toUpperCase();
      }
      const words = na.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        return ((words[0][0] ?? '') + (words[words.length - 1][0] ?? '')).toUpperCase();
      }
      if (words.length === 1) return (words[0][0] ?? '?').toUpperCase();
    }
    const digits = (a.numero_documento ?? '').replace(/\D/g, '');
    if (digits.length >= 2) return digits.slice(-2).toUpperCase();
    return '?';
  }

  /**
   * Tercera línea del listado: prioriza facultad/carrera declaradas al importar (`referencia_*`).
   * Solo si no hay dato de importación se usan las carreras inferidas por matrículas (módulo académico).
   */
  function lineaProgramaAlumnoLista(item: AlumnoBusqueda): string {
    const fac = item.facultad_referencia_nombre?.trim();
    const car = item.carrera_referencia_nombre?.trim();
    const refStr = [fac, car].filter(Boolean).join(' · ');
    const sem = etiquetaSemestreCurricularAlumno(item.semestre_curricular);
    const parts = [refStr, sem].filter(Boolean);
    if (parts.length) return parts.join(' · ');

    const matStr = typeof item.carreras === 'string' ? item.carreras.trim() : '';
    if (matStr) return matStr;

    const nMat = Number(item.total_matriculas ?? 0) || 0;
    return nMat === 0 ? 'Sin matrículas aún' : '—';
  }

  /** Resumen corto para filas del listado en móvil (más alumnos visibles por pantalla). */
  function lineaProgramaAlumnoListaMovil(item: AlumnoBusqueda): string {
    const car = item.carrera_referencia_nombre?.trim();
    const sem = etiquetaSemestreCurricularAlumno(item.semestre_curricular);
    const parts = [car, sem].filter(Boolean);
    if (parts.length) return parts.join(' · ');
    const matStr = typeof item.carreras === 'string' ? item.carreras.trim() : '';
    if (matStr) return matStr.length > 48 ? `${matStr.slice(0, 45)}…` : matStr;
    const nMat = Number(item.total_matriculas ?? 0) || 0;
    return nMat === 0 ? 'Sin matrículas' : '';
  }

  function getAsistenciaColor(pct: number) {
    if (pct >= 75) return 'text-emerald-700 dark:text-emerald-300';
    if (pct >= 50) return 'text-amber-700 dark:text-amber-300';
    return 'text-rose-700 dark:text-rose-300';
  }

  function getBarColor(pct: number) {
    if (pct >= 75) return 'bg-emerald-500 dark:bg-emerald-400';
    if (pct >= 50) return 'bg-amber-500 dark:bg-amber-400';
    return 'bg-rose-500 dark:bg-rose-400';
  }

  function getEstadoBadge(estado: string) {
    const e = estado?.toLowerCase();
    if (e === 'activo') return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
    if (e === 'regular') return 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300';
    if (e === 'irregular' || e === 'libre') return 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300';
    return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }

  function etiquetaEstadoAcademico(estado: string): string {
    const e = estado?.toLowerCase();
    if (e === 'irregular' || e === 'libre') return 'Irregular';
    if (e === 'en_riesgo') return 'En riesgo';
    if (e === 'regular') return 'Regular';
    return estado || '—';
  }

  function etiquetaEstadoRevision(estado: string | null) {
    const e = (estado ?? '').toLowerCase();
    if (e === 'pendiente') return 'Pendiente';
    if (e === 'aprobada' || e === 'aprobado') return 'Aprobada';
    if (e === 'rechazada' || e === 'rechazado') return 'Rechazada';
    return estado || '—';
  }

  function claseBadgeRevision(estado: string | null) {
    const e = (estado ?? '').toLowerCase();
    if (e === 'pendiente') {
      return 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200';
    }
    if (e === 'aprobada' || e === 'aprobado') {
      return 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200';
    }
    if (e === 'rechazada' || e === 'rechazado') {
      return 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-200';
    }
    return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }

  return (
    <div className="system-bg app-shell-viewport text-slate-800 dark:text-[#e7eef9] min-h-screen h-screen overflow-hidden">
      <div className="app-layout-row">
        {sidebarOpen ? (
          <div className="app-sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
        ) : null}

        <AppSidebar sidebarOpen={sidebarOpen} onLogout={onLogout} onClose={() => setSidebarOpen(false)} />

        <main className="app-layout-main">
          <header className="flex-shrink-0 min-h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 flex flex-wrap items-center px-4 sm:px-6 gap-3 py-3 z-10 dark:bg-[#132a52]/90 dark:border-slate-800">
            <button
              className="lg:hidden shrink-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="material-symbols-outlined shrink-0 text-blue-600 dark:text-[#6b8bc3]">badge</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-widest text-slate-500">Secretaría</p>
              <h1 className="text-xl font-semibold leading-none text-slate-900 dark:text-[#e7eef9]">Alumnos</h1>
            </div>
          </header>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-5 max-lg:gap-2 max-lg:p-3">

            <div className={`relative shrink-0 ${selectedAlumnoId ? 'max-lg:hidden' : ''}`}>
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] max-lg:left-2.5 max-lg:text-[18px]">
                search
              </span>
              <input
                type="search"
                aria-label="Buscar alumno por CI, nombre o apellido"
                className={`w-full rounded-xl border pl-12 pr-12 py-3 text-sm max-lg:py-2.5 max-lg:pl-9 max-lg:pr-9 max-lg:text-xs ${inpList}`}
                placeholder="CI, nombre o apellido…"
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                autoFocus
              />
              {loading ? (
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] animate-spin max-lg:right-2.5 max-lg:text-[18px]">
                  progress_activity
                </span>
              ) : termino ? (
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 max-lg:right-2.5"
                  onClick={() => setTermino('')}
                  aria-label="Limpiar búsqueda"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              ) : null}
            </div>

            {esJefeCarrera || !ocultarFiltrosFacultadCarrera ? (
              <div className={`shrink-0 ${selectedAlumnoId ? 'max-lg:hidden' : ''}`}>
                <button
                  type="button"
                  className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left shadow-sm dark:border-slate-800/80 dark:bg-[#0e1e38]/90 dark:shadow-none lg:hidden"
                  onClick={() => setFiltrosMovilAbiertos((v) => !v)}
                  aria-expanded={filtrosMovilAbiertos}
                >
                  <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-300">
                    <span className="material-symbols-outlined shrink-0 text-[20px] text-slate-500">filter_alt</span>
                    <span className="text-sm font-medium">Filtros del listado</span>
                    {hayFiltrosListado ? (
                      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800 dark:bg-blue-500/20 dark:text-blue-200">
                        Activos
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`material-symbols-outlined shrink-0 text-slate-500 transition-transform ${filtrosMovilAbiertos ? 'rotate-180' : ''}`}
                  >
                    expand_more
                  </span>
                </button>
              <div
                className={`rounded-xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm dark:border-slate-800/80 dark:bg-[#0e1e38]/80 dark:shadow-none ${
                  !filtrosMovilAbiertos ? 'max-lg:hidden' : ''
                }`}
              >
                <div className="mb-3 hidden flex-wrap items-center gap-2 text-slate-600 dark:text-slate-400 lg:flex">
                  <span className="material-symbols-outlined shrink-0 text-[20px]">filter_alt</span>
                  <span className="text-xs font-semibold uppercase tracking-wider leading-tight">
                    {esJefeCarrera ? 'Semestre curricular' : 'Facultad, carrera y semestre curricular'}
                  </span>
                </div>
                {!filtrosAlumnosListos ? (
                  <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                    {!esJefeCarrera ? (
                      <ScopeSelectorSkeleton
                        gridClassName="grid min-w-0 grid-cols-1 gap-4 w-full lg:grid-cols-2 lg:flex-1"
                        className="w-full min-w-0"
                      />
                    ) : null}
                    <div className="h-10 w-full max-w-[11rem] rounded-lg bg-slate-200 animate-pulse dark:bg-white/10" />
                  </div>
                ) : (
                <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end min-w-0">
                  {!esJefeCarrera ? (
                    <>
                      <ScopeSelector
                        className="w-full min-w-0 lg:flex-1 lg:min-w-[160px]"
                        label="Facultad"
                        options={facultadesDisponibles}
                        value={listaFacultadId}
                        placeholder="Seleccioná facultad"
                        allowEmptyOption
                        emptyOptionLabel="Todas"
                        controlClassName={inpList}
                        onChange={(id) => {
                          setListaFacultadId(id);
                          setListaCarreraId('');
                        }}
                      />
                      <ScopeSelector
                        className="w-full min-w-0 lg:flex-1 lg:min-w-[180px]"
                        label="Carrera"
                        options={carrerasDisponibles}
                        value={listaCarreraId}
                        placeholder="Seleccioná carrera"
                        allowEmptyOption
                        emptyOptionLabel="Todas"
                        disabled={requiereElegirFacultad}
                        controlClassName={inpList}
                        onChange={setListaCarreraId}
                      />
                    </>
                  ) : null}
                  <label className="flex w-full min-w-0 flex-col gap-1 lg:w-[11rem] lg:shrink-0">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500">
                      Semestre curricular
                    </span>
                    <AppSelect
                      value={listaSemestreCurricular}
                      onChange={setListaSemestreCurricular}
                      allowEmpty
                      emptyLabel={esJefeCarrera ? 'Todos los semestres' : 'Todos'}
                      options={Array.from({ length: 10 }, (_, i) => i + 1).map((n) => ({
                        value: String(n),
                        label: `${n}° semestre`,
                      }))}
                      triggerClassName={`w-full ${inpList}`}
                    />
                  </label>
                  {!esJefeCarrera ? (
                    <button
                      type="button"
                      className="btn-modern btn-modern-ghost btn-modern-sm btn-mobile-cta w-full shrink-0 lg:w-auto"
                      onClick={() => {
                        setListaFacultadId('');
                        setListaCarreraId('');
                        setListaSemestreCurricular('');
                      }}
                    >
                      Quitar filtros
                    </button>
                  ) : listaSemestreCurricular ? (
                    <button
                      type="button"
                      className="btn-modern btn-modern-ghost btn-modern-sm btn-mobile-cta w-full shrink-0 lg:w-auto"
                      onClick={() => setListaSemestreCurricular('')}
                    >
                      Quitar semestre
                    </button>
                  ) : null}
                </div>
                )}
              </div>
              </div>
            ) : null}

            {/* Layout principal */}
            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-4 overflow-hidden max-lg:flex max-lg:flex-col max-lg:gap-0 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">

              <aside
                className={`min-w-0 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0e1e38] dark:shadow-none ${
                  selectedAlumnoId ? 'max-lg:hidden' : 'max-lg:flex max-lg:min-h-0 max-lg:flex-1'
                } lg:flex lg:min-h-0 lg:flex-1`}
              >
                {/* Encabezado listado — móvil: título legible; escritorio: sin cambios */}
                <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-800/60 max-lg:py-2.5 lg:py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 max-lg:gap-1.5 lg:gap-2">
                        <span className="material-symbols-outlined shrink-0 text-slate-500 text-[18px] dark:text-slate-400 max-lg:text-[20px] lg:text-[16px]">
                          group
                        </span>
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-[#e7eef9] max-lg:normal-case max-lg:tracking-normal lg:text-xs lg:font-semibold lg:uppercase lg:tracking-wider lg:text-slate-600 dark:lg:text-slate-400">
                          {termino.trim()
                            ? 'Resultados'
                            : hayFiltrosListado
                              ? 'Alumnos filtrados'
                              : 'Todos los alumnos'}
                        </p>
                      </div>
                      {resultados.length > 0 ? (
                        <p className="mt-1 pl-7 text-xs text-slate-500 dark:text-slate-400 lg:hidden">
                          {resultados.length}
                          {hasMore ? '+' : ''} en el listado · tocá un nombre para abrir la ficha
                        </p>
                      ) : null}
                    </div>
                    {resultados.length > 0 ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-200 max-lg:hidden">
                        {resultados.length}
                        {hasMore ? '+' : ''}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="scroll-region app-scroll-content flex min-h-0 flex-1 flex-col max-lg:overflow-y-auto">
                  {resultados.length === 0 && !loading && (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10">
                      <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-600">
                        person_search
                      </span>
                      <p className="text-center text-sm text-slate-500 dark:text-slate-500">No se encontraron alumnos</p>
                    </div>
                  )}

                  <ul className="min-w-0 max-lg:divide-y max-lg:divide-slate-100 dark:max-lg:divide-slate-800/70">
                    {resultados.map((item) => {
                      const isSelected = selectedAlumnoId === item.id;
                      const programaMovil = lineaProgramaAlumnoListaMovil(item);
                      const matriculas = Number(item.total_matriculas ?? 0);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`flex w-full gap-3 text-left transition-colors max-lg:items-start max-lg:px-4 max-lg:py-3 max-lg:active:bg-slate-50 dark:max-lg:active:bg-slate-800/50 lg:items-start lg:gap-3 lg:border-l-2 lg:px-4 lg:py-3 ${
                              isSelected
                                ? 'bg-blue-50 border-blue-500 dark:bg-blue-500/10 max-lg:bg-blue-50/90'
                                : 'lg:border-transparent lg:hover:border-slate-600 lg:hover:bg-slate-50 dark:lg:hover:bg-slate-800/30'
                            }`}
                            onClick={() => setSelectedAlumnoId(item.id)}
                          >
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold max-lg:h-9 max-lg:w-9 max-lg:text-[11px] lg:mt-0.5 lg:h-9 lg:w-9 ${
                                isSelected
                                  ? 'bg-blue-200/80 text-blue-900 dark:bg-blue-500/20 dark:text-blue-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {getInitialsAlumno(item)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-[15px] font-medium leading-snug max-lg:break-words max-lg:text-sm max-lg:whitespace-normal lg:truncate lg:text-sm ${
                                  isSelected ? 'text-blue-900 dark:text-blue-200' : 'text-slate-900 dark:text-[#e7eef9]'
                                }`}
                              >
                                {displayNombreAlumno(item)}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500 lg:hidden">CI {item.numero_documento}</p>
                              {programaMovil ? (
                                <p className="text-[11px] leading-snug text-slate-500 break-words dark:text-slate-400 lg:hidden">
                                  {programaMovil}
                                </p>
                              ) : null}
                              <p className="mt-0.5 hidden text-xs text-slate-500 lg:block">CI {item.numero_documento}</p>
                              {item.cohorte_anio ? (
                                <p className="mt-0.5 hidden text-[11px] text-slate-400 dark:text-slate-500 lg:block">
                                  Año ingreso {item.cohorte_anio}
                                </p>
                              ) : null}
                              {lineaProgramaAlumnoLista(item) ? (
                                <p className="mt-0.5 hidden text-[11px] leading-snug text-slate-500 dark:text-slate-600 lg:block lg:truncate">
                                  {lineaProgramaAlumnoLista(item)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1 self-center max-lg:pt-0.5 max-lg:flex-row max-lg:items-center max-lg:gap-0.5">
                              {matriculas > 0 ? (
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 dark:bg-slate-700/80 dark:text-slate-300 lg:rounded-full lg:px-2 lg:text-[11px]">
                                  {matriculas}
                                </span>
                              ) : null}
                              <span
                                className="material-symbols-outlined text-[22px] text-slate-300 dark:text-slate-600 lg:hidden"
                                aria-hidden
                              >
                                chevron_right
                              </span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <div ref={sentinelRef} className="flex h-10 shrink-0 items-center justify-center">
                    {loadingMore ? (
                      <span className="material-symbols-outlined animate-spin text-[18px] text-slate-400 dark:text-slate-500">
                        progress_activity
                      </span>
                    ) : null}
                  </div>
                </div>
              </aside>

              <div
                className={`min-w-0 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0e1e38] dark:shadow-none ${
                  selectedAlumnoId ? 'max-lg:flex max-lg:min-h-0 max-lg:flex-1' : 'max-lg:hidden'
                } lg:flex lg:min-h-0 lg:flex-1`}
              >
                {selectedAlumnoId ? (
                  <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-[#0c1a32]/50 lg:hidden">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200/80 dark:text-slate-200 dark:hover:bg-slate-800/60"
                      onClick={() => {
                        setSelectedAlumnoId(null);
                        setFicha(null);
                      }}
                      aria-label="Volver al listado de alumnos"
                    >
                      <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                      Volver al listado
                    </button>
                  </div>
                ) : null}

                {/* Estado vacío (solo escritorio; en móvil no hay panel sin selección) */}
                {!fichaLoading && !ficha && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 max-lg:hidden">
                    <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center dark:bg-blue-500/10">
                      <span className="material-symbols-outlined text-blue-600 text-[36px] dark:text-blue-400">person_pin</span>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-slate-700 dark:text-slate-300">Ficha académica unificada</p>
                      <p className="text-sm text-slate-500 mt-1 dark:text-slate-500">
                        Selecciona un alumno de la lista para ver su historial completo
                      </p>
                    </div>
                  </div>
                )}

                {fichaLoading && (
                  <div className="flex-1 flex items-center justify-center gap-3">
                    <span className="material-symbols-outlined text-slate-400 text-[22px] animate-spin">progress_activity</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Cargando ficha...</span>
                  </div>
                )}

                {!fichaLoading && ficha && (
                  <>
                  <div className="scroll-region app-scroll-content flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">

                    <div className="shrink-0 flex flex-col gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-800 max-lg:gap-2 sm:px-5 sm:py-4 lg:flex-row lg:items-center lg:gap-4">
                      <div className="flex min-w-0 items-start gap-3 lg:items-center lg:gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-sm font-bold text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300 max-lg:h-10 max-lg:w-10 lg:h-12 lg:w-12 lg:text-base">
                          {getInitialsAlumno(ficha.alumno)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base font-semibold leading-snug text-slate-900 max-lg:break-words dark:text-[#e7eef9] sm:text-lg lg:truncate">
                            {displayNombreAlumno(ficha.alumno)}
                          </h2>
                          <p className="text-sm text-slate-500 dark:text-slate-400">CI {ficha.alumno.numero_documento}</p>
                          {(ficha.alumno.facultad_referencia_nombre ||
                            ficha.alumno.carrera_referencia_nombre ||
                            etiquetaSemestreCurricularAlumno(ficha.alumno.semestre_curricular) ||
                            ficha.alumno.cohorte_anio) && (
                            <p className="mt-0.5 hidden text-xs leading-relaxed text-slate-600 dark:text-slate-400 lg:block">
                              {[ficha.alumno.facultad_referencia_nombre, ficha.alumno.carrera_referencia_nombre, etiquetaSemestreCurricularAlumno(ficha.alumno.semestre_curricular), ficha.alumno.cohorte_anio ? `Año ingreso ${ficha.alumno.cohorte_anio}` : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="w-full lg:hidden">
                        <MetaAlumnoFichaMovil alumno={ficha.alumno} />
                      </div>
                      <button
                        type="button"
                        className="btn-modern btn-modern-ghost btn-modern-sm btn-mobile-cta flex w-full shrink-0 items-center justify-center gap-1.5 lg:w-auto"
                        onClick={() => void descargarInformeAlumno()}
                        disabled={generandoInforme}
                      >
                        <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                        {generandoInforme ? 'Generando...' : 'Informe PDF'}
                      </button>
                    </div>

                    <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-slate-200 px-3 py-3 dark:border-slate-800 max-lg:gap-2 sm:gap-3 sm:px-5 sm:py-4 lg:grid-cols-4">
                      {[
                        { label: 'Matrículas', value: ficha.resumen.totalMatriculas, icon: 'school', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-500/10' },
                        { label: 'Activas', value: ficha.resumen.activas, icon: 'check_circle', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-500/10' },
                        { label: 'Ausencias', value: ficha.resumen.totalAusencias, icon: 'event_busy', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-500/10' },
                        { label: 'Justificadas', value: ficha.resumen.totalJustificadas, icon: 'task_alt', color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-500/10' },
                      ].map((stat) => {
                        const cuerpo = (
                          <>
                            <div className={`rounded-lg p-1.5 max-lg:p-1 ${stat.bg} shrink-0`}>
                              <span className={`material-symbols-outlined text-[16px] max-lg:text-[15px] lg:text-[18px] ${stat.color}`}>
                                {stat.icon}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-500 max-lg:leading-tight">
                                {stat.label}
                              </p>
                              <p className={`text-lg font-bold tabular-nums max-lg:text-base lg:text-xl ${stat.color}`}>
                                {stat.value}
                              </p>
                            </div>
                          </>
                        );
                        const claseTarjeta =
                          'flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-left dark:border-slate-800 dark:bg-[#132a52]/40 max-lg:min-h-0 lg:gap-3 lg:p-3';

                        return stat.label === 'Justificadas' ? (
                          <button
                            key={stat.label}
                            type="button"
                            onClick={() => setJustificacionesDialogOpen(true)}
                            aria-label="Ver justificaciones presentadas y documentos PDF"
                            className={`${claseTarjeta} hover:bg-slate-100 hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50 dark:hover:bg-[#1a335c]/80 dark:hover:border-slate-600`}
                          >
                            {cuerpo}
                          </button>
                        ) : (
                          <div key={stat.label} className={claseTarjeta}>
                            {cuerpo}
                          </div>
                        );
                      })}
                    </div>

                    <div className="shrink-0 border-b border-slate-200 px-3 py-2 dark:border-slate-800 sm:px-5 sm:py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-gradient-to-r from-slate-50 via-white to-slate-50/80 px-3 py-2.5 shadow-sm dark:border-slate-700/70 dark:from-[#0c1628] dark:via-[#101d32] dark:to-[#0c1628] dark:shadow-none max-lg:gap-2 lg:gap-3 lg:px-4 lg:py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200/80 bg-blue-50 dark:border-blue-500/25 dark:bg-blue-500/10 lg:h-10 lg:w-10"
                            aria-hidden
                          >
                            <span className="material-symbols-outlined text-[18px] text-blue-600 dark:text-blue-300 lg:text-[20px]">
                              calendar_month
                            </span>
                          </div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            Trayectoria · año
                          </p>
                        </div>
                        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto lg:flex-col lg:items-end lg:gap-2">
                          <label
                            htmlFor="anio-trayectoria"
                            className="sr-only"
                          >
                            Año
                          </label>
                          <AppSelect
                            aria-label="Año de trayectoria"
                            value={anioPromedioSeleccionado != null ? String(anioPromedioSeleccionado) : ''}
                            disabled={!anioPromedioOptions.length}
                            onChange={(v) => setAnioPromedioSeleccionado(Number(v))}
                            options={anioPromedioOptions.map((a) => ({
                              value: String(a),
                              label: String(a),
                            }))}
                            triggerClassName={`${inpYearSelect} max-lg:min-h-[2.25rem] max-lg:flex-1`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Trayectoria: tarjetas en móvil, tabla en escritorio */}
                    <div className="flex min-h-0 flex-1 flex-col max-lg:flex-none">
                      <div className="min-h-0 flex-1 max-lg:flex-none lg:scroll-region lg:overflow-y-auto">
                        <ul className="divide-y divide-slate-200 dark:divide-slate-800/70 lg:hidden">
                          {trayectoriaFiltrada.map((item) => {
                            const sinRegistros = !tieneAsistenciaRegistrada(item.sesiones_registradas);
                            const pct = Number(item.porcentaje_asistencia ?? 0);
                            const etiquetaPct = etiquetaPorcentajeAsistencia(
                              item.porcentaje_asistencia,
                              item.sesiones_registradas
                            );
                            return (
                              <li key={`${item.matricula_id}-${item.anio}-${item.mes}`} className="px-3 py-3">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-slate-900 dark:text-[#e7eef9]">
                                    {item.materia}
                                  </p>
                                  <span
                                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getEstadoBadge(item.estado_academico)}`}
                                  >
                                    {etiquetaEstadoAcademico(item.estado_academico)}
                                  </span>
                                </div>
                                <p className="mt-1 break-words text-xs text-slate-600 dark:text-slate-400">
                                  {item.carrera}
                                </p>
                                {item.facultad ? (
                                  <p className="mt-0.5 break-words text-[11px] text-slate-500 dark:text-slate-500">
                                    {item.facultad}
                                  </p>
                                ) : null}
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                                  <span>
                                    <span className="text-slate-500">Periodo </span>
                                    {String(item.mes).padStart(2, '0')}/{item.anio}
                                  </span>
                                  <span>
                                    <span className="text-slate-500">Faltas </span>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                                      {item.faltas_acumuladas ?? 0}
                                    </span>
                                  </span>
                                </div>
                                <div className="mt-2">
                                  {sinRegistros ? (
                                    <span className="text-xs text-slate-500">{etiquetaPct}</span>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                        <div
                                          className={`h-full rounded-full ${getBarColor(pct)}`}
                                          style={{ width: `${Math.min(pct, 100)}%` }}
                                        />
                                      </div>
                                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${getAsistenciaColor(pct)}`}>
                                        {etiquetaPct}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                          {!trayectoriaFiltrada.length ? (
                            <li className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-500">
                              Sin registros de trayectoria para el año {anioPromedioSeleccionado ?? '—'}.
                            </li>
                          ) : null}
                        </ul>

                        <table className="hidden w-full min-w-0 text-sm lg:table">
                          <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-600 dark:border-slate-800 dark:bg-[#0b1827] dark:text-slate-400">
                            <tr>
                              <th className="px-4 py-2.5 text-left font-medium">Materia</th>
                              <th className="px-4 py-2.5 text-left font-medium">Carrera</th>
                              <th className="px-4 py-2.5 text-left font-medium">Periodo</th>
                              <th className="px-4 py-2.5 text-left font-medium">Asistencia</th>
                              <th className="px-4 py-2.5 text-left font-medium">Faltas</th>
                              <th className="px-4 py-2.5 text-left font-medium">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trayectoriaFiltrada.map((item) => {
                              const sinRegistros = !tieneAsistenciaRegistrada(item.sesiones_registradas);
                              const pct = Number(item.porcentaje_asistencia ?? 0);
                              const etiquetaPct = etiquetaPorcentajeAsistencia(
                                item.porcentaje_asistencia,
                                item.sesiones_registradas
                              );
                              return (
                                <tr
                                  key={`${item.matricula_id}-${item.anio}-${item.mes}`}
                                  className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/20"
                                >
                                  <td className="px-4 py-3">
                                    <p className="font-medium text-slate-900 dark:text-[#e7eef9]">{item.materia}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-500">{item.facultad}</p>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{item.carrera}</td>
                                  <td className="px-4 py-3">
                                    <span className="text-sm text-slate-700 dark:text-slate-300">
                                      {String(item.mes).padStart(2, '0')}/{item.anio}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    {sinRegistros ? (
                                      <span className="text-sm text-slate-500 dark:text-slate-500">{etiquetaPct}</span>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden dark:bg-slate-700">
                                          <div
                                            className={`h-full rounded-full ${getBarColor(pct)}`}
                                            style={{ width: `${Math.min(pct, 100)}%` }}
                                          />
                                        </div>
                                        <span className={`text-sm font-medium ${getAsistenciaColor(pct)}`}>
                                          {etiquetaPct}
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{item.faltas_acumuladas ?? 0}</td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-xs border ${getEstadoBadge(item.estado_academico)}`}>
                                      {etiquetaEstadoAcademico(item.estado_academico)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                            {!trayectoriaFiltrada.length && (
                              <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-500">
                                  Sin registros de trayectoria para el año {anioPromedioSeleccionado ?? '—'}.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="shrink-0 border-t border-slate-200 bg-slate-50/95 px-3 py-2.5 dark:border-slate-800 dark:bg-[#0b1827]/90 sm:px-4 sm:py-3">
                        {promedioTrayectoriaVisible ? (
                          <div className="flex items-center justify-between gap-3 max-lg:flex-wrap">
                            <div className="flex min-w-0 items-center gap-2">
                              <div
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#132a52]/50 dark:shadow-none lg:h-9 lg:w-9"
                                aria-hidden
                              >
                                <span className="material-symbols-outlined text-[16px] text-slate-600 dark:text-slate-300 lg:text-[18px]">
                                  analytics
                                </span>
                              </div>
                              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 lg:text-[17px]">
                                Promedio {promedioTrayectoriaVisible.anio}
                              </p>
                            </div>
                            <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
                              <span
                                className={`text-lg font-semibold tabular-nums tracking-tight sm:text-2xl ${
                                  promedioTrayectoriaVisible.pct >= 75
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : promedioTrayectoriaVisible.pct >= 50
                                      ? 'text-amber-800 dark:text-amber-400'
                                      : 'text-rose-700 dark:text-rose-400'
                                }`}
                              >
                                {promedioTrayectoriaVisible.pct.toFixed(1)}%
                              </span>
                              {muestraComparacionHistorico ? (
                                <span className="max-w-[14rem] text-[10px] leading-snug text-slate-500 dark:text-slate-500 sm:max-w-md sm:text-[11px]">
                                  Hist. {ficha.resumen.anioPromedioAsistencia}:{' '}
                                  {ficha.resumen.promedioPorcentajeAsistenciaMaterias.toFixed(1)}% (
                                  {ficha.resumen.materiasPromedioAnio} mat.)
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-400">
                            <span className="material-symbols-outlined shrink-0 text-[18px] text-slate-400 dark:text-slate-500">
                              percent
                            </span>
                            <p className="text-xs leading-snug">
                              No hay materias registradas para el año {anioPromedioSeleccionado ?? '—'}. Probá con otro año en el selector.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <Dialog open={justificacionesDialogOpen} onOpenChange={setJustificacionesDialogOpen}>
                    <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[min(96vw,80rem)] gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl ring-1 ring-slate-200/70 dark:border-sky-500/25 dark:bg-gradient-to-b dark:from-[#1b355f] dark:to-[#142a4d] dark:shadow-2xl dark:ring-sky-400/15 lg:min-w-[32rem]">
                      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6 dark:border-white/10 dark:bg-black/20">
                        <DialogHeader className="space-y-1.5 text-left">
                          <div className="flex items-start gap-3">
                            <span
                              className="material-symbols-outlined mt-0.5 shrink-0 text-[24px] text-sky-600 dark:text-sky-300/90"
                              aria-hidden
                            >
                              folder_special
                            </span>
                            <div className="min-w-0 space-y-1">
                              <DialogTitle className="text-lg font-semibold tracking-tight">
                                Justificaciones presentadas
                              </DialogTitle>
                              <DialogDescription className="text-sm leading-snug">
                                {displayNombreAlumno(ficha.alumno)}{' '}
                                <span className="text-slate-400 dark:text-slate-500">·</span> CI {ficha.alumno.numero_documento}
                              </DialogDescription>
                            </div>
                          </div>
                        </DialogHeader>
                      </div>
                      <div className="px-4 py-3 sm:px-6 sm:py-4">
                        <div className="scroll-region max-h-[min(58vh,26rem)] rounded-xl border border-slate-200 bg-slate-50 shadow-inner dark:border-white/10 dark:bg-[#0c1a32]/60">
                          {justificacionesLoading ? (
                            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-600 dark:text-slate-400">
                              <span className="material-symbols-outlined animate-spin text-[22px] text-sky-600 dark:text-sky-400/80">
                                progress_activity
                              </span>
                              Cargando justificaciones…
                            </div>
                          ) : justificacionesAlumno.length === 0 ? (
                            <p className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-500">Sin registros</p>
                          ) : (
                            <table
                              className={`w-full table-fixed text-sm text-slate-800 dark:text-slate-200 ${
                                puedeResolverJustificaciones ? 'min-w-[44rem]' : 'min-w-[36rem]'
                              }`}
                            >
                              <colgroup>
                                <col className={puedeResolverJustificaciones ? 'w-[24%]' : 'w-[26%]'} />
                                <col className={puedeResolverJustificaciones ? 'w-[20%]' : 'w-[24%]'} />
                                <col className="w-[8%]" />
                                <col className="w-[10%]" />
                                <col className={puedeResolverJustificaciones ? 'w-[12%]' : 'w-[18%]'} />
                                {puedeResolverJustificaciones ? <col className="w-[14%]" /> : null}
                                <col className="w-[12%]" />
                              </colgroup>
                              <thead className="sticky top-0 z-[1] bg-slate-100 shadow-[0_1px_0_0_rgba(15,23,42,0.08)] dark:bg-[#0a162c] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                  <th className="px-4 py-3 text-left">Fecha(s) clase</th>
                                  <th className="px-4 py-3 text-left">Materia</th>
                                  <th className="px-4 py-3 text-left">Módulo</th>
                                  <th className="px-4 py-3 text-left">Estado</th>
                                  <th className="px-4 py-3 text-left">Motivo</th>
                                  {puedeResolverJustificaciones ? (
                                    <th className="px-4 py-3 text-left">Acciones</th>
                                  ) : null}
                                  <th className="px-4 py-3 text-right">Documento</th>
                                </tr>
                              </thead>
                              <tbody>
                                {justificacionesAgrupadas.map((g, idx) => {
                                  const j = g.representante;
                                  const pendiente = (j.estado_revision ?? '').toLowerCase() === 'pendiente';
                                  const resolviendoFila = g.ids.some((id) => resolviendoJustId === id);
                                  const idGrupo = g.ids[0];
                                  return (
                                  <tr
                                    key={g.ids.join('-')}
                                    className={`border-t border-slate-200 transition-colors hover:bg-slate-50/90 dark:border-white/[0.06] dark:hover:bg-white/[0.03] ${
                                      idx % 2 === 1 ? 'bg-slate-50/80 dark:bg-black/10' : 'bg-white dark:bg-transparent'
                                    }`}
                                  >
                                    <td className="px-4 py-3 align-top">
                                      <JustificacionFechasGrupo fechas={g.fechas} variant="light" />
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                      <div className="flex items-start gap-1.5 min-w-0">
                                        <span
                                          className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-slate-400 dark:text-slate-500"
                                          aria-hidden
                                        >
                                          menu_book
                                        </span>
                                        <span
                                          className="line-clamp-2 text-sm font-medium leading-snug text-slate-800 dark:text-slate-100"
                                          title={j.materia ?? ''}
                                        >
                                          {j.materia ?? '—'}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                                      {etiquetaModuloJustificacion(j.modulo_mes, j.modulo_anio) ? (
                                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                                          {etiquetaModuloJustificacion(j.modulo_mes, j.modulo_anio)}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 dark:text-slate-500">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                      <span
                                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${claseBadgeRevision(j.estado_revision)}`}
                                      >
                                        <span className="material-symbols-outlined text-[13px] leading-none" aria-hidden>
                                          {(j.estado_revision ?? '').toLowerCase() === 'aprobada'
                                            ? 'check_circle'
                                            : (j.estado_revision ?? '').toLowerCase() === 'rechazada'
                                              ? 'cancel'
                                              : 'schedule'}
                                        </span>
                                        {etiquetaEstadoRevision(j.estado_revision)}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                      <p className="text-sm leading-snug text-slate-600 line-clamp-3 dark:text-slate-300">
                                        {j.motivo?.trim() ? j.motivo : '—'}
                                      </p>
                                    </td>
                                    {puedeResolverJustificaciones ? (
                                      <td className="px-4 py-3 align-top">
                                        {pendiente ? (
                                          <div className="flex flex-col gap-2">
                                            <input
                                              type="text"
                                              aria-label="Comentario opcional para la resolución"
                                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-[#0b1827] dark:text-[#e7eef9] dark:placeholder:text-slate-500 dark:shadow-none"
                                              placeholder="Comentario (opcional)"
                                              value={comentariosJustModal[idGrupo] ?? ''}
                                              onChange={(e) =>
                                                setComentariosJustModal((prev) => ({
                                                  ...prev,
                                                  [idGrupo]: e.target.value,
                                                }))
                                              }
                                              disabled={resolviendoFila}
                                            />
                                            <div className="btn-mobile-row flex flex-wrap gap-1.5 max-lg:pt-1 lg:contents">
                                              <button
                                                type="button"
                                                className="btn-modern btn-modern-success btn-modern-xs btn-mobile-cta max-lg:min-h-10"
                                                disabled={resolviendoFila}
                                                onClick={() => void resolverJustificacionGrupo(g.ids, 'aprobar')}
                                              >
                                                <span className="material-symbols-outlined text-[14px] leading-none" aria-hidden>
                                                  check_circle
                                                </span>
                                                Aprobar{g.ids.length > 1 ? ` (${g.ids.length})` : ''}
                                              </button>
                                              <button
                                                type="button"
                                                className="btn-modern btn-modern-danger btn-modern-xs btn-mobile-cta max-lg:min-h-10"
                                                disabled={resolviendoFila}
                                                onClick={() => void resolverJustificacionGrupo(g.ids, 'rechazar')}
                                              >
                                                <span className="material-symbols-outlined text-[14px] leading-none" aria-hidden>
                                                  cancel
                                                </span>
                                                Rechazar
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                                        )}
                                      </td>
                                    ) : null}
                                    <td className="px-4 py-3 text-right align-middle whitespace-nowrap">
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
                                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-sky-600 bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:border-sky-700 hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-1 dark:border-sky-400/40 dark:bg-sky-500/30 dark:text-sky-50 dark:hover:border-sky-300/60 dark:hover:bg-sky-500/45 dark:focus-visible:ring-sky-400/60 dark:focus-visible:ring-offset-[#0c1a32]"
                                        >
                                          <span className="material-symbols-outlined text-[16px] leading-none" aria-hidden>
                                            picture_as_pdf
                                          </span>
                                          Ver PDF
                                        </a>
                                      ) : (
                                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                                      )}
                                    </td>
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  </>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}