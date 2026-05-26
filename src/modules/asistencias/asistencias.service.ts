import { pool } from '../../config/database';
import { normalizarRolComparacion } from '../../middlewares/auth.middleware';
import { ROLES_APROBADORES_JUSTIFICACIONES } from '../../utils/rbac';
import {
    assertCursoEnAlcance,
    resolverAlcanceMatriculasFacultad,
    type AlcanceMatriculasFacultad,
} from '../../utils/alumnos-scope';
import { SQL_ALUMNO_APELLIDOS_COMA_NOMBRES } from '../../utils/alumno-nombre-sql';
import { recalcularMetricasCurso } from '../../utils/metricas-asistencia';

/** Orden de filas en planilla: importación primero; legacy sin orden → apellido. */
export const SQL_ORDEN_MATRICULA_PLANILLA =
    'mat.orden_lista NULLS LAST, al.apellidos NULLS LAST, al.nombres NULLS LAST, al.nombre_apellido NULLS LAST, mat.id';

const ROLES_APROBADORES_JUSTIFICACIONES_NORMALIZADOS = ROLES_APROBADORES_JUSTIFICACIONES.map((r) =>
    normalizarRolComparacion(r)
);

function rolesIncluyenAprobadorJustificaciones(roles: string[]): boolean {
    const usuario = roles.map((r) => normalizarRolComparacion(String(r)));
    return usuario.some((r) => ROLES_APROBADORES_JUSTIFICACIONES_NORMALIZADOS.includes(r));
}

interface PlanillaFiltro {
    cursoId: number;
    fecha?: string;
}

interface PlanillasAsignadasFiltro {
    fecha?: string;
}

interface GestionContexto {
    usuarioId: string;
    roles: string[];
    /** Administrador General / Secretaría Académica: sin filtro de facultad/carrera. */
    sinRestriccionAlcance: boolean;
    /** Jefe de Carrera, Secretaría Académica y Administrador General: alcance amplio en planillas. */
    puedeGestionarTodos: boolean;
    /** Alcance precalculado por el middleware (cache en req.alcanceMatriculas). Evita query a usuario_scopes. */
    alcance?: AlcanceMatriculasFacultad;
}

interface RegistrarAsistenciaInput {
    sesionId: number;
    matriculaId: number;
    estado: 'presente' | 'ausente' | 'justificada';
    justificada?: boolean;
    observaciones?: string;
}

interface RegistroAsistenciaLoteItem {
    matriculaId: number;
    estado: 'presente' | 'ausente' | 'justificada';
    justificada: boolean;
    observaciones?: string;
}

interface RegistrarAsistenciaLoteInput {
    sesionId: number;
    registros: RegistroAsistenciaLoteItem[];
}

export async function obtenerAsistenciaSesionMatricula(sesionId: number, matriculaId: number) {
    const { rows } = await pool.query(
        `SELECT id, sesion_id, matricula_id, estado, justificada, observaciones, registrado_por, registrado_en
         FROM asistencias
         WHERE sesion_id = $1 AND matricula_id = $2`,
        [sesionId, matriculaId]
    );
    return rows[0] ?? null;
}

interface RegistrarJustificacionInput {
    asistenciaId?: number | null;
    sesionId?: number | null;
    matriculaId?: number | null;
    motivo: string;
    documentoUrl: string;
}

interface JustificacionFiltro {
    cursoId?: number;
    estado?: string;
}

interface ResolverJustificacionInput {
    justificacionId: number;
    accion: 'aprobar' | 'rechazar';
    comentarios?: string;
}

export async function obtenerEstadoJustificacionAuditoria(justificacionId: number) {
    const { rows } = await pool.query(
        `SELECT
            j.id,
            j.asistencia_id,
            j.estado_revision,
            j.revisado_por,
            j.revisado_en,
            j.comentarios_revision,
            a.estado AS estado_asistencia,
            COALESCE(a.justificada, FALSE) AS asistencia_justificada
         FROM justificaciones j
         JOIN asistencias a ON a.id = j.asistencia_id
         WHERE j.id = $1`,
        [justificacionId]
    );
    return rows[0] ?? null;
}

interface CrearSesionInput {
    cursoId: number;
    fecha: string; // ISO date
    observaciones?: string;
    modalidad?: 'presencial' | 'virtual';
}

interface PlanillaAsignada {
    curso_id: number;
    modulo_id: number;
    materia: string;
    carrera: string;
    facultad: string;
    fecha_inicio: string;
    fecha_fin: string;
    estado_modulo: string;
    aula: string | null;
    horario_inicio: string | null;
    horario_fin: string | null;
    notas: string | null;
    total_matriculas: number;
    docente_id: string;
    docente_usuario_id: string;
    docente: string;
}

interface PlanillaAsignadaResumen extends PlanillaAsignada {
    activa_hoy: boolean;
    periodo_label: string;
}

function fechaISO(valor: unknown): string {
    if (valor instanceof Date) {
        return valor.toISOString().slice(0, 10);
    }

    const texto = String(valor);
    const [soloFecha] = texto.split('T');
    return soloFecha;
}

