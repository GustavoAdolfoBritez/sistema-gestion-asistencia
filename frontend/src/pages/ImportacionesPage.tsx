import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { AppSidebar } from '../components/AppSidebar';
import { AppSelect } from '../components/ui/app-select';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import {
  ImportConfirmOverlay,
  type ImportConfirmPhase,
} from '../components/importaciones/ImportConfirmOverlay';
import {
  ImportFileUploadZone,
  type ImportUploadPhase,
} from '../components/importaciones/ImportFileUploadZone';
import { apiFetch } from '../utils/api';

type RecordFilter = 'all' | 'valid' | 'invalid';

interface ImportacionesPageProps {
  onLogout?: () => void;
}

interface ImportBatch {
  id: number;
  tipoLote: string;
  descripcion: string | null;
  archivoFuente: string | null;
  destinoFacultad: string | null;
  destinoCarrera: string | null;
  destinoFacultadId: number | null;
  destinoCarreraId: number | null;
  totalRegistros: number;
  procesados: number;
  errores: number;
  estado: string;
  ejecutadoEn: string | null;
  ejecutadoPor: string | null;
  ejecutadoPorNombre: string | null;
}

interface ImportBatchDetail extends ImportBatch {
  registrosCargados: number;
  registrosValidos: number;
  registrosInvalidos: number;
}

interface ImportRecord {
  id: number;
  fila: number | null;
  datos: Record<string, unknown>;
  valido: boolean | null;
  mensajeError: string | null;
}

interface FacultadCatalogo {
  id: number;
  nombre: string;
}

interface CarreraCatalogo {
  id: number;
  nombre: string;
  facultadId: number;
}

const CHUNK_SIZE = 200;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** lg = 1024px: mismo criterio que `max-lg:` en Tailwind (solo celular/tablet). */
function viewportEsEscritorio(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 1024px)').matches;
}

const LEGACY_FACULTADES = [
  {
    nombre: 'Facultad de Ciencias Empresariales',
    carreras: ['Ciencias Contables', 'Administración de Empresas', 'Ingeniería Comercial'],
  },
  {
    nombre: 'Facultad de Humanidades y Ciencias de la Educación',
    carreras: [
      'Licenciatura en Ciencias de la Educación',
      'Licenciatura en Psicología Clínica',
      'Licenciatura en Ciencias del Deporte',
      'Licenciatura en Educación Inicial',
      'Licenciatura en Educación Escolar Básica',
    ],
  },
  {
    nombre: 'Facultad de Derecho y Ciencias Sociales',
    carreras: ['Derecho', 'Notariado'],
  },
  {
    nombre: 'Facultad de Ciencias y Tecnología',
    carreras: ['Ingeniería Informática', 'Licenciatura en Diseño Gráfico', 'Ingeniería Electromecánica', 'Ingeniería Agronómica'],
  },
] as const;

const entityImportAlumnos = {
  id: 'alumnos',
  titulo: 'Alumnos',
  descripcion: 'Inscripciones y datos personales.',
  icono: 'group',
  tipoLote: 'alumnos',
} as const;

const recordFilterOptions: Array<{ id: RecordFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'valid', label: 'Válidos' },
  { id: 'invalid', label: 'Con errores' },
];

const estadoBadges: Record<string, { label: string; bg: string; text: string }> = {
  pendiente: { label: 'Pendiente', bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-300' },
  procesando: { label: 'Procesando', bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-300' },
  completado: { label: 'Completado', bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-300' },
  error: { label: 'Con errores', bg: 'bg-rose-500/10 border-rose-500/30', text: 'text-rose-300' },
};

function loteEsDescartable(estado?: string | null): boolean {
  const e = (estado ?? '').trim().toLowerCase();
  return e === 'pendiente' || e === 'error';
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false,
});

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha';
  return dateTimeFormatter.format(new Date(value));
}

/** Acorta mensajes del API para mostrarlos en la zona de carga. */
function mensajeErrorCargaImportacion(mensaje: string): string {
  if (
    /ya hay una carga pendiente/i.test(mensaje) ||
    /ya fue importado y confirmado/i.test(mensaje) ||
    /^Estos?\s+\d+\s+alumnos?\s+ya\s+est[aá]n\s+en\s+/i.test(mensaje) ||
    /^Este alumno ya está en /i.test(mensaje) ||
    /^Ese alumno ya está en /i.test(mensaje) ||
    /^\d+ alumnos ya están en /i.test(mensaje)
  ) {
    return mensaje;
  }
  const m = mensaje.match(/(\d+)\s+alumnos?\s+ya\s+est[aá]n\s+en\s+«([^»]+)»/i);
  if (m) {
    const n = Number(m[1]);
    const carrera = m[2].trim();
    return n === 1 ? `Este alumno ya está en ${carrera}.` : `Estos ${n} alumnos ya están en ${carrera}.`;
  }
  return mensaje;
}

function mapBatch(row: Record<string, any>): ImportBatch {
  return {
    id: row.id,
    tipoLote: row.tipo_lote ?? '',
    descripcion: row.descripcion ?? null,
    archivoFuente: row.archivo_fuente ?? null,
    destinoFacultad: row.destino_facultad ?? null,
    destinoCarrera: row.destino_carrera ?? null,
    destinoFacultadId: row.destino_facultad_id ?? null,
    destinoCarreraId: row.destino_carrera_id ?? null,
    totalRegistros: row.total_registros ?? 0,
    procesados: row.procesados ?? 0,
    errores: row.errores ?? 0,
    estado: row.estado ?? 'pendiente',
    ejecutadoEn: row.ejecutado_en ?? null,
    ejecutadoPor: row.ejecutado_por ?? null,
    ejecutadoPorNombre: row.ejecutado_por_nombre ?? null,
  };
}

function mapBatchDetail(row: Record<string, any>): ImportBatchDetail {
  const base = mapBatch(row);
  return {
    ...base,
    registrosCargados: row.registros_cargados ?? base.totalRegistros,
    registrosValidos: row.registros_validos ?? base.procesados ?? 0,
    registrosInvalidos: row.registros_invalidos ?? base.errores ?? 0,
  };
}

function mapRecord(row: Record<string, any>): ImportRecord {
  let datos: Record<string, unknown> = {};
  const rawDatos = row.datos;
  if (rawDatos != null) {
    if (typeof rawDatos === 'string') {
      try {
        const parsed = JSON.parse(rawDatos) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          datos = parsed as Record<string, unknown>;
        }
      } catch {
        datos = {};
      }
    } else if (typeof rawDatos === 'object' && !Array.isArray(rawDatos)) {
      datos = rawDatos as Record<string, unknown>;
    }
  }

  return {
    id: row.id,
    fila: row.fila ?? null,
    datos,
    valido: row.valido ?? null,
    mensajeError: row.mensaje_error ?? null,
  };
}

function formatRecordFieldLabel(key: string) {
  return key.replace(/_/g, ' ');
}

