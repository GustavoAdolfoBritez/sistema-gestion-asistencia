"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.construirContextoAuditoria = construirContextoAuditoria;
exports.registrarEventoAuditoria = registrarEventoAuditoria;
exports.registrarEventoAuditoriaSegura = registrarEventoAuditoriaSegura;
exports.listarEventosAuditoria = listarEventosAuditoria;
exports.obtenerEventoAuditoriaPorId = obtenerEventoAuditoriaPorId;
exports.exportarEventosAuditoriaPdf = exportarEventosAuditoriaPdf;
const database_1 = require("../../config/database");
const logger_1 = require("../../utils/logger");
const pdf_kit_brand_1 = require("../../utils/pdf-kit-brand");
const auditoria_pdf_1 = require("./auditoria.pdf");
const reportes_utils_1 = require("../reportes/reportes.utils");
const actas_storage_service_1 = require("../../services/actas-storage.service");
function buildRecursoKey(tipo, id) {
    return `${tipo}:${id}`;
}
/** Construye un resumen desde el JSON de auditoría cuando no hay recurso_resumen persistido (eventos previos). */
function armarResumenDesdeDetallePromocion(accion, detalle) {
    if (!detalle || typeof detalle !== 'object' || Array.isArray(detalle))
        return null;
    const d = detalle;
    if (accion === 'promocionar_semestre_curricular') {
        const partes = [];
        const carrera = typeof d.carrera === 'string' ? d.carrera : null;
        if (carrera)
            partes.push(`Carrera: ${carrera}`);
        const so = d.semestreOrigen != null ? Number(d.semestreOrigen) : NaN;
        const sd = d.semestreDestino != null ? Number(d.semestreDestino) : NaN;
        if (Number.isFinite(so) && Number.isFinite(sd))
            partes.push(`Semestre ${so} → ${sd}`);
        const act = d.actualizados != null ? Number(d.actualizados) : NaN;
        if (Number.isFinite(act))
            partes.push(`${act} alumno(s)`);
        return partes.length ? partes.join(' · ') : null;
    }
    if (accion === 'promocionar_semestre_curricular_masivo_facultad') {
        const partes = [];
        const facultad = typeof d.facultad === 'string' ? d.facultad : null;
        if (facultad)
            partes.push(`Facultad: ${facultad}`);
        const anio = d.anioIngreso != null ? Number(d.anioIngreso) : NaN;
        if (Number.isFinite(anio))
            partes.push(`Año de ingreso ${Math.trunc(anio)}`);
        const so = d.semestreOrigen != null ? Number(d.semestreOrigen) : NaN;
        const sd = d.semestreDestino != null ? Number(d.semestreDestino) : NaN;
        if (Number.isFinite(so) && Number.isFinite(sd))
            partes.push(`Semestre ${so} → ${sd}`);
        const act = d.actualizados != null ? Number(d.actualizados) : NaN;
        if (Number.isFinite(act))
            partes.push(`${act} alumno(s)`);
        return partes.length ? partes.join(' · ') : null;
    }
    return null;
}
function aplicarResumenRecursoListado(ev, descripciones) {
    const rawPersisted = ev.recurso_resumen;
    const persisted = typeof rawPersisted === 'string' ? rawPersisted.trim() : String(rawPersisted ?? '').trim();
    if (persisted) {
        ev.recurso_resumen = persisted;
        return;
    }
    let lookup = '';
    if (ev.recurso_tipo && ev.recurso_id) {
        lookup = descripciones.get(buildRecursoKey(ev.recurso_tipo, ev.recurso_id)) ?? '';
    }
    const desdeDetalle = armarResumenDesdeDetallePromocion(ev.accion, ev.detalle) ?? '';
    const partes = [lookup.trim(), desdeDetalle.trim()].filter(Boolean);
    ev.recurso_resumen = partes.length ? partes.join(' · ') : null;
}
async function construirDescripcionesRecursos(eventos) {
    const porTipo = {};
    for (const ev of eventos) {
        if (!ev.recurso_tipo || !ev.recurso_id)
            continue;
        const tipo = ev.recurso_tipo;
        if (!porTipo[tipo])
            porTipo[tipo] = new Set();
        porTipo[tipo].add(ev.recurso_id);
    }
    const map = new Map();
    const toIntArray = (ids) => {
        if (!ids?.size)
            return [];
        return [...ids].map((id) => Number(id)).filter((n) => Number.isFinite(n) && Number.isInteger(n));
    };
    const toBigIntArray = (ids) => {
        if (!ids?.size)
            return [];
        return [...ids].filter((id) => /^\d+$/.test(id));
    };
    // Usuarios
    const usuarioIds = Array.from(porTipo.usuario ?? []);
    if (usuarioIds.length) {
        const { rows } = await database_1.pool.query(`SELECT id, NULLIF(trim(concat_ws(' ', nombres, apellidos)), '') AS nombre, email
             FROM usuarios
             WHERE id = ANY($1::uuid[])`, [usuarioIds]);
        for (const row of rows) {
            const etiquetaBase = row.nombre || row.email || 'Usuario';
            map.set(buildRecursoKey('usuario', row.id), `Usuario: ${etiquetaBase}`);
        }
    }
    // Sesión de auth (mismo id que usuario)
    const sesionAuthIds = Array.from(porTipo.sesion ?? []);
    if (sesionAuthIds.length) {
        const { rows } = await database_1.pool.query(`SELECT id, NULLIF(trim(concat_ws(' ', nombres, apellidos)), '') AS nombre, email
             FROM usuarios
             WHERE id = ANY($1::uuid[])`, [sesionAuthIds]);
        for (const row of rows) {
            const etiquetaBase = row.nombre || row.email || 'Usuario';
            map.set(buildRecursoKey('sesion', row.id), `Sesión (auth): ${etiquetaBase}`);
        }
    }
    // Alumnos
    const alumnoIds = Array.from(porTipo.alumno ?? []);
    if (alumnoIds.length) {
        const { rows } = await database_1.pool.query(`SELECT id, nombre_apellido, numero_documento
             FROM alumnos
             WHERE id = ANY($1::uuid[])`, [alumnoIds]);
        for (const row of rows) {
            const nombre = row.nombre_apellido || 'Alumno';
            const ci = row.numero_documento ? ` (CI ${row.numero_documento})` : '';
            map.set(buildRecursoKey('alumno', row.id), `${nombre}${ci}`);
        }
    }
    // Actas generadas
    const actaIds = toBigIntArray(porTipo.acta_generada);
    if (actaIds.length) {
        const { rows } = await database_1.pool.query(`SELECT id::text, tipo_acta, curso_id
             FROM actas_generadas
             WHERE id = ANY($1::bigint[])`, [actaIds]);
        for (const row of rows) {
            const etiqueta = `Acta #${row.id} (${row.tipo_acta}, curso ${row.curso_id})`;
            map.set(buildRecursoKey('acta_generada', String(row.id)), etiqueta);
        }
    }
    // Módulos académicos
    const moduloIds = toIntArray(porTipo.modulo_academico);
    if (moduloIds.length) {
        const { rows } = await database_1.pool.query(`SELECT ma.id, m.nombre AS materia, ma.anio, ma.mes, ma.estado
             FROM modulos_academicos ma
             JOIN materias m ON m.id = ma.materia_id
             WHERE ma.id = ANY($1::int[])`, [moduloIds]);
        for (const row of rows) {
            map.set(buildRecursoKey('modulo_academico', String(row.id)), `Módulo académico #${row.id}: ${row.materia} (${row.anio}-${String(row.mes).padStart(2, '0')}, ${row.estado})`);
        }
    }
    // Cursos (también usado como recurso en estadística de ausentismo)
    const cursoIds = new Set([...(porTipo.curso ?? []), ...(porTipo.estadistica_ausentismo ?? [])]);
    const cursoIdNums = toIntArray(cursoIds);
    if (cursoIdNums.length) {
        const { rows } = await database_1.pool.query(`SELECT c.id, m.nombre AS materia, mo.anio, mo.mes
             FROM cursos c
             JOIN modulos_academicos mo ON mo.id = c.modulo_id
             JOIN materias m ON m.id = mo.materia_id
             WHERE c.id = ANY($1::int[])`, [cursoIdNums]);
        for (const row of rows) {
            const etiqueta = `Curso #${row.id}: ${row.materia} (${row.anio}-${String(row.mes).padStart(2, '0')})`;
            map.set(buildRecursoKey('curso', String(row.id)), etiqueta);
            map.set(buildRecursoKey('estadistica_ausentismo', String(row.id)), `Estadística ausentismo · ${etiqueta}`);
        }
    }
    // Sesiones de clase
    const sesionClaseIds = toIntArray(porTipo.sesion_clase);
    if (sesionClaseIds.length) {
        const { rows } = await database_1.pool.query(`SELECT sc.id, sc.fecha::text AS fecha, sc.curso_id, m.nombre AS materia
             FROM sesiones_clase sc
             JOIN cursos c ON c.id = sc.curso_id
             JOIN modulos_academicos mo ON mo.id = c.modulo_id
             JOIN materias m ON m.id = mo.materia_id
             WHERE sc.id = ANY($1::int[])`, [sesionClaseIds]);
        for (const row of rows) {
            const fechaTxt = String(row.fecha).slice(0, 10);
            map.set(buildRecursoKey('sesion_clase', String(row.id)), `Sesión clase #${row.id}: ${row.materia} · curso ${row.curso_id} · ${fechaTxt}`);
        }
    }
    // Matrículas
    const matriculaIds = toIntArray(porTipo.matricula);
    if (matriculaIds.length) {
        const { rows } = await database_1.pool.query(`SELECT mat.id,
                    NULLIF(trim(concat_ws(', ', NULLIF(trim(al.apellidos), ''), NULLIF(trim(al.nombres), ''))), '') AS alumno,
                    al.numero_documento,
                    mat.curso_id,
                    m.nombre AS materia
             FROM matriculas mat
             JOIN alumnos al ON al.id = mat.alumno_id
             JOIN cursos c ON c.id = mat.curso_id
             JOIN modulos_academicos mo ON mo.id = c.modulo_id
             JOIN materias m ON m.id = mo.materia_id
             WHERE mat.id = ANY($1::int[])`, [matriculaIds]);
        for (const row of rows) {
            const nom = row.alumno || 'Alumno';
            const ci = row.numero_documento ? ` CI ${row.numero_documento}` : '';
            const mat = row.materia ? ` · ${row.materia}` : '';
            map.set(buildRecursoKey('matricula', String(row.id)), `Matrícula #${row.id}: ${nom}${ci}${mat} (curso ${row.curso_id})`);
        }
    }
    // Asistencias
    const asistenciaIds = toBigIntArray(porTipo.asistencia);
    if (asistenciaIds.length) {
        const { rows } = await database_1.pool.query(`SELECT a.id::text, a.sesion_id, a.matricula_id, sc.fecha::text AS fecha
             FROM asistencias a
             JOIN sesiones_clase sc ON sc.id = a.sesion_id
             WHERE a.id = ANY($1::bigint[])`, [asistenciaIds]);
        for (const row of rows) {
            const fechaTxt = String(row.fecha).slice(0, 10);
            map.set(buildRecursoKey('asistencia', row.id), `Asistencia #${row.id}: sesión ${row.sesion_id} (${fechaTxt}), matrícula ${row.matricula_id}`);
        }
    }
    // Justificaciones
    const justificacionIds = toBigIntArray(porTipo.justificacion);
    if (justificacionIds.length) {
        const { rows } = await database_1.pool.query(`SELECT j.id::text, j.estado_revision, a.matricula_id
             FROM justificaciones j
             JOIN asistencias a ON a.id = j.asistencia_id
             WHERE j.id = ANY($1::bigint[])`, [justificacionIds]);
        for (const row of rows) {
            map.set(buildRecursoKey('justificacion', row.id), `Justificación #${row.id}: matrícula ${row.matricula_id} · ${row.estado_revision}`);
        }
    }
    // Lotes de importación
    const loteIds = toBigIntArray(porTipo.lote_alumnos);
    if (loteIds.length) {
        const { rows } = await database_1.pool.query(`SELECT id::text, tipo_lote, descripcion, estado
             FROM lotes_importacion
             WHERE id = ANY($1::bigint[])`, [loteIds]);
        for (const row of rows) {
            const desc = row.descripcion ? ` · ${row.descripcion}` : '';
            map.set(buildRecursoKey('lote_alumnos', row.id), `Lote importación #${row.id} (${row.tipo_lote}, ${row.estado})${desc}`);
        }
    }
    // Alertas de asistencia
    const alertaIds = toIntArray(porTipo.alerta_asistencia);
    if (alertaIds.length) {
        const { rows } = await database_1.pool.query(`SELECT aa.id, aa.matricula_id, aa.tipo_alerta::text AS tipo_alerta, aa.estado,
                    NULLIF(trim(concat_ws(', ', NULLIF(trim(al.apellidos), ''), NULLIF(trim(al.nombres), ''))), '') AS alumno
             FROM alertas_asistencia aa
             JOIN matriculas mat ON mat.id = aa.matricula_id
             JOIN alumnos al ON al.id = mat.alumno_id
             WHERE aa.id = ANY($1::int[])`, [alertaIds]);
        for (const row of rows) {
            const alum = row.alumno ? ` · ${row.alumno}` : '';
            map.set(buildRecursoKey('alerta_asistencia', String(row.id)), `Alerta #${row.id}: ${row.tipo_alerta} · matrícula ${row.matricula_id}${alum} (${row.estado ?? 'sin estado'})`);
        }
    }
    // Carreras
    const carreraIds = toIntArray(porTipo.carrera);
    if (carreraIds.length) {
        const { rows } = await database_1.pool.query(`SELECT id, nombre FROM carreras WHERE id = ANY($1::int[])`, [carreraIds]);
        for (const row of rows) {
            map.set(buildRecursoKey('carrera', String(row.id)), `Carrera: ${row.nombre}`);
        }
    }
    // Facultades
    const facultadIds = toIntArray(porTipo.facultad);
    if (facultadIds.length) {
        const { rows } = await database_1.pool.query(`SELECT id, nombre FROM facultades WHERE id = ANY($1::int[])`, [facultadIds]);
        for (const row of rows) {
            map.set(buildRecursoKey('facultad', String(row.id)), `Facultad: ${row.nombre}`);
        }
    }
    return map;
}
function obtenerPrimerValor(value) {
    if (!value) {
        return undefined;
    }
    const texto = Array.isArray(value) ? value[0] : value;
    const [primero] = texto.split(',');
    const limpio = primero?.trim();
    return limpio || undefined;
}
function construirContextoAuditoria(req) {
    return {
        requestId: req.requestId,
        actorUsuarioId: req.usuario?.usuarioId,
        actorEmail: req.usuario?.email,
        actorRoles: req.usuario?.roles ?? [],
        ip: obtenerPrimerValor(req.headers['x-forwarded-for']) ?? req.ip,
        userAgent: req.headers['user-agent'] ?? undefined
    };
}
async function registrarEventoAuditoria(input) {
    const contexto = input.contexto ?? {};
    const actorRoles = Array.isArray(contexto.actorRoles) ? contexto.actorRoles : [];
    await database_1.pool.query(`INSERT INTO auditoria_eventos (
            request_id,
            actor_usuario_id,
            actor_email,
            actor_username,
            actor_roles,
            modulo,
            accion,
            recurso_tipo,
            recurso_id,
            recurso_resumen,
            resultado,
            severidad,
            ip,
            user_agent,
            detalle,
            antes,
            despues
        ) VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4,
            $5::text[],
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15::jsonb,
            $16::jsonb,
            $17::jsonb
        )`, [
        contexto.requestId ?? null,
        contexto.actorUsuarioId ?? null,
        contexto.actorEmail ?? null,
        contexto.actorUsername ?? null,
        actorRoles,
        input.modulo,
        input.accion,
        input.recursoTipo ?? null,
        input.recursoId !== undefined && input.recursoId !== null ? String(input.recursoId) : null,
        input.recursoResumen ?? null,
        input.resultado ?? 'ok',
        input.severidad ?? 'baja',
        contexto.ip ?? null,
        contexto.userAgent ?? null,
        JSON.stringify(input.detalle ?? {}),
        input.antes === undefined ? null : JSON.stringify(input.antes),
        input.despues === undefined ? null : JSON.stringify(input.despues)
    ]);
}
function registrarEventoAuditoriaSegura(input) {
    registrarEventoAuditoria(input).catch((error) => {
        logger_1.logger.warn({ err: error, input }, 'No se pudo registrar evento de auditoria en segundo plano');
    });
}
async function listarEventosAuditoria(filtro = {}) {
    try {
        const condiciones = [];
        const valores = [];
        if (filtro.desde) {
            valores.push(filtro.desde);
            condiciones.push(`fecha_hora >= $${valores.length}::timestamptz`);
        }
        if (filtro.hasta) {
            valores.push(filtro.hasta);
            condiciones.push(`fecha_hora <= $${valores.length}::timestamptz`);
        }
        if (filtro.actorUsuarioId) {
            valores.push(filtro.actorUsuarioId);
            condiciones.push(`actor_usuario_id = $${valores.length}::uuid`);
        }
        if (filtro.modulo) {
            valores.push(filtro.modulo);
            condiciones.push(`modulo = $${valores.length}`);
        }
        if (filtro.accion) {
            valores.push(filtro.accion);
            condiciones.push(`accion = $${valores.length}`);
        }
        if (filtro.resultado) {
            valores.push(filtro.resultado);
            condiciones.push(`resultado = $${valores.length}`);
        }
        if (filtro.severidad) {
            valores.push(filtro.severidad);
            condiciones.push(`severidad = $${valores.length}`);
        }
        if (filtro.recursoTipo) {
            valores.push(filtro.recursoTipo);
            condiciones.push(`recurso_tipo = $${valores.length}`);
        }
        if (filtro.q) {
            valores.push(`%${filtro.q}%`);
            const idx = valores.length;
            condiciones.push(`(
            COALESCE(modulo, '') ILIKE $${idx}
            OR COALESCE(accion, '') ILIKE $${idx}
            OR COALESCE(recurso_tipo, '') ILIKE $${idx}
            OR COALESCE(actor_email, '') ILIKE $${idx}
            OR COALESCE(actor_username, '') ILIKE $${idx}
            OR COALESCE(recurso_id, '') ILIKE $${idx}
            OR COALESCE(recurso_resumen, '') ILIKE $${idx}
            OR COALESCE(detalle::text, '') ILIKE $${idx}
        )`);
        }
        const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
        const limit = Math.min(Math.max(filtro.limit ?? 100, 1), 500);
        const offset = Math.max(filtro.offset ?? 0, 0);
        const { rows: totalRows } = await database_1.pool.query(`SELECT COUNT(*)::int AS total FROM auditoria_eventos ${where}`, valores);
        const valoresListado = [...valores, limit, offset];
        const { rows } = await database_1.pool.query(`SELECT
                ae.id,
                ae.fecha_hora,
                ae.request_id,
                ae.actor_usuario_id,
                NULLIF(trim(concat_ws(' ', u.nombres, u.apellidos)), '') AS actor_nombre_completo,
                ae.actor_email,
                ae.actor_username,
                ae.actor_roles,
                ae.modulo,
                ae.accion,
                ae.recurso_tipo,
                ae.recurso_id,
                ae.recurso_resumen,
                ae.resultado,
                ae.severidad,
                ae.ip,
                ae.user_agent,
                ae.detalle,
                ae.antes,
                ae.despues
            FROM auditoria_eventos ae
            LEFT JOIN usuarios u ON u.id = ae.actor_usuario_id
         ${where}
            ORDER BY ae.fecha_hora DESC, ae.id DESC
         LIMIT $${valores.length + 1}
         OFFSET $${valores.length + 2}`, valoresListado);
        const descripciones = await construirDescripcionesRecursos(rows);
        for (const row of rows) {
            aplicarResumenRecursoListado(row, descripciones);
        }
        return {
            total: totalRows[0]?.total ?? 0,
            datos: rows
        };
    }
    catch (error) {
        if (error?.code === '42P01') {
            throw new Error('La tabla auditoria_eventos no existe. Ejecuta la migración 20260316_add_auditoria_eventos.sql');
        }
        throw error;
    }
}
async function obtenerEventoAuditoriaPorId(id) {
    try {
        const { rows } = await database_1.pool.query(`SELECT
            ae.id,
            ae.fecha_hora,
            ae.request_id,
            ae.actor_usuario_id,
            NULLIF(trim(concat_ws(' ', u.nombres, u.apellidos)), '') AS actor_nombre_completo,
            ae.actor_email,
            ae.actor_username,
            ae.actor_roles,
            ae.modulo,
            ae.accion,
            ae.recurso_tipo,
            ae.recurso_id,
            ae.recurso_resumen,
            ae.resultado,
            ae.severidad,
            ae.ip,
            ae.user_agent,
            ae.detalle,
            ae.antes,
            ae.despues
         FROM auditoria_eventos ae
         LEFT JOIN usuarios u ON u.id = ae.actor_usuario_id
         WHERE ae.id = $1`, [id]);
        const ev = rows[0] ?? null;
        if (ev) {
            const descripciones = await construirDescripcionesRecursos([ev]);
            aplicarResumenRecursoListado(ev, descripciones);
        }
        return ev;
    }
    catch (error) {
        if (error?.code === '42P01') {
            throw new Error('La tabla auditoria_eventos no existe. Ejecuta la migración 20260316_add_auditoria_eventos.sql');
        }
        throw error;
    }
}
async function exportarEventosAuditoriaPdf(filtro = {}, meta) {
    const capExportacion = 500;
    const lim = Math.min(Math.max(filtro.limit ?? capExportacion, 1), capExportacion);
    const { total, datos } = await listarEventosAuditoria({
        ...filtro,
        limit: lim,
        offset: 0,
    });
    if (!datos.length) {
        throw new Error('No hay eventos de auditoría para exportar con los filtros actuales');
    }
    const filtrosResumen = [
        filtro.desde ? `desde=${filtro.desde}` : null,
        filtro.hasta ? `hasta=${filtro.hasta}` : null,
        filtro.modulo ? `modulo=${filtro.modulo}` : null,
        filtro.accion ? `accion=${filtro.accion}` : null,
        filtro.resultado ? `resultado=${filtro.resultado}` : null,
        filtro.q ? `q=${filtro.q}` : null,
    ].filter(Boolean).join(' | ') || 'sin filtros';
    const fileName = (0, reportes_utils_1.generarNombrePdfConTimestamp)({
        titulo: 'Reporte de Auditoría del Sistema',
    });
    const describirActor = (item) => {
        const nombre = item.actor_nombre_completo?.trim();
        const correo = item.actor_email?.trim();
        const usuario = item.actor_username?.trim();
        if (nombre && correo)
            return `${nombre} (${correo})`;
        if (nombre && usuario)
            return `${nombre} (${usuario})`;
        if (nombre)
            return nombre;
        if (correo)
            return correo;
        if (usuario)
            return usuario;
        return 'Sistema';
    };
    const describirRecurso = (item) => {
        const res = item.recurso_resumen?.trim();
        if (res)
            return res;
        const tipo = (item.recurso_tipo ?? '-').toLowerCase();
        const recursoId = item.recurso_id ? `#${item.recurso_id}` : '';
        if (tipo === 'sesion' && ['login', 'logout', 'refresh_token'].includes(item.accion)) {
            return `usuario ${recursoId}`.trim();
        }
        if (!item.recurso_id)
            return item.recurso_tipo ?? '-';
        return `${item.recurso_tipo ?? '-'} ${recursoId}`.trim();
    };
    const buffer = await (0, auditoria_pdf_1.generarAuditoriaEventosPdf)({
        titulo: 'REPORTE DE AUDITORÍA DEL SISTEMA',
        filtros: filtrosResumen,
        total,
        generadoEn: (0, pdf_kit_brand_1.formatGeneradoParaguay)(new Date()),
        capExportacion: lim,
        exportedBy: meta?.exportedBy,
        requestId: meta?.requestId,
        eventos: datos.map((item) => ({
            fecha_hora: item.fecha_hora,
            actor: describirActor(item),
            modulo: item.modulo,
            accion: item.accion,
            recurso: describirRecurso(item),
            resultado: item.resultado,
        })),
    });
    const urlDocumento = await (0, actas_storage_service_1.subirActaPdf)(buffer, fileName);
    return { url_documento: urlDocumento, total };
}