function esViernesNoLectivo(fecha: string): boolean {
    const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
    return dia === 5;
}

function esDocumentoPdf(valor: string): boolean {
    const texto = valor.trim().toLowerCase();
    return /\.pdf($|[?#])/.test(texto);
}

function appendCondicionesAlcancePlanes(
    condiciones: string[],
    valores: Array<string | number | number[]>,
    alcance: AlcanceMatriculasFacultad
): void {
    if (alcance.tipo === 'sin_restriccion') return;
    if (alcance.tipo === 'carreras') {
        if (!alcance.carreraIds.length) {
            condiciones.push('FALSE');
            return;
        }
        valores.push(alcance.carreraIds);
        condiciones.push(`pe.carrera_id = ANY($${valores.length}::int[])`);
        return;
    }
    if (alcance.tipo === 'facultades') {
        if (!alcance.facultadIds.length) {
            condiciones.push('FALSE');
            return;
        }
        valores.push(alcance.facultadIds);
        condiciones.push(`ca.facultad_id = ANY($${valores.length}::int[])`);
    }
}

async function asegurarPermisoCurso(cursoId: number, contexto: GestionContexto): Promise<void> {
    if (contexto.sinRestriccionAlcance) {
        const { rowCount } = await pool.query(`SELECT 1 FROM cursos WHERE id = $1`, [cursoId]);
        if (!rowCount) throw new Error('Curso no encontrado');
        return;
    }

    if (contexto.puedeGestionarTodos || rolesIncluyenAprobadorJustificaciones(contexto.roles)) {
        const alcance = contexto.alcance ?? await resolverAlcanceMatriculasFacultad(contexto.usuarioId, contexto.roles);
        await assertCursoEnAlcance(cursoId, alcance);
        return;
    }

    const { rowCount: docenteOk } = await pool.query(
        `SELECT 1
         FROM cursos c
         JOIN docentes d ON d.id = c.docente_id
         WHERE c.id = $1 AND d.usuario_id = $2`,
        [cursoId, contexto.usuarioId]
    );

    if (!docenteOk) {
        throw new Error('No tienes permisos sobre este curso');
    }
}

async function asegurarPermisoSesion(sesionId: number, contexto: GestionContexto): Promise<number> {
    if (contexto.sinRestriccionAlcance) {
        const { rows: sesionRows } = await pool.query<{ curso_id: number }>(
            `SELECT sc.curso_id FROM sesiones_clase sc WHERE sc.id = $1`,
            [sesionId]
        );
        if (!sesionRows[0]) throw new Error('Sesión no encontrada');
        return sesionRows[0].curso_id;
    }

    if (contexto.puedeGestionarTodos || rolesIncluyenAprobadorJustificaciones(contexto.roles)) {
        const { rows: sesionRows } = await pool.query<{ curso_id: number }>(
            `SELECT sc.curso_id FROM sesiones_clase sc WHERE sc.id = $1`,
            [sesionId]
        );
        if (!sesionRows[0]) throw new Error('Sesión no encontrada');
        const cursoId = sesionRows[0].curso_id;
        const alcance = contexto.alcance ?? await resolverAlcanceMatriculasFacultad(contexto.usuarioId, contexto.roles);
        await assertCursoEnAlcance(cursoId, alcance);
        return cursoId;
    }

    const { rows } = await pool.query(
        `SELECT sc.curso_id
         FROM sesiones_clase sc
         JOIN cursos c ON c.id = sc.curso_id
         JOIN docentes d ON d.id = c.docente_id
         WHERE sc.id = $1 AND d.usuario_id = $2`,
        [sesionId, contexto.usuarioId]
    );

    if (!rows[0]) {
        throw new Error('No tienes permisos sobre esta sesión');
    }

    return rows[0].curso_id;
}

async function asegurarMatriculaEnCurso(matriculaId: number, cursoId: number): Promise<void> {
    const { rowCount } = await pool.query(
        `SELECT 1 FROM matriculas WHERE id = $1 AND curso_id = $2`,
        [matriculaId, cursoId]
    );
    if (!rowCount) {
        throw new Error('La matrícula no pertenece al curso');
    }
}

async function obtenerSesionPorCursoFecha(cursoId: number, fecha: string) {
    const { rows } = await pool.query(
        `SELECT * FROM sesiones_clase WHERE curso_id = $1 AND fecha = $2`,
        [cursoId, fecha]
    );
    return rows[0] ?? null;
}

export async function obtenerPlanilla(filtro: PlanillaFiltro) {
    const valores: Array<number | string> = [filtro.cursoId];
    let where = 'c.id = $1';

    if (filtro.fecha) {
        valores.push(filtro.fecha);
        where += ' AND sc.fecha = $2';
    }

    const consulta = `
        SELECT
            mat.id AS matricula_id,
            ${SQL_ALUMNO_APELLIDOS_COMA_NOMBRES} AS alumno,
            al.numero_documento,
            mat.estado_academico,
            mat.faltas_acumuladas,
            mat.porcentaje_asistencia,
            mat.orden_lista,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'sesion_id', sc.id,
                    'fecha', sc.fecha,
                    'estado_sesion', sc.estado,
                    'estado_asistencia', a.estado,
                    'justificada', COALESCE(a.justificada, FALSE),
                    'observaciones', a.observaciones
                ) ORDER BY sc.fecha
            ) FILTER (WHERE sc.id IS NOT NULL) AS sesiones
        FROM sesiones_clase sc
        JOIN cursos c ON c.id = sc.curso_id
        JOIN modulos_academicos mo ON mo.id = c.modulo_id
        JOIN materias m ON m.id = mo.materia_id
        JOIN docentes d ON d.id = c.docente_id
        JOIN usuarios u_doc ON u_doc.id = d.usuario_id
        JOIN matriculas mat ON mat.curso_id = c.id
        JOIN alumnos al ON al.id = mat.alumno_id
        LEFT JOIN asistencias a ON a.sesion_id = sc.id AND a.matricula_id = mat.id
        WHERE ${where}
        GROUP BY mat.id, al.id, al.numero_documento, mat.estado_academico, mat.faltas_acumuladas, mat.porcentaje_asistencia, mat.orden_lista
        ORDER BY ${SQL_ORDEN_MATRICULA_PLANILLA};
    `;

    const { rows } = await pool.query(consulta, valores);
    return rows;
}

export async function obtenerPlanillaConPermisos(
    filtro: PlanillaFiltro,
    contexto: GestionContexto
) {
    await asegurarPermisoCurso(filtro.cursoId, contexto);
    return obtenerPlanilla(filtro);
}

export async function listarPlanillasAsignadas(
    contexto: GestionContexto,
    filtro: PlanillasAsignadasFiltro = {}
): Promise<PlanillaAsignadaResumen[]> {
    const valores: Array<string | number | number[]> = [];
    const condiciones: string[] = [];

    if (!contexto.puedeGestionarTodos) {
        valores.push(contexto.usuarioId);
        condiciones.push(`d.usuario_id = $${valores.length}`);
    } else if (!contexto.sinRestriccionAlcance) {
        const alcance = contexto.alcance ?? await resolverAlcanceMatriculasFacultad(contexto.usuarioId, contexto.roles);
        appendCondicionesAlcancePlanes(condiciones, valores, alcance);
    }

    // No filtramos por fecha de rango — mostrar todos los módulos no cerrados
    condiciones.push(`LOWER(ma.estado) != 'cerrado'`);

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const { rows } = await pool.query<PlanillaAsignada>(
        `SELECT
            c.id AS curso_id,
            c.modulo_id,
            m.nombre AS materia,
            ca.nombre AS carrera,
            f.nombre AS facultad,
            ma.fecha_inicio::text,
            ma.fecha_fin::text,
            ma.estado AS estado_modulo,
            c.aula,
            c.horario_inicio::text,
            c.horario_fin::text,
            c.notas,
            (SELECT COUNT(*)::int FROM matriculas mt WHERE mt.curso_id = c.id) AS total_matriculas,
            d.id AS docente_id,
            d.usuario_id AS docente_usuario_id,
            CONCAT(u.nombres, ' ', u.apellidos) AS docente
         FROM cursos c
         JOIN modulos_academicos ma ON ma.id = c.modulo_id
         JOIN materias m ON m.id = ma.materia_id
         JOIN planes_estudio pe ON pe.id = m.plan_id
         JOIN carreras ca ON ca.id = pe.carrera_id
         JOIN facultades f ON f.id = ca.facultad_id
         JOIN docentes d ON d.id = c.docente_id
         JOIN usuarios u ON u.id = d.usuario_id
         ${where}
         ORDER BY ma.fecha_inicio DESC, m.nombre ASC, c.id ASC`,
        valores
    );

    return rows.map((row) => ({
        ...row,
        activa_hoy: filtro.fecha ? filtro.fecha >= row.fecha_inicio && filtro.fecha <= row.fecha_fin : false,
        periodo_label: `${new Date(`${row.fecha_inicio}T00:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`,
    }));
}

export async function obtenerResumenCurso(cursoId: number) {
    const { rows } = await pool.query(
        `SELECT * FROM vw_resumen_asistencia_curso WHERE curso_id = $1`,
        [cursoId]
    );
    return rows[0] ?? null;
}

export async function obtenerHabilitados(cursoId: number) {
    const { rows } = await pool.query(
        `SELECT * FROM vw_habilitados_examen WHERE curso_id = $1 ORDER BY alumno`,
        [cursoId]
    );
    return rows;
}

export async function registrarAsistenciaDocente(
    input: RegistrarAsistenciaInput,
    contexto: GestionContexto
) {
    const cursoId = await asegurarPermisoSesion(input.sesionId, contexto);

    const { rows: sesionRows } = await pool.query(
        `SELECT sc.fecha, sc.estado AS estado_sesion, ma.estado AS estado_modulo
         FROM sesiones_clase sc
         JOIN cursos c ON c.id = sc.curso_id
         JOIN modulos_academicos ma ON ma.id = c.modulo_id
         WHERE sc.id = $1`,
        [input.sesionId]
    );
    const sesion = sesionRows[0];
    if (!sesion) {
        throw new Error('Sesión no encontrada');
    }

    if (String(sesion.estado_modulo).toLowerCase() === 'cerrado') {
        throw new Error('No se pueden registrar asistencias en un módulo académico cerrado');
    }

    if (String(sesion.estado_sesion).toLowerCase() === 'cerrada') {
        throw new Error('No se puede modificar la asistencia de una jornada cerrada');
    }

    await asegurarMatriculaEnCurso(input.matriculaId, cursoId);

    const { rows } = await pool.query(
        `INSERT INTO asistencias (sesion_id, matricula_id, estado, justificada, observaciones, registrado_por)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (sesion_id, matricula_id)
         DO UPDATE SET estado = EXCLUDED.estado,
                       justificada = EXCLUDED.justificada,
                       observaciones = EXCLUDED.observaciones,
                       registrado_por = EXCLUDED.registrado_por,
                       registrado_en = NOW()
         RETURNING id, sesion_id, matricula_id, estado, justificada, observaciones, registrado_por, registrado_en`,
        [
            input.sesionId,
            input.matriculaId,
            input.estado,
            input.justificada ?? false,
            input.observaciones ?? null,
            contexto.usuarioId
        ]
    );

    return rows[0];
}

export async function registrarAsistenciasLote(
    input: RegistrarAsistenciaLoteInput,
    contexto: GestionContexto
) {
    if (!input.registros.length) {
        throw new Error('No hay registros para guardar');
    }

    const cursoId = await asegurarPermisoSesion(input.sesionId, contexto);

    const { rows: sesionRows } = await pool.query(
        `SELECT sc.fecha, sc.estado AS estado_sesion, ma.estado AS estado_modulo
         FROM sesiones_clase sc
         JOIN cursos c ON c.id = sc.curso_id
         JOIN modulos_academicos ma ON ma.id = c.modulo_id
         WHERE sc.id = $1`,
        [input.sesionId]
    );
    const sesion = sesionRows[0];
    if (!sesion) {
        throw new Error('Sesión no encontrada');
    }

    if (String(sesion.estado_modulo).toLowerCase() === 'cerrado') {
        throw new Error('No se pueden registrar asistencias en un módulo académico cerrado');
    }

    if (String(sesion.estado_sesion).toLowerCase() === 'cerrada') {
        throw new Error('No se puede modificar la asistencia de una jornada cerrada');
    }

    const matriculaIds = input.registros.map((r) => r.matriculaId);
    const { rows: matRows } = await pool.query<{ id: number }>(
        `SELECT id FROM matriculas WHERE id = ANY($1::int[]) AND curso_id = $2`,
        [matriculaIds, cursoId]
    );
    const matriculaValidaIds = new Set(matRows.map((r) => r.id));
    const registrosValidos = input.registros.filter((r) => matriculaValidaIds.has(r.matriculaId));

    if (!registrosValidos.length) {
        throw new Error('Ninguna matrícula pertenece al curso');
    }

    const unnestMatriculaIds = registrosValidos.map((r) => r.matriculaId);
    const unnestEstados = registrosValidos.map((r) => r.estado);
    const unnestJustificadas = registrosValidos.map((r) => r.justificada ?? false);
    const unnestObservaciones = registrosValidos.map((r) => r.observaciones ?? null);

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        const { rows: countRows } = await cliente.query<{ count: string }>(
            `WITH ins AS (
                INSERT INTO asistencias (sesion_id, matricula_id, estado, justificada, observaciones, registrado_por)
                SELECT $1::int, u.matricula_id, u.estado::estado_asistencia, u.justificada, u.observaciones, $6::uuid
                FROM unnest($2::int[], $3::text[], $4::boolean[], $5::text[])
                    AS u(matricula_id, estado, justificada, observaciones)
                ON CONFLICT (sesion_id, matricula_id)
                DO UPDATE SET estado = EXCLUDED.estado,
                              justificada = EXCLUDED.justificada,
                              observaciones = EXCLUDED.observaciones,
                              registrado_por = EXCLUDED.registrado_por,
                              registrado_en = NOW()
                RETURNING matricula_id
            )
            SELECT COUNT(*)::text AS count FROM ins`,
            [
                input.sesionId,
                unnestMatriculaIds,
                unnestEstados,
                unnestJustificadas,
                unnestObservaciones,
                contexto.usuarioId
            ]
        );

        await cliente.query('COMMIT');

        const procesados = Number(countRows[0]?.count ?? 0);
        return { sesionId: input.sesionId, cursoId, procesados, omitidos: input.registros.length - registrosValidos.length };
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
}

/** Marca presente a todas las matrículas del curso para una sesión concreta (no toca otras sesiones). */
export async function marcarTodosPresentesSesionDocente(sesionId: number, contexto: GestionContexto) {
    const cursoId = await asegurarPermisoSesion(sesionId, contexto);

    const { rows: sesionRows } = await pool.query(
        `SELECT sc.fecha, sc.estado AS estado_sesion, ma.estado AS estado_modulo
         FROM sesiones_clase sc
         JOIN cursos c ON c.id = sc.curso_id
         JOIN modulos_academicos ma ON ma.id = c.modulo_id
         WHERE sc.id = $1`,
        [sesionId]
    );
    const sesion = sesionRows[0];
    if (!sesion) {
        throw new Error('Sesión no encontrada');
    }

    if (String(sesion.estado_modulo).toLowerCase() === 'cerrado') {
        throw new Error('No se pueden registrar asistencias en un módulo académico cerrado');
    }

    if (String(sesion.estado_sesion).toLowerCase() === 'cerrada') {
        throw new Error('No se puede marcar en una sesión cerrada');
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        const { rows: countRows } = await cliente.query<{ count: string }>(
            `WITH ins AS (
                INSERT INTO asistencias (sesion_id, matricula_id, estado, justificada, observaciones, registrado_por)
                SELECT $1::int, mat.id, 'presente', FALSE, NULL, $2::uuid
                FROM matriculas mat
                WHERE mat.curso_id = $3::int
                ON CONFLICT (sesion_id, matricula_id)
                DO UPDATE SET estado = EXCLUDED.estado,
                              justificada = FALSE,
                              observaciones = NULL,
                              registrado_por = EXCLUDED.registrado_por,
                              registrado_en = NOW()
                RETURNING matricula_id
            )
            SELECT COUNT(*)::text AS count FROM ins`,
            [sesionId, contexto.usuarioId, cursoId]
        );

        await cliente.query('COMMIT');

        const actualizados = Number(countRows[0]?.count ?? 0);
        return { sesionId, cursoId, actualizados };
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
}

export async function registrarJustificacionDocente(
    input: RegistrarJustificacionInput,
    contexto: GestionContexto
) {
    if (!esDocumentoPdf(input.documentoUrl)) {
        throw new Error('Solo se permiten documentos PDF para justificar inasistencias');
    }

    let sesionId: number;
    let matriculaId: number;

    if (!input.asistenciaId) {
        if (!input.sesionId || !input.matriculaId) {
            throw new Error('asistenciaId o (sesionId + matriculaId) son obligatorios');
        }
        sesionId = input.sesionId;
        matriculaId = input.matriculaId;
    } else {
        const { rows: asistenciaRows } = await pool.query<{ sesion_id: number; matricula_id: number }>(
            `SELECT sesion_id, matricula_id FROM asistencias WHERE id = $1`,
            [input.asistenciaId]
        );
        if (!asistenciaRows[0]) {
            throw new Error('Asistencia no encontrada');
        }
        sesionId = asistenciaRows[0].sesion_id;
        matriculaId = asistenciaRows[0].matricula_id;
    }

    const cursoId = await asegurarPermisoSesion(sesionId, contexto);

    const { rows: sesionRows } = await pool.query(
        `SELECT sc.fecha, sc.estado AS estado_sesion, ma.estado AS estado_modulo
         FROM sesiones_clase sc
         JOIN cursos c ON c.id = sc.curso_id
         JOIN modulos_academicos ma ON ma.id = c.modulo_id
         WHERE sc.id = $1`,
        [sesionId]
    );
    const sesion = sesionRows[0];
    if (!sesion) {
        throw new Error('Sesión no encontrada');
    }

    if (String(sesion.estado_modulo).toLowerCase() === 'cerrado') {
        throw new Error('No se pueden justificar inasistencias en un módulo académico cerrado');
    }

    await asegurarMatriculaEnCurso(matriculaId, cursoId);

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        const { rows: upsertRows } = await cliente.query(
            `INSERT INTO asistencias (sesion_id, matricula_id, estado, justificada, registrado_por)
             VALUES ($1, $2, 'ausente', FALSE, $3)
             ON CONFLICT (sesion_id, matricula_id)
             DO UPDATE SET estado = 'ausente', registrado_por = EXCLUDED.registrado_por
             RETURNING id`,
            [sesionId, matriculaId, contexto.usuarioId]
        );
        const asistenciaId = input.asistenciaId ?? upsertRows[0].id;

        const { rows } = await cliente.query(
            `INSERT INTO justificaciones (asistencia_id, motivo, documento_url, estado_revision)
             VALUES ($1, $2, $3, 'pendiente')
             ON CONFLICT (asistencia_id)
             DO UPDATE SET motivo = EXCLUDED.motivo,
                           documento_url = EXCLUDED.documento_url,
                           estado_revision = 'pendiente',
                           revisado_por = NULL,
                           revisado_en = NULL,
                           comentarios_revision = NULL
             RETURNING id, asistencia_id, motivo, documento_url, estado_revision, revisado_por, revisado_en`,
            [asistenciaId, input.motivo, input.documentoUrl ?? null]
        );

        await cliente.query('COMMIT');
        return rows[0];
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
}

export async function listarJustificaciones(
    filtro: JustificacionFiltro,
    contexto: GestionContexto
) {
    const alcance = contexto.alcance ?? await resolverAlcanceMatriculasFacultad(contexto.usuarioId, contexto.roles);
    const esAprobadorJustificaciones = rolesIncluyenAprobadorJustificaciones(contexto.roles);
    const puedeListarSinCurso =
        contexto.sinRestriccionAlcance || contexto.puedeGestionarTodos || esAprobadorJustificaciones;

    if (!filtro.cursoId) {
        if (!puedeListarSinCurso) {
            throw new Error('Debes indicar un curso para consultar justificaciones');
        }
        if (!contexto.sinRestriccionAlcance) {
            if (alcance.tipo === 'carreras' && !alcance.carreraIds.length) {
                return [];
            }
            if (alcance.tipo === 'facultades' && !alcance.facultadIds.length) {
                return [];
            }
        }
    }

    if (filtro.cursoId) {
        await asegurarPermisoCurso(filtro.cursoId, contexto);
    }

    const condiciones: string[] = [];
    const valores: Array<number | string | number[]> = [];

    if (filtro.cursoId) {
        valores.push(filtro.cursoId);
        condiciones.push(`c.id = $${valores.length}`);
    } else if (!contexto.sinRestriccionAlcance && puedeListarSinCurso) {
        appendCondicionesAlcancePlanes(condiciones, valores, alcance);
    }

    if (filtro.estado) {
        valores.push(filtro.estado);
        condiciones.push(`j.estado_revision = $${valores.length}`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const { rows } = await pool.query(
        `SELECT
            j.id,
            j.asistencia_id,
            j.motivo,
            j.documento_url,
            j.estado_revision,
            j.revisado_por,
            j.revisado_en,
            j.comentarios_revision,
            a.estado AS estado_asistencia,
            a.justificada,
            a.observaciones,
            sc.id AS sesion_id,
            sc.fecha,
            c.id AS curso_id,
            m.nombre AS materia,
            mat.id AS matricula_id,
            ${SQL_ALUMNO_APELLIDOS_COMA_NOMBRES} AS alumno,
            al.numero_orden,
            al.numero_documento,
            ca.nombre AS carrera,
            fac.nombre AS facultad,
            mo.anio AS modulo_anio,
            mo.mes AS modulo_mes
        FROM justificaciones j
        JOIN asistencias a ON a.id = j.asistencia_id
        JOIN sesiones_clase sc ON sc.id = a.sesion_id
        JOIN cursos c ON c.id = sc.curso_id
        JOIN modulos_academicos mo ON mo.id = c.modulo_id
        JOIN materias m ON m.id = mo.materia_id
        JOIN planes_estudio pe ON pe.id = m.plan_id
        JOIN carreras ca ON ca.id = pe.carrera_id
        JOIN facultades fac ON fac.id = ca.facultad_id
        JOIN matriculas mat ON mat.id = a.matricula_id
        JOIN alumnos al ON al.id = mat.alumno_id
        ${where}
        ORDER BY sc.fecha DESC, j.id DESC` ,
        valores
    );

    return rows;
}

export async function resolverJustificacion(
    input: ResolverJustificacionInput,
    contexto: GestionContexto
) {
    if (!rolesIncluyenAprobadorJustificaciones(contexto.roles)) {
        throw new Error('No tienes permisos para resolver justificaciones');
    }

    const { rows } = await pool.query(
        `SELECT j.id, j.estado_revision, j.asistencia_id
         FROM justificaciones j
         WHERE j.id = $1`,
        [input.justificacionId]
    );

    const justificacion = rows[0];
    if (!justificacion) {
        throw new Error('Justificación no encontrada');
    }
    if (justificacion.estado_revision !== 'pendiente') {
        throw new Error('La justificación ya fue revisada');
    }

    const { rows: cursoRows } = await pool.query<{ curso_id: number }>(
        `SELECT c.id AS curso_id
         FROM justificaciones j
         JOIN asistencias a ON a.id = j.asistencia_id
         JOIN sesiones_clase sc ON sc.id = a.sesion_id
         JOIN cursos c ON c.id = sc.curso_id
         WHERE j.id = $1`,
        [input.justificacionId]
    );
    const cursoIdJust = cursoRows[0]?.curso_id;
    if (cursoIdJust == null) {
        throw new Error('Justificación no encontrada');
    }

    if (!contexto.sinRestriccionAlcance) {
        const alcanceResolucion = contexto.alcance ?? await resolverAlcanceMatriculasFacultad(contexto.usuarioId, contexto.roles);
        await assertCursoEnAlcance(cursoIdJust, alcanceResolucion);
    }

    const nuevoEstado = input.accion === 'aprobar' ? 'aprobada' : 'rechazada';
    const cliente = await pool.connect();

    try {
        await cliente.query('BEGIN');
        const { rows: justRows } = await cliente.query(
            `UPDATE justificaciones
             SET estado_revision = $2,
                 revisado_por = $3,
                 revisado_en = NOW(),
                 comentarios_revision = $4
             WHERE id = $1
             RETURNING id, asistencia_id, motivo, documento_url, estado_revision, revisado_por, revisado_en, comentarios_revision`,
            [input.justificacionId, nuevoEstado, contexto.usuarioId, input.comentarios ?? null]
        );

        if (input.accion === 'aprobar') {
            await cliente.query(
                `UPDATE asistencias
                 SET estado = 'justificada',
                     justificada = TRUE,
                     registrado_en = NOW()
                 WHERE id = $1`,
                [justificacion.asistencia_id]
            );
        } else {
            await cliente.query(
                `UPDATE asistencias
                 SET justificada = FALSE
                 WHERE id = $1`,
                [justificacion.asistencia_id]
            );
        }

        await cliente.query('COMMIT');
        return justRows[0];
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
}

export async function crearSesionDocente(input: CrearSesionInput, contexto: GestionContexto) {
    await asegurarPermisoCurso(input.cursoId, contexto);

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        const { rows: estadoModuloRows } = await cliente.query<{
            estado: string;
            fecha_inicio: string;
            fecha_fin: string;
        }>(
            `SELECT ma.estado, ma.fecha_inicio::text AS fecha_inicio, ma.fecha_fin::text AS fecha_fin
             FROM cursos c
             JOIN modulos_academicos ma ON ma.id = c.modulo_id
             WHERE c.id = $1`,
            [input.cursoId]
        );
        const modRow = estadoModuloRows[0];
        const estadoModulo = modRow?.estado as string | undefined;
        if (estadoModulo && estadoModulo.toLowerCase() === 'cerrado') {
            await cliente.query('ROLLBACK');
            throw new Error('No se pueden crear sesiones en un módulo académico cerrado');
        }

        const ini = String(modRow?.fecha_inicio ?? '').slice(0, 10);
        const fin = String(modRow?.fecha_fin ?? '').slice(0, 10);
        const fechaSes = String(input.fecha).slice(0, 10);
        if (ini && fin && (fechaSes < ini || fechaSes > fin)) {
            await cliente.query('ROLLBACK');
            throw new Error('La fecha de la sesión debe estar dentro del período del módulo académico del curso');
        }

        const existente = await cliente.query(
            `SELECT 1 FROM sesiones_clase WHERE curso_id = $1 AND fecha = $2`,
            [input.cursoId, input.fecha]
        );
        if (existente.rowCount) {
            await cliente.query('ROLLBACK');
            throw new Error('Ya existe una sesión para ese día');
        }

        const modalidad = input.modalidad ?? 'presencial';
        const { rows } = await cliente.query(
            `INSERT INTO sesiones_clase (curso_id, fecha, estado, observaciones, modalidad)
             VALUES ($1, $2, 'abierta', $3, $4)
             RETURNING id, curso_id, fecha, estado, observaciones, modalidad`,
            [input.cursoId, input.fecha, input.observaciones ?? null, modalidad]
        );

        const sesion = rows[0];

        await cliente.query(
            `WITH ins AS (
                INSERT INTO asistencias (sesion_id, matricula_id, estado, justificada, observaciones, registrado_por)
                SELECT $1::int, mat.id, 'presente', FALSE, NULL, $2::uuid
                FROM matriculas mat
                WHERE mat.curso_id = $3::int
                ON CONFLICT (sesion_id, matricula_id)
                DO UPDATE SET estado = EXCLUDED.estado,
                              justificada = FALSE,
                              observaciones = NULL,
                              registrado_por = EXCLUDED.registrado_por,
                              registrado_en = NOW()
                RETURNING matricula_id
            )
            SELECT COUNT(*)::text AS count FROM ins`,
            [sesion.id, contexto.usuarioId, input.cursoId]
        );

        await cliente.query('COMMIT');
        return sesion;
    } catch (error) {
        try { await cliente.query('ROLLBACK'); } catch (_e) { /* already rolled back or committed */ }
        throw error;
    } finally {
        cliente.release();
    }
}

export async function actualizarModalidadSesion(
    sesionId: number,
    modalidad: 'presencial' | 'virtual',
    contexto: GestionContexto
) {
    await asegurarPermisoSesion(sesionId, contexto);

    const { rows: estadoRows } = await pool.query(
        `SELECT estado FROM sesiones_clase WHERE id = $1`,
        [sesionId]
    );
    if (!estadoRows[0]) {
        throw new Error('Sesión no encontrada');
    }
    if (String(estadoRows[0].estado).toLowerCase() === 'cerrada') {
        throw new Error('No se puede cambiar la modalidad de una jornada cerrada');
    }

    const { rows } = await pool.query(
        `UPDATE sesiones_clase
         SET modalidad = $2
         WHERE id = $1
         RETURNING id, curso_id, fecha, estado, observaciones, modalidad, cerrado_por, cerrado_en`,
        [sesionId, modalidad]
    );

    if (!rows[0]) {
        throw new Error('Sesión no encontrada');
    }

    return rows[0];
}

export async function cerrarSesionDocente(
    sesionId: number,
    contexto: GestionContexto
) {
    const cursoId = await asegurarPermisoSesion(sesionId, contexto);

    const { rows: sesionRows } = await pool.query<{
        estado: string;
        estado_modulo: string;
    }>(
        `SELECT sc.estado, ma.estado AS estado_modulo
         FROM sesiones_clase sc
         JOIN cursos c ON c.id = sc.curso_id
         JOIN modulos_academicos ma ON ma.id = c.modulo_id
         WHERE sc.id = $1`,
        [sesionId]
    );
    const sesion = sesionRows[0];
    if (!sesion) {
        throw new Error('Sesión no encontrada');
    }

    if (String(sesion.estado_modulo).toLowerCase() === 'cerrado') {
        throw new Error('No se puede cerrar una jornada de un módulo académico cerrado');
    }

    const estadoSesion = String(sesion.estado).toLowerCase();
    if (estadoSesion === 'cerrada') {
        throw new Error('La jornada ya está cerrada');
    }
    if (estadoSesion !== 'abierta') {
        throw new Error('Solo se puede cerrar una jornada en estado abierta');
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        const { rows: matriculasRows } = await cliente.query<{ id: number }>(
            `SELECT id FROM matriculas WHERE curso_id = $1`,
            [cursoId]
        );
        if (!matriculasRows.length) {
            throw new Error('No hay alumnos matriculados en este curso para cerrar la lista');
        }

        await cliente.query(
            `INSERT INTO asistencias (sesion_id, matricula_id, estado, justificada, registrado_por)
             SELECT $1::int, mat.id, 'ausente', FALSE, $2::uuid
             FROM matriculas mat
             WHERE mat.curso_id = $3::int
               AND NOT EXISTS (
                 SELECT 1 FROM asistencias a
                 WHERE a.sesion_id = $1::int AND a.matricula_id = mat.id
               )`,
            [sesionId, contexto.usuarioId, cursoId]
        );

        const { rows: faltantesRows } = await cliente.query<{ total: string }>(
            `SELECT COUNT(*)::text AS total
             FROM matriculas mat
             WHERE mat.curso_id = $1
               AND NOT EXISTS (
                 SELECT 1 FROM asistencias a
                 WHERE a.sesion_id = $2 AND a.matricula_id = mat.id
               )`,
            [cursoId, sesionId]
        );
        if (Number(faltantesRows[0]?.total ?? 0) > 0) {
            throw new Error('No se pudo completar la lista: faltan alumnos por registrar');
        }

        const { rows } = await cliente.query(
            `UPDATE sesiones_clase
             SET estado = 'cerrada', cerrado_por = $2, cerrado_en = NOW()
             WHERE id = $1 AND LOWER(estado::text) = 'abierta'
             RETURNING id, curso_id, fecha, estado, observaciones, modalidad, cerrado_por, cerrado_en`,
            [sesionId, contexto.usuarioId]
        );

        if (!rows[0]) {
            throw new Error('No se pudo cerrar la jornada');
        }

        // Quienes ya tenían presente/justificada no disparan el trigger al cerrar (solo se inserta ausente al resto).
        await recalcularMetricasCurso(cliente, cursoId);

        await cliente.query('COMMIT');
        return rows[0];
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
}

export async function listarSesionesCurso(
    cursoId: number,
    contexto: GestionContexto,
    estado?: string
) {
    await asegurarPermisoCurso(cursoId, contexto);

    const valores: Array<number | string> = [cursoId];
    let where = 'curso_id = $1';
    if (estado) {
        valores.push(estado);
        where += ` AND estado = $${valores.length}`;
    }

    const { rows } = await pool.query(
        `SELECT id, curso_id, fecha, estado, observaciones, modalidad, cerrado_por, cerrado_en
         FROM sesiones_clase
         WHERE ${where}
         ORDER BY fecha DESC`,
        valores
    );

    return rows;
}

export async function listarAusenciasCurso(cursoId: number, contexto: GestionContexto) {
    await asegurarPermisoCurso(cursoId, contexto);

    const { rows } = await pool.query(
        `SELECT
            a.id        AS asistencia_id,
            a.estado,
            a.justificada,
            sc.id       AS sesion_id,
            sc.fecha::text AS fecha,
            mat.id      AS matricula_id,
            ${SQL_ALUMNO_APELLIDOS_COMA_NOMBRES} AS alumno,
            al.numero_documento
         FROM asistencias a
         JOIN sesiones_clase sc ON sc.id = a.sesion_id
         JOIN matriculas mat ON mat.id = a.matricula_id AND mat.curso_id = sc.curso_id
         JOIN alumnos al ON al.id = mat.alumno_id
         WHERE sc.curso_id = $1
           AND a.estado = 'ausente'
           AND COALESCE(a.justificada, FALSE) = FALSE
         ORDER BY sc.fecha DESC, ${SQL_ORDEN_MATRICULA_PLANILLA}`,
        [cursoId]
    );

    return rows;
}

export async function listarAlumnosCurso(cursoId: number, contexto: GestionContexto) {
    await asegurarPermisoCurso(cursoId, contexto);

    const { rows } = await pool.query(
        `SELECT
            mat.id AS matricula_id,
            ${SQL_ALUMNO_APELLIDOS_COMA_NOMBRES} AS alumno,
            al.numero_documento,
            mat.estado_academico,
            mat.faltas_acumuladas,
            mat.porcentaje_asistencia,
            mat.orden_lista
         FROM matriculas mat
         JOIN alumnos al ON al.id = mat.alumno_id
         WHERE mat.curso_id = $1
         ORDER BY ${SQL_ORDEN_MATRICULA_PLANILLA}`,
        [cursoId]
    );

    return rows;
}