const RECORD_PREVIEW_SKIP_KEYS = new Set([
  'destino_facultad',
  'destino_carrera',
  'semestre',
]);

function recordFieldEntries(record: ImportRecord): Array<[string, unknown]> {
  return Object.entries(record.datos ?? {}).filter(([key]) => {
    if (key.startsWith('_planilla')) return false;
    if (RECORD_PREVIEW_SKIP_KEYS.has(key.toLowerCase())) return false;
    return true;
  });
}

function recordAlumnoTitulo(record: ImportRecord): string {
  const d = record.datos ?? {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = d[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    const lower = keys.map((k) => k.toLowerCase());
    for (const [key, val] of Object.entries(d)) {
      if (!lower.includes(key.toLowerCase())) continue;
      if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
    }
    return '';
  };
  const nombreApellido = pick('nombre_apellido', 'nombre_a', 'alumno', 'nombre completo');
  const apellidos = pick('apellidos', 'apellido');
  const nombres = pick('nombres', 'nombre');
  const doc = pick('numero_documento', 'ci', 'documento', 'nro_documento');
  const nombre =
    nombreApellido ||
    [apellidos, nombres].filter(Boolean).join(', ') ||
    [nombres, apellidos].filter(Boolean).join(' ');
  if (nombre && doc) return `${nombre} · CI ${doc}`;
  if (nombre) return nombre;
  if (doc) return `CI ${doc}`;
  return '';
}

function recordPreviewEntries(record: ImportRecord, max = 12) {
  const raw = recordFieldEntries(record);
  if (!raw.length) {
    return { entries: [] as Array<{ key: string; label: string; value: string }>, truncated: false, total: 0 };
  }
  const truncated = raw.length > max;
  const entries = raw.slice(0, max).map(([key, value]) => ({
    key,
    label: formatRecordFieldLabel(key),
    value: value === '' || value == null ? '—' : String(value),
  }));
  return { entries, truncated, total: raw.length };
}

function normalizarTexto(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizarNombreFacultad(valor: string) {
  const key = normalizarTexto(valor);
  const canonTec = normalizarTexto('Facultad de Ciencias y Tecnología');
  if (
    key === normalizarTexto('Facultad de Ciencias y Tecnologia') ||
    key === normalizarTexto('Facultad de Ciencias y Tecnologias') ||
    key === canonTec
  ) {
    return 'Facultad de Ciencias y Tecnología';
  }
  return valor;
}

const ALIAS_CARRERA_IMPORT = new Map<string, string>([
  [normalizarTexto('ing. en informatica'), 'Ingeniería Informática'],
  [normalizarTexto('ing en informatica'), 'Ingeniería Informática'],
  [normalizarTexto('ingenieria informatica'), 'Ingeniería Informática'],
  [normalizarTexto('Ingenieria Informática'), 'Ingeniería Informática'],
  [normalizarTexto('Ingeniería Informática'), 'Ingeniería Informática'],
  [normalizarTexto('Ingenieria Electromecánica'), 'Ingeniería Electromecánica'],
  [normalizarTexto('Ingenieria Agronómica'), 'Ingeniería Agronómica'],
  [normalizarTexto('Ciencias de la Educación'), 'Licenciatura en Ciencias de la Educación'],
  [normalizarTexto('Psicología'), 'Licenciatura en Psicología Clínica'],
  [normalizarTexto('Psicologia'), 'Licenciatura en Psicología Clínica'],
  [normalizarTexto('Ciencias del Deporte'), 'Licenciatura en Ciencias del Deporte'],
  [normalizarTexto('Educación Inicial'), 'Licenciatura en Educación Inicial'],
  [normalizarTexto('Educación Escolar Básica'), 'Licenciatura en Educación Escolar Básica'],
  [normalizarTexto('Diseño Gráfico'), 'Licenciatura en Diseño Gráfico'],
]);

function normalizarNombreCarrera(valor: string) {
  const key = normalizarTexto(valor);
  return ALIAS_CARRERA_IMPORT.get(key) ?? valor;
}

function normalizarClaveCabecera(valor: string) {
  return valor.trim().toLowerCase();
}

/** Valores de carrera/facultad/semestre tal como vienen en el Excel, antes de fijar el destino en pantalla. */
function metadatosPlanillaDesdeFila(row: Record<string, unknown>): Record<string, string> {
  const porCabecera = (...candidatos: string[]): string | undefined => {
    const mapa = new Map<string, unknown>();
    for (const k of Object.keys(row)) {
      mapa.set(normalizarClaveCabecera(k), row[k]);
    }
    for (const c of candidatos) {
      const raw = mapa.get(normalizarClaveCabecera(c));
      if (raw === undefined || raw === null) continue;
      const s = String(raw).trim();
      if (s) return s;
    }
    return undefined;
  };
  const out: Record<string, string> = {};
  const carrera = porCabecera(
    'carrera',
    'carrera_nombre',
    'nombre_carrera',
    'programa',
    'especialidad',
    'plan'
  );
  const facultad = porCabecera('facultad', 'facultad_nombre', 'nombre_facultad');
  const semestre = porCabecera('semestre', 'semestre_curricular', 'año', 'anio');
  if (carrera) out._planilla_carrera = carrera;
  if (facultad) out._planilla_facultad = facultad;
  if (semestre) out._planilla_semestre = semestre;
  return out;
}

export function ImportacionesPage({ onLogout }: ImportacionesPageProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [batchDetail, setBatchDetail] = useState<ImportBatchDetail | null>(null);
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [recordFilter, setRecordFilter] = useState<RecordFilter>('all');
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<ImportUploadPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [confirmPhase, setConfirmPhase] = useState<ImportConfirmPhase>('idle');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccessMessage, setConfirmSuccessMessage] = useState<string | null>(null);
  const confirmBusy = confirmPhase !== 'idle';
  const [discardDialogLoteId, setDiscardDialogLoteId] = useState<number | null>(null);
  const [discardLoading, setDiscardLoading] = useState(false);
  const [facultadesCatalogo, setFacultadesCatalogo] = useState<FacultadCatalogo[]>([]);
  const [carrerasCatalogo, setCarrerasCatalogo] = useState<CarreraCatalogo[]>([]);
  const [facultadSeleccionadaId, setFacultadSeleccionadaId] = useState('');
  const [carreraSeleccionadaId, setCarreraSeleccionadaId] = useState('');
  const [semestreSeleccionado, setSemestreSeleccionado] = useState('');
  /** Año de cohorte de ingreso del lote (se replica en alumnos al confirmar). Vacío = sin cohorte. */
  const [cohorteIngresoAnio, setCohorteIngresoAnio] = useState(() => String(new Date().getFullYear()));
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resumen = useMemo(() => {
    const totalRegistros = batches.reduce((acc, item) => acc + (item.totalRegistros ?? 0), 0);
    const totalProcesados = batches.reduce((acc, item) => acc + (item.procesados ?? 0), 0);
    const totalErrores = batches.reduce((acc, item) => acc + (item.errores ?? 0), 0);
    const activos = batches.filter((item) => item.estado !== 'completado').length;
    return {
      totalLotes: batches.length,
      totalRegistros,
      totalProcesados,
      totalErrores,
      activos,
    };
  }, [batches]);

  const carrerasDisponibles = useMemo(() => {
    const facultadId = Number(facultadSeleccionadaId);
    if (!facultadId) return [];
    return carrerasCatalogo.filter((carrera) => carrera.facultadId === facultadId);
  }, [carrerasCatalogo, facultadSeleccionadaId]);

  const facultadSeleccionada = useMemo(
    () => facultadesCatalogo.find((f) => f.id === Number(facultadSeleccionadaId))?.nombre ?? '',
    [facultadesCatalogo, facultadSeleccionadaId]
  );

  const carreraSeleccionada = useMemo(
    () => carrerasCatalogo.find((c) => c.id === Number(carreraSeleccionadaId))?.nombre ?? '',
    [carrerasCatalogo, carreraSeleccionadaId]
  );

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    setBatchesError(null);
    try {
      const data = await apiFetch<{ total: number; datos: Record<string, any>[] }>('/importaciones/lotes');
      const lista = (data?.datos ?? []).map(mapBatch);
      setBatches(lista);
      setSelectedBatchId((current) => {
        if (current && lista.some((item) => item.id === current)) {
          return current;
        }
        return viewportEsEscritorio() ? (lista[0]?.id ?? null) : null;
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo cargar el historial';
      setBatchesError(mensaje);
      toast.error(mensaje);
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  const loadDestinosAcademicos = useCallback(async () => {
    try {
      const data = await apiFetch<{ facultades: FacultadCatalogo[]; carreras: Array<{ id: number; nombre: string; facultadId: number; facultad_id?: number }> }>(
        '/importaciones/destinos-academicos'
      );

      const facultades = (data?.facultades ?? []).map((item) => ({
        ...item,
        nombre: normalizarNombreFacultad(item.nombre),
      }));
      const carreras = (data?.carreras ?? []).map((item) => ({
        id: item.id,
        nombre: normalizarNombreCarrera(item.nombre),
        facultadId: item.facultadId ?? item.facultad_id ?? 0,
      }));

      let syntheticFacultadId = -1;
      let syntheticCarreraId = -1;

      const facultadByNombre = new Map<string, FacultadCatalogo>();
      facultades.forEach((f) => {
        const nombreCanonico = normalizarNombreFacultad(f.nombre);
        facultadByNombre.set(normalizarTexto(nombreCanonico), { ...f, nombre: nombreCanonico });
      });

      const facultadesNormalizadas = [...facultadByNombre.values()];

      const carreraKey = (facultadId: number, nombre: string) => `${facultadId}:${normalizarTexto(nombre)}`;
      const carrerasNormalizadas = [] as CarreraCatalogo[];
      const carreraKeys = new Set<string>();

      for (const carrera of carreras) {
        const nombreCanonico = normalizarNombreCarrera(carrera.nombre);
        const key = carreraKey(carrera.facultadId, nombreCanonico);
        if (carreraKeys.has(key)) continue;
        carrerasNormalizadas.push({ ...carrera, nombre: nombreCanonico });
        carreraKeys.add(key);
      }

      for (const facultadLegacy of LEGACY_FACULTADES) {
        const legacyNorm = normalizarTexto(facultadLegacy.nombre);
        let facultadDestino = facultadByNombre.get(legacyNorm);

        if (!facultadDestino) {
          facultadDestino = { id: syntheticFacultadId, nombre: facultadLegacy.nombre };
          syntheticFacultadId -= 1;
          facultadesNormalizadas.push(facultadDestino);
          facultadByNombre.set(legacyNorm, facultadDestino);
        }

        for (const carreraLegacy of facultadLegacy.carreras) {
          const key = carreraKey(facultadDestino.id, carreraLegacy);
          if (carreraKeys.has(key)) continue;
          carrerasNormalizadas.push({
            id: syntheticCarreraId,
            nombre: normalizarNombreCarrera(carreraLegacy),
            facultadId: facultadDestino.id,
          });
          syntheticCarreraId -= 1;
          carreraKeys.add(key);
        }
      }

      facultadesNormalizadas.sort((a, b) => a.nombre.localeCompare(b.nombre));
      carrerasNormalizadas.sort((a, b) => a.nombre.localeCompare(b.nombre));

      setFacultadesCatalogo(facultadesNormalizadas);
      setCarrerasCatalogo(carrerasNormalizadas);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo cargar facultades y carreras';
      toast.error(mensaje);
    }
  }, []);

  const loadBatchDetail = useCallback(async (loteId: number) => {
    setDetailLoading(true);
    try {
      const data = await apiFetch<Record<string, any>>(`/importaciones/lotes/${loteId}`);
      setBatchDetail(mapBatchDetail(data));
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo obtener el detalle del lote';
      setBatchDetail(null);
      toast.error(mensaje);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadBatchRecords = useCallback(
    async (loteId: number, filter: RecordFilter) => {
      setRecordsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('limit', '500');
        if (filter !== 'all') {
          params.set('valido', filter === 'valid' ? 'true' : 'false');
        }
        const query = params.toString();
        const data = await apiFetch<{ total: number; datos: Record<string, any>[] }>(
          `/importaciones/lotes/${loteId}/registros${query ? `?${query}` : ''}`
        );
        setRecords((data?.datos ?? []).map(mapRecord));
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : 'No se pudieron cargar los registros';
        setRecords([]);
        toast.error(mensaje);
      } finally {
        setRecordsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    void loadDestinosAcademicos();
  }, [loadDestinosAcademicos]);

  useEffect(() => {
    if (!selectedBatchId) {
      setBatchDetail(null);
      setRecords([]);
      return;
    }
    void loadBatchDetail(selectedBatchId);
  }, [selectedBatchId, loadBatchDetail]);

  useEffect(() => {
    if (!selectedBatchId) return;
    void loadBatchRecords(selectedBatchId, recordFilter);
  }, [selectedBatchId, recordFilter, loadBatchRecords]);

  const dismissUploadError = useCallback(() => {
    setUploadPhase('idle');
    setUploadError(null);
    setUploadMessage(null);
    setUploadProgress(0);
  }, []);

  const dismissConfirmError = useCallback(() => {
    setConfirmPhase('idle');
    setConfirmError(null);
    setConfirmSuccessMessage(null);
  }, []);

  const processImportFile = useCallback(
    async (file: File) => {
      const entity = entityImportAlumnos;

      if (!facultadSeleccionadaId || !carreraSeleccionadaId) {
        toast.error('Selecciona la facultad y la carrera antes de cargar el archivo.');
        return;
      }

      if (!semestreSeleccionado) {
        toast.error('Selecciona el semestre antes de cargar el archivo.');
        return;
      }

      const cohorteTrim = String(cohorteIngresoAnio).trim();
      let cohorteAnioPayload: number | null | undefined;
      if (cohorteTrim === '') {
        cohorteAnioPayload = null;
      } else {
        const y = Number.parseInt(cohorteTrim, 10);
        if (!Number.isFinite(y) || y < 1990 || y > 2100) {
          toast.error('El año de ingreso debe estar entre 1990 y 2100, o dejá el campo vacío.');
          return;
        }
        cohorteAnioPayload = y;
      }

      setUploadError(null);
      setUploadPhase('parsing');
      setUploadingFileName(file.name);
      setUploadProgress(0.05);
      setUploadMessage('Leyendo archivo Excel…');

      let loteIdCreado: number | null = null;
      const descCohorte =
        cohorteAnioPayload != null ? ` · Año de ingreso ${cohorteAnioPayload}` : '';
      const descripcionLote = `Carga de ${entity.titulo} · ${facultadSeleccionada} · ${carreraSeleccionada} · Semestre ${semestreSeleccionado}${descCohorte}`;

      let smoothRafId = 0;

      try {
        const buffer = await file.arrayBuffer();
        setUploadProgress(0.08);
        await yieldToMain();

        const rows = await new Promise<Record<string, unknown>[]>((resolve) => {
          window.setTimeout(() => {
            const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) { resolve([]); return; }
            const worksheet = workbook.Sheets[sheetName];
            resolve(
              XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
                defval: '',
                blankrows: false,
                raw: false,
              })
            );
          }, 0);
        });

        if (!rows.length) {
          throw new Error('El archivo no contiene registros.');
        }
        setUploadProgress(0.12);
        await yieldToMain();

        const registrosValidacion = rows.map((row: Record<string, unknown>, index: number) => {
          const metaPlanilla = metadatosPlanillaDesdeFila(row);
          return {
            fila: index + 2,
            datos: {
              ...row,
              ...metaPlanilla,
              destino_facultad: facultadSeleccionada,
              destino_carrera: carreraSeleccionada,
              semestre: semestreSeleccionado,
            },
            valido: true,
          };
        });

        setUploadPhase('creating');
        setUploadMessage('Validando archivo y destino académico…');
        setUploadProgress(0.18);
        await yieldToMain();

        await apiFetch('/importaciones/validar-carga-alumnos', {
          method: 'POST',
          body: JSON.stringify({
            descripcion: descripcionLote,
            archivoFuente: file.name,
            destinoFacultad: facultadSeleccionada,
            destinoCarrera: carreraSeleccionada,
            destinoFacultadId: Number(facultadSeleccionadaId),
            destinoCarreraId: Number(carreraSeleccionadaId),
            cohorteAnio: cohorteAnioPayload,
            registros: registrosValidacion,
          }),
        });

        setUploadMessage(`Creando lote (${rows.length} registros)…`);
        setUploadProgress(0.22);
        await yieldToMain();

        const lote = await apiFetch<Record<string, any>>('/importaciones/lotes', {
          method: 'POST',
          body: JSON.stringify({
            tipoLote: entity.tipoLote,
            descripcion: descripcionLote,
            archivoFuente: file.name,
            totalRegistros: rows.length,
            destinoFacultad: facultadSeleccionada,
            destinoCarrera: carreraSeleccionada,
            destinoFacultadId: Number(facultadSeleccionadaId) > 0 && Number(carreraSeleccionadaId) > 0 ? Number(facultadSeleccionadaId) : undefined,
            destinoCarreraId: Number(facultadSeleccionadaId) > 0 && Number(carreraSeleccionadaId) > 0 ? Number(carreraSeleccionadaId) : undefined,
            cohorteAnio: cohorteAnioPayload,
          }),
        });

        loteIdCreado = Number(lote.id);
        const loteId = loteIdCreado;
        setUploadProgress(0.28);

        setUploadPhase('uploading');
        setUploadMessage('Enviando registros…');

        const uploadBase = 0.28;
        const uploadSpan = 0.62;
        let currentProgress = uploadBase;

        const startSmoothProgress = () => {
          cancelAnimationFrame(smoothRafId);
          const target = uploadBase + uploadSpan;
          const step = () => {
            currentProgress = Math.min(currentProgress + 0.003, target);
            setUploadProgress(currentProgress);
            if (currentProgress < target) {
              smoothRafId = requestAnimationFrame(step);
            }
          };
          smoothRafId = requestAnimationFrame(step);
        };

        const stopSmoothProgress = () => {
          cancelAnimationFrame(smoothRafId);
        };

        for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
          const chunk = rows.slice(start, start + CHUNK_SIZE);
          const chunkEnd = start + chunk.length;
          setUploadMessage(
            `Enviando registros ${chunkEnd.toLocaleString('es-AR')} de ${rows.length.toLocaleString('es-AR')}…`
          );

          const registros = chunk.map((row: Record<string, unknown>, index: number) => {
            const metaPlanilla = metadatosPlanillaDesdeFila(row);
            const datosBase = {
              ...row,
              ...metaPlanilla,
              destino_facultad: facultadSeleccionada,
              destino_carrera: carreraSeleccionada,
              semestre: semestreSeleccionado,
            };
            return {
              fila: start + index + 2,
              datos: datosBase,
              valido: true,
            };
          });

          startSmoothProgress();
          await apiFetch(`/importaciones/lotes/${loteId}/registros`, {
            method: 'POST',
            body: JSON.stringify({ registros }),
          });
          stopSmoothProgress();

          currentProgress = uploadBase + (chunkEnd / rows.length) * uploadSpan;
          setUploadProgress(currentProgress);
        }

        setUploadPhase('success');
        setUploadProgress(1);
        setUploadMessage('¡Archivo cargado! Revisá el detalle del lote y confirmá cuando estés listo.');
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        setUploadPhase('idle');
        setUploadProgress(0);
        setUploadMessage(null);
        setUploadingFileName(file.name);

        loadBatches();
        setSelectedBatchId(loteId);
        loadBatchDetail(loteId);
        loadBatchRecords(loteId, recordFilter);
      } catch (error) {
        cancelAnimationFrame(smoothRafId);
        if (loteIdCreado != null) {
          try {
            await apiFetch(`/importaciones/lotes/${loteIdCreado}`, { method: 'DELETE' });
            await loadBatches();
            if (selectedBatchId === loteIdCreado) {
              setSelectedBatchId(null);
              setBatchDetail(null);
              setRecords([]);
            }
          } catch {
            /* lote huérfano: el usuario puede descartarlo desde el historial */
          }
        }
        const mensajeRaw = error instanceof Error ? error.message : 'No se pudo procesar el archivo';
        const mensaje = mensajeErrorCargaImportacion(mensajeRaw);
        setUploadError(mensaje);
        setUploadPhase('error');
        setUploadProgress(0);
        setUploadMessage(null);
      }
    },
    [
      loadBatches,
      loadBatchDetail,
      loadBatchRecords,
      recordFilter,
      facultadSeleccionada,
      carreraSeleccionada,
      facultadSeleccionadaId,
      carreraSeleccionadaId,
      semestreSeleccionado,
      cohorteIngresoAnio,
      selectedBatchId,
    ]
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    void processImportFile(file);
  };

  const handleManualTrigger = () => {
    fileInputRef.current?.click();
  };

  const handleConfirmBatch = useCallback(async () => {
    if (!selectedBatchId || !batchDetail) {
      toast.error('Selecciona un lote para confirmar.');
      return;
    }

    if (batchDetail.estado === 'completado') {
      toast.error('Este lote ya fue confirmado.');
      return;
    }

    setConfirmError(null);
    setConfirmSuccessMessage(null);
    setConfirmPhase('confirming');
    try {
      const resultado = await apiFetch<{ estado: string; procesados: number; errores: number }>(
        `/importaciones/lotes/${selectedBatchId}/confirmar`,
        { method: 'POST' }
      );

      const errores = resultado?.errores ?? 0;
      setConfirmSuccessMessage(
        errores > 0
          ? `Listo con observaciones: ${errores} fila(s) con error. Revisá el detalle del lote.`
          : '¡Importación confirmada! Los alumnos ya están en el sistema.'
      );
      setConfirmPhase('success');
      await new Promise((resolve) => window.setTimeout(resolve, 520));
      setConfirmPhase('idle');
      setConfirmSuccessMessage(null);

      Promise.all([
        loadBatchDetail(selectedBatchId),
        loadBatchRecords(selectedBatchId, recordFilter),
        loadBatches(),
      ]);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo confirmar el lote';
      setConfirmError(mensaje);
      setConfirmPhase('error');
    }
  }, [batchDetail, loadBatchDetail, loadBatchRecords, loadBatches, recordFilter, selectedBatchId]);

  const loteDescarte = useMemo(() => {
    if (discardDialogLoteId == null) return null;
    return batches.find((b) => b.id === discardDialogLoteId) ?? null;
  }, [batches, discardDialogLoteId]);

  const archivoDescarte = loteDescarte?.archivoFuente ?? (discardDialogLoteId != null ? `Lote #${discardDialogLoteId}` : '');

  const ejecutarDescarteLote = useCallback(async () => {
    const loteId = discardDialogLoteId;
    if (loteId == null) return;
    setDiscardLoading(true);
    try {
      await apiFetch(`/importaciones/lotes/${loteId}`, { method: 'DELETE' });
      toast.success('Importación descartada');
      setDiscardDialogLoteId(null);
      if (selectedBatchId === loteId) {
        setSelectedBatchId(null);
        setBatchDetail(null);
        setRecords([]);
      }
      await loadBatches();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo descartar el lote';
      toast.error(mensaje);
    } finally {
      setDiscardLoading(false);
    }
  }, [discardDialogLoteId, loadBatches, selectedBatchId]);

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
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button className="app-menu-toggle text-slate-400" onClick={() => setSidebarOpen((prev) => !prev)} aria-label="Abrir menú">
                <span className="material-symbols-outlined">menu</span>
              </button>
              <span className="material-symbols-outlined shrink-0 text-[#6b8bc3]">upload_file</span>
              <div className="min-w-0">
                <p className="text-xs uppercase text-slate-400">Módulos</p>
                <h1 className="text-xl font-semibold truncate">Asistente de importación</h1>
              </div>
            </div>
          </header>

          <div
            className="importaciones-root master-detail-root min-h-0 min-w-0 flex-1 overflow-hidden xl:grid xl:grid-cols-[minmax(0,1fr)_min(100%,26.25rem)]"
            data-has-selection={selectedBatchId ? 'true' : 'false'}
          >
            <section className="master-detail-list min-w-0 flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="scroll-region app-scroll-content scrollbar-hide min-w-0 flex-1 space-y-8 p-4 sm:p-6 max-lg:space-y-5 max-lg:p-3">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 max-lg:grid-cols-2 max-lg:gap-2">
                <div className="rounded-xl border border-slate-800 bg-[#132a52] p-5 max-lg:p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                      <span className="material-symbols-outlined text-[22px]">dataset</span>
                    </div>
                    <span className="text-xs text-slate-500">Total lotes</span>
                  </div>
                  <p className="text-2xl font-bold text-[#f0f4f8] max-lg:text-xl">{resumen.totalLotes}</p>
                  <p className="text-xs text-slate-500">Registros acumulados: {resumen.totalRegistros}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#132a52] p-5 max-lg:p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                      <span className="material-symbols-outlined text-[22px]">task_alt</span>
                    </div>
                    <span className="text-xs text-slate-500">Procesados</span>
                  </div>
                  <p className="text-2xl font-bold text-[#f0f4f8] max-lg:text-xl">{resumen.totalProcesados}</p>
                  <p className="text-xs text-slate-500">Importaciones activas: {resumen.activos}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#132a52] p-5 max-lg:col-span-2 max-lg:p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400">
                      <span className="material-symbols-outlined text-[22px]">error</span>
                    </div>
                    <span className="text-xs text-slate-500">Errores</span>
                  </div>
                  <p className="text-2xl font-bold text-[#f0f4f8] max-lg:text-xl">{resumen.totalErrores}</p>
                  <p className="text-xs text-slate-500 max-lg:line-clamp-2">
                    Última actualización: {formatDate(batches[0]?.ejecutadoEn)}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-[#f0f4f8] mb-3 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-xs text-[#f0f4f8] font-bold">1</span>
                    Tipo de importación
                  </h2>
                  <div className="inline-flex w-full max-w-full min-w-0 sm:w-fit items-center gap-2.5 rounded-lg border border-slate-800 px-3 py-2">
                    <span className="material-symbols-outlined shrink-0 text-[20px] leading-none text-primary/90">
                      {entityImportAlumnos.icono}
                    </span>
                    <div className="min-w-0 leading-tight">
                      <p className="text-sm font-medium text-[#f0f4f8]">{entityImportAlumnos.titulo}</p>
                      <p className="text-[11px] text-slate-500">{entityImportAlumnos.descripcion}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-[#f0f4f8] mb-4 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-xs text-[#f0f4f8] font-bold">2</span>
                    Selecciona facultad y carrera
                  </h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <label className="flex min-w-0 flex-col gap-2 text-sm">
                      <span className="text-[#9fb3d4] font-medium">Facultad</span>
                      <AppSelect
                        value={facultadSeleccionadaId}
                        onChange={(v) => {
                          setFacultadSeleccionadaId(v);
                          setCarreraSeleccionadaId('');
                        }}
                        placeholder="Selecciona una facultad"
                        options={facultadesCatalogo.map((facultad) => ({
                          value: String(facultad.id),
                          label: facultad.nombre,
                        }))}
                        triggerClassName="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-black focus:border-primary focus:outline-none text-sm dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                      />
                    </label>

                    <label className="flex min-w-0 flex-col gap-2 text-sm">
                      <span className="text-[#9fb3d4] font-medium">Carrera</span>
                      <AppSelect
                        value={carreraSeleccionadaId}
                        disabled={!facultadSeleccionadaId}
                        onChange={setCarreraSeleccionadaId}
                        placeholder="Selecciona una carrera"
                        options={carrerasDisponibles.map((carrera) => ({
                          value: String(carrera.id),
                          label: carrera.nombre,
                        }))}
                        triggerClassName="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-black focus:border-primary focus:outline-none text-sm disabled:opacity-60 disabled:cursor-not-allowed dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Esta seleccion se registrara en el lote para identificar origen academico de la importacion.
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-[#f0f4f8] mb-4 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-xs text-[#f0f4f8] font-bold">3</span>
                    Selecciona el semestre
                  </h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <label className="flex min-w-0 flex-col gap-2 text-sm">
                      <span className="text-[#9fb3d4] font-medium">Semestre</span>
                      <AppSelect
                        value={semestreSeleccionado}
                        disabled={!carreraSeleccionadaId}
                        onChange={setSemestreSeleccionado}
                        placeholder="Selecciona un semestre"
                        options={Array.from({ length: 10 }, (_, i) => i + 1).map((n) => ({
                          value: String(n),
                          label: `${n}° Semestre`,
                        }))}
                        triggerClassName="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-black focus:border-primary focus:outline-none text-sm disabled:opacity-60 disabled:cursor-not-allowed dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-2 text-sm">
                      <span className="text-[#9fb3d4] font-medium">Año de ingreso</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Ej. 2025 (opcional)"
                        className="w-full px-3 py-2 rounded-lg bg-[#132a52] border border-slate-700 focus:border-primary focus:outline-none text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        value={cohorteIngresoAnio}
                        disabled={!carreraSeleccionadaId}
                        onChange={(e) => setCohorteIngresoAnio(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    El semestre se asocia al lote y permite filtrar la planilla en Académico. El año de ingreso distingue
                    listas de la misma carrera y semestre (p. ej. ingresantes de distintos años) en promoción y reportes.
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-[#f0f4f8] mb-4 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-xs text-[#f0f4f8] font-bold">4</span>
                    Carga tu archivo fuente
                  </h2>
                  <ImportFileUploadZone
                    phase={uploadPhase}
                    progress={uploadProgress}
                    message={uploadMessage}
                    fileName={uploadingFileName}
                    errorMessage={uploadError}
                    disabled={!facultadSeleccionadaId || !carreraSeleccionadaId || !semestreSeleccionado}
                    fileInputRef={fileInputRef}
                    onFileChange={handleFileChange}
                    onManualTrigger={handleManualTrigger}
                    onDismissError={dismissUploadError}
                  />
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-[#f0f4f8] mb-4 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-xs text-[#f0f4f8] font-bold">5</span>
                    Historial de importaciones
                  </h2>
                  <div className="bg-[#132a52] border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-0 min-w-0">
                    <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-[#f0f4f8] font-medium min-w-0">Registros recientes</p>
                      <button
                        type="button"
                        className="text-xs text-slate-400 hover:text-[#f0f4f8] flex items-center gap-1 shrink-0 self-start sm:self-auto"
                        onClick={() => loadBatches()}
                      >
                        <span className="material-symbols-outlined text-[18px]">refresh</span>
                        Actualizar
                      </button>
                    </div>
                    <ul className="divide-y divide-slate-800 lg:hidden">
                      {batchesLoading ? (
                        <li className="px-4 py-6 text-center text-sm text-slate-500">Cargando...</li>
                      ) : batches.length ? (
                        batches.slice(0, 6).map((lote) => {
                          const badge = estadoBadges[lote.estado] ?? {
                            label: lote.estado,
                            bg: 'bg-slate-700/60 border-slate-600',
                            text: 'text-[#c9d7ed]',
                          };
                          return (
                            <li key={lote.id} className="flex items-stretch">
                              <button
                                type="button"
                                className="min-w-0 flex-1 px-4 py-3 text-left transition-colors active:bg-slate-800/50"
                                onClick={() => setSelectedBatchId(lote.id)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="min-w-0 flex-1 break-words text-sm font-medium text-[#f0f4f8]">
                                    {lote.archivoFuente ?? 'Sin nombre'}
                                  </p>
                                  <span
                                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.bg} ${badge.text}`}
                                  >
                                    {badge.label}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{formatDate(lote.ejecutadoEn)} · {lote.tipoLote}</p>
                                <p className="mt-0.5 text-xs text-[#9fb3d4]">
                                  {lote.procesados}/{lote.totalRegistros} registros
                                </p>
                              </button>
                              {loteEsDescartable(lote.estado) ? (
                                <button
                                  type="button"
                                  className="flex shrink-0 items-center self-center px-3 text-rose-300 hover:bg-rose-500/10"
                                  title="Descartar importación"
                                  onClick={() => setDiscardDialogLoteId(lote.id)}
                                >
                                  <span className="material-symbols-outlined text-[22px]">delete_forever</span>
                                </button>
                              ) : null}
                            </li>
                          );
                        })
                      ) : (
                        <li className="px-4 py-8 text-center text-slate-500">
                          <div className="flex flex-col items-center gap-2">
                            <span className="material-symbols-outlined text-[36px] text-slate-600">inbox</span>
                            <p className="text-sm font-medium text-[#c9d7ed]">{batchesError ?? 'Aún no se registraron importaciones.'}</p>
                            <p className="max-w-sm text-xs text-slate-500">
                              Cuando completes una carga en los pasos anteriores, el historial aparecerá aquí.
                            </p>
                          </div>
                        </li>
                      )}
                    </ul>
                    <div className="scroll-region hidden min-h-0 max-h-[min(70dvh,40rem)] lg:block lg:max-h-none">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[#132a52] text-slate-500 uppercase text-xs">
                          <tr>
                            <th className="px-4 py-2">Archivo</th>
                            <th className="px-4 py-2">Tipo</th>
                            <th className="px-4 py-2">Estado</th>
                            <th className="px-4 py-2">Registros</th>
                            <th className="px-2 py-2 w-12 text-center" aria-label="Descartar" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {batchesLoading ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">Cargando...</td>
                            </tr>
                          ) : batches.length ? (
                            batches.slice(0, 6).map((lote) => {
                              const badge = estadoBadges[lote.estado] ?? {
                                label: lote.estado,
                                bg: 'bg-slate-700/60 border-slate-600',
                                text: 'text-[#c9d7ed]',
                              };
                              return (
                                <tr
                                  key={lote.id}
                                  className="hover:bg-slate-800/30 cursor-pointer"
                                  onClick={() => setSelectedBatchId(lote.id)}
                                >
                                  <td className="px-4 py-3">
                                    <p className="text-[#f0f4f8] font-medium truncate">{lote.archivoFuente ?? 'Sin nombre'}</p>
                                    <p className="text-xs text-slate-500">{formatDate(lote.ejecutadoEn)}</p>
                                  </td>
                                  <td className="px-4 py-3 text-[#9fb3d4]">{lote.tipoLote}</td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${badge.bg} ${badge.text}`}>
                                      <span className="material-symbols-outlined text-[14px]">task</span>
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-[#9fb3d4]">
                                    {lote.procesados}/{lote.totalRegistros}
                                  </td>
                                  <td
                                    className="px-1 py-2 w-12 text-center align-middle"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {loteEsDescartable(lote.estado) ? (
                                      <button
                                        type="button"
                                        title={lote.estado === 'error' ? 'Descartar importación con errores' : 'Descartar importación pendiente'}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDiscardDialogLoteId(lote.id);
                                        }}
                                      >
                                        <span className="material-symbols-outlined text-[20px]">delete_forever</span>
                                      </button>
                                    ) : (
                                      <span className="inline-block w-8 h-8" aria-hidden />
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                <div className="flex flex-col items-center gap-2">
                                  <span className="material-symbols-outlined text-[36px] text-slate-600">inbox</span>
                                  <p className="text-sm font-medium text-[#c9d7ed]">{batchesError ?? 'Aún no se registraron importaciones.'}</p>
                                  <p className="text-xs text-slate-500 max-w-sm">
                                    Cuando completes una carga en los pasos anteriores, el historial aparecerá aquí.
                                  </p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </section>

            <aside
              className={`master-detail-detail relative z-10 flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden border-slate-800 bg-[#132a52] max-xl:min-h-0 xl:h-full xl:max-h-none xl:max-w-[26.25rem] xl:flex-none xl:border-l xl:border-t-0 ${
                !selectedBatchId ? 'max-xl:hidden' : ''
              }`}
            >
              <ImportConfirmOverlay
                phase={confirmPhase}
                archivo={batchDetail?.archivoFuente}
                totalRegistros={batchDetail?.totalRegistros}
                errorMessage={confirmError}
                successMessage={confirmSuccessMessage}
                onDismissError={dismissConfirmError}
              />
              <div className="flex min-w-0 shrink-0 flex-col gap-3 border-b border-slate-800 bg-[#132a52] px-4 py-3 max-xl:py-4 xl:flex-row xl:items-center xl:justify-between xl:py-[7px]">
                {selectedBatchId ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 self-start rounded-lg px-1 py-1 text-sm font-medium text-slate-300 hover:bg-slate-800/60 max-xl:inline-flex xl:hidden"
                    onClick={() => {
                      setSelectedBatchId(null);
                      setBatchDetail(null);
                      setRecords([]);
                    }}
                    aria-label="Volver al asistente de importación"
                  >
                    <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    Volver
                  </button>
                ) : null}
                <div className="w-full min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-[#f0f4f8] lg:text-sm">Detalle del lote</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400 max-xl:block xl:hidden">
                    Revisá el archivo y confirmá o descartá el lote
                  </p>
                  <p className="mt-0.5 hidden text-xs text-slate-400 xl:block">
                    Selecciona un registro para ver sus datos
                  </p>
                </div>
                <div className="flex w-full min-w-0 flex-wrap items-center gap-2 xl:w-auto xl:shrink-0">
                  <button
                    className={`btn-modern flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold sm:flex-none xl:min-h-0 ${
                      !batchDetail || batchDetail.estado === 'completado' || confirmBusy || discardLoading
                        ? 'border-slate-700 text-slate-500 cursor-not-allowed opacity-60'
                        : 'border-emerald-500 text-emerald-300 hover:bg-emerald-500/10'
                    }`}
                    type="button"
                    onClick={handleConfirmBatch}
                    disabled={!batchDetail || batchDetail.estado === 'completado' || confirmBusy || discardLoading}
                  >
                    <span
                      className={`material-symbols-outlined text-[18px] ${confirmPhase === 'confirming' || confirmPhase === 'syncing' ? 'animate-spin' : ''}`}
                    >
                      {confirmPhase === 'confirming' || confirmPhase === 'syncing'
                        ? 'progress_activity'
                        : 'task_alt'}
                    </span>
                    {confirmPhase === 'confirming'
                      ? 'Confirmando…'
                      : confirmPhase === 'syncing'
                        ? 'Actualizando…'
                        : 'Confirmar'}
                  </button>
                  <button
                    className={`btn-modern flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold sm:flex-none xl:min-h-0 ${
                      !batchDetail || !loteEsDescartable(batchDetail.estado) || confirmBusy || discardLoading
                        ? 'border-slate-300 text-slate-400 cursor-not-allowed opacity-60 dark:border-slate-700 dark:text-slate-500'
                        : 'btn-modern-danger border-rose-500/50 text-rose-700 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-500/10'
                    }`}
                    type="button"
                    title="Quitar la carga del historial"
                    disabled={!batchDetail || !loteEsDescartable(batchDetail.estado) || confirmBusy || discardLoading}
                    onClick={() => {
                      if (!selectedBatchId || !batchDetail || !loteEsDescartable(batchDetail.estado)) {
                        toast.error('Solo podés descartar lotes pendientes o con errores.');
                        return;
                      }
                      setDiscardDialogLoteId(selectedBatchId);
                    }}
                  >
                    <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                    Descartar
                  </button>
                  <button
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-[#f0f4f8] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Recargar"
                    type="button"
                    disabled={confirmBusy || discardLoading}
                    onClick={() => selectedBatchId && loadBatchDetail(selectedBatchId)}
                  >
                    <span
                      className={`material-symbols-outlined text-[20px] ${confirmPhase === 'confirming' || confirmPhase === 'syncing' ? 'animate-spin' : ''}`}
                    >
                      refresh
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden max-xl:overflow-y-auto max-xl:overscroll-y-contain max-xl:import-detalle-scroll">
                {detailLoading ? (
                  <p className="p-4 text-center text-sm text-slate-500">Cargando detalle...</p>
                ) : batchDetail ? (
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="shrink-0 space-y-2 border-b border-slate-800 bg-[#132a52] p-4 max-xl:border-b-0 max-xl:rounded-xl max-xl:border max-xl:border-slate-800">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-slate-500">Archivo</p>
                          <p className="break-words text-sm font-medium text-[#f0f4f8]">{batchDetail.archivoFuente ?? 'Sin nombre'}</p>
                        </div>
                        {(() => {
                          const badge = estadoBadges[batchDetail.estado] ?? {
                            label: batchDetail.estado,
                            bg: 'bg-slate-700/60 border-slate-600',
                            text: 'text-[#c9d7ed]',
                          };
                          return (
                            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${badge.bg} ${badge.text}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-[#0a1424] p-3 text-xs text-slate-400 max-lg:grid max-lg:grid-cols-1 max-lg:gap-2.5 lg:grid lg:grid-cols-1 lg:gap-1">
                        <div className="max-lg:flex max-lg:flex-col max-lg:gap-0.5">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 lg:hidden">
                            Facultad destino
                          </p>
                          <p className="hidden lg:block">
                            <span className="text-slate-500">Facultad destino:</span>{' '}
                            <span className="text-[#f0f4f8]">{batchDetail.destinoFacultad ?? 'No definida'}</span>
                          </p>
                          <p className="break-words text-[#f0f4f8] lg:hidden">
                            {batchDetail.destinoFacultad ?? 'No definida'}
                          </p>
                        </div>
                        <div className="max-lg:flex max-lg:flex-col max-lg:gap-0.5">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 lg:hidden">
                            Carrera destino
                          </p>
                          <p className="hidden lg:block">
                            <span className="text-slate-500">Carrera destino:</span>{' '}
                            <span className="text-[#f0f4f8]">{batchDetail.destinoCarrera ?? 'No definida'}</span>
                          </p>
                          <p className="break-words text-[#f0f4f8] lg:hidden">
                            {batchDetail.destinoCarrera ?? 'No definida'}
                          </p>
                        </div>
                        {(() => {
                          const sem = batchDetail.descripcion?.match(/(\d{1,2})\s*°?\s*semestre|semestre\s*(\d{1,2})/i);
                          const num = sem ? Number(sem[1] ?? sem[2]) : null;
                          return num ? (
                            <div className="max-lg:flex max-lg:flex-col max-lg:gap-0.5">
                              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 lg:hidden">
                                Semestre
                              </p>
                              <p className="hidden lg:block">
                                <span className="text-slate-500">Semestre:</span>{' '}
                                <span className="text-[#f0f4f8]">{num}° Semestre</span>
                              </p>
                              <p className="text-[#f0f4f8] lg:hidden">{num}° Semestre</p>
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                        <div>
                          <p className="uppercase tracking-widest">Procesados</p>
                          <p className="text-emerald-400 text-lg font-semibold">{batchDetail.procesados}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-widest">Errores</p>
                          <p className="text-rose-400 text-lg font-semibold">{batchDetail.errores}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="uppercase tracking-widest">Última acción</p>
                          <p className="text-[#f0f4f8] text-sm">{formatDate(batchDetail.ejecutadoEn)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="import-lote-registros-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#132a52] p-4 max-xl:pt-3 xl:border-t xl:border-slate-800">
                      <div className="mb-3 shrink-0 space-y-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-[#f0f4f8]">Registros cargados</p>
                          <span className="text-[11px] tabular-nums text-slate-500">
                            {recordsLoading
                              ? '…'
                              : `${records.length}${batchDetail.totalRegistros ? ` / ${batchDetail.totalRegistros}` : ''}`}
                          </span>
                        </div>
                        <p className="text-[11px] leading-snug text-slate-500">
                          Vista previa de cada fila del Excel (campos detectados en el archivo).
                        </p>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar registros">
                          {recordFilterOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setRecordFilter(option.id)}
                              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                                recordFilter === option.id
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-[#f0f4f8]'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="import-registros-list scroll-region scrollbar-hide min-h-[10rem] min-w-0 flex-1 overflow-y-auto overscroll-y-contain pr-0.5">
                        {recordsLoading ? (
                          <p className="py-8 text-center text-sm text-slate-500">Cargando registros…</p>
                        ) : records.length ? (
                          <ul className="flex flex-col gap-3 pb-1">
                            {records.map((registro) => {
                              const { entries, truncated, total } = recordPreviewEntries(registro);
                              const invalid = registro.valido === false;
                              const titulo = recordAlumnoTitulo(registro);
                              return (
                                <li
                                  key={registro.id ?? `fila-${registro.fila}`}
                                  className={`import-lote-registro-card overflow-hidden rounded-lg border shadow-sm ${
                                    invalid
                                      ? 'border-rose-300 bg-rose-50 dark:border-rose-400/35 dark:bg-rose-950/25'
                                      : 'border-slate-200 bg-white dark:border-slate-600 dark:bg-[#0f1f3d]'
                                  }`}
                                >
                                  <div
                                    className={`flex flex-col gap-1 border-b px-3 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-2 ${
                                      invalid
                                        ? 'border-rose-200 bg-rose-100 dark:border-rose-400/25 dark:bg-rose-500/15'
                                        : 'border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/50'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                        <span className="material-symbols-outlined text-[16px] text-slate-400">
                                          table_rows
                                        </span>
                                        Fila {registro.fila ?? '—'}
                                      </span>
                                      {titulo ? (
                                        <p className="mt-1 break-words text-xs font-medium leading-snug text-slate-800 dark:text-[#e7eef9]">
                                          {titulo}
                                        </p>
                                      ) : null}
                                    </div>
                                    {invalid ? (
                                      <span className="shrink-0 text-[11px] font-semibold text-rose-700 dark:text-rose-200">
                                        Revisar
                                      </span>
                                    ) : (
                                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                        Válido
                                      </span>
                                    )}
                                  </div>
                                  <div className="px-3 py-2.5">
                                    {!entries.length ? (
                                      <p className="text-xs text-slate-600 dark:text-slate-400">
                                        Sin campos visibles en esta fila.
                                      </p>
                                    ) : (
                                      <dl className="space-y-2">
                                        {entries.map(({ key, label, value }) => (
                                          <div key={key} className="grid grid-cols-1 gap-0.5">
                                            <dt
                                              className="text-[10px] uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400"
                                              title={key}
                                            >
                                              {label}
                                            </dt>
                                            <dd className="break-words text-xs leading-snug text-slate-900 dark:text-[#e7eef9]">
                                              {value}
                                            </dd>
                                          </div>
                                        ))}
                                      </dl>
                                    )}
                                    {truncated ? (
                                      <p className="mt-2 border-t border-slate-200 pt-2 text-[10px] text-slate-500 dark:border-slate-600">
                                        Mostrando {entries.length} de {total} campos.
                                      </p>
                                    ) : null}
                                    {registro.mensajeError ? (
                                      <p className="mt-2 border-t border-rose-200 pt-2 text-[11px] leading-snug text-rose-700 dark:border-rose-400/25 dark:text-rose-200">
                                        {registro.mensajeError}
                                      </p>
                                    ) : null}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="py-8 text-center text-sm text-slate-500">
                            No hay registros con el filtro seleccionado.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-slate-500 max-xl:hidden">
                    Selecciona un lote del historial para ver sus detalles.
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>
      </div>

      <ConfirmDialog
        open={discardDialogLoteId != null}
        onCancel={() => {
          if (!discardLoading) setDiscardDialogLoteId(null);
        }}
        onConfirm={() => void ejecutarDescarteLote()}
        title="¿Descartar esta importación?"
        description={
          archivoDescarte
            ? loteDescarte?.estado === 'error'
              ? `Se eliminará «${archivoDescarte}» del historial junto con sus registros de error.`
              : `Se eliminará el archivo «${archivoDescarte}» y toda la vista previa. No se aplicará nada en la base de datos hasta que confirmes un lote.`
            : undefined
        }
        confirmLabel="Descartar"
        cancelLabel="Volver"
        variant="danger"
        loading={discardLoading}
      />
    </div>
  );
}


