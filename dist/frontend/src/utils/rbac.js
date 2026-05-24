"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.coerceRolesToStringArray = coerceRolesToStringArray;
exports.normalizeRol = normalizeRol;
exports.getAllowedViewsForUser = getAllowedViewsForUser;
exports.canAccessView = canAccessView;
exports.getHomeViewForUser = getHomeViewForUser;
exports.puedeEjecutarCierreMensual = puedeEjecutarCierreMensual;
exports.puedeAprobarJustificaciones = puedeAprobarJustificaciones;
exports.esGestionUnicaCarreraAlumnosListado = esGestionUnicaCarreraAlumnosListado;
/** Normaliza `roles` tal como puede llegar del login (array, string único u objeto tipo fila). */
function coerceRolesToStringArray(roles) {
    if (roles == null)
        return [];
    if (Array.isArray(roles)) {
        const out = [];
        for (const r of roles) {
            if (r == null)
                continue;
            if (typeof r === 'string') {
                const s = r.trim();
                if (s)
                    out.push(s);
                continue;
            }
            const s = String(r).trim();
            if (s)
                out.push(s);
        }
        return out;
    }
    if (typeof roles === 'string') {
        const s = roles.trim();
        return s ? [s] : [];
    }
    if (typeof roles === 'object') {
        return Object.values(roles)
            .map((v) => (typeof v === 'string' ? v.trim() : String(v ?? '').trim()))
            .filter((s) => s.length > 0);
    }
    return [];
}
/** Alineado con el backend (`auth.middleware`): evita que variantes con espacios/ZWJ fallen la comparación. */
function normalizeRol(value) {
    return String(value ?? '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\u2044|\u2215/g, '/')
        .normalize('NFKC')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}
const ALL_VIEWS = ['panel', 'importaciones', 'usuarios', 'academico', 'alumnos', 'asistencias', 'reportes', 'auditoria'];
/** Administrador General: sin módulo Asistencias (solo docentes). */
const ADMIN_VIEWS = ['panel', 'importaciones', 'usuarios', 'academico', 'alumnos', 'reportes', 'auditoria'];
const SECRETARIA_VIEWS = ['panel', 'academico', 'alumnos', 'importaciones', 'reportes', 'usuarios'];
const KNOWN_VIEWS = new Set(ALL_VIEWS);
function viewsFromServer(raw) {
    if (!Array.isArray(raw) || raw.length === 0)
        return undefined;
    const out = raw.filter((v) => typeof v === 'string' && KNOWN_VIEWS.has(v));
    return out.length > 0 ? out : undefined;
}
function allowedViewsFromRolesOnly(rolesRaw) {
    const roles = coerceRolesToStringArray(rolesRaw);
    const roleSet = new Set(roles.map(normalizeRol));
    if (roleSet.has('administrador general')) {
        return [...ADMIN_VIEWS];
    }
    if (roleSet.has('secretaria academica')) {
        return [...SECRETARIA_VIEWS];
    }
    if (roleSet.has('jefe de carrera')) {
        return ['panel', 'academico', 'alumnos', 'reportes'];
    }
    if (roleSet.has('coordinador de facultad') || roleSet.has('coordinador/a de facultad') || roleSet.has('coordinadora de facultad')) {
        return ['panel', 'academico', 'alumnos', 'reportes'];
    }
    if (roleSet.has('docente')) {
        return ['asistencias'];
    }
    return ['importaciones'];
}
function getAllowedViewsForUser(user) {
    const fromServer = viewsFromServer(user?.vistasPermitidas);
    if (fromServer) {
        return fromServer;
    }
    return allowedViewsFromRolesOnly(user?.roles);
}
function canAccessView(user, view) {
    return getAllowedViewsForUser(user).includes(view);
}
function getHomeViewForUser(user) {
    const allowed = getAllowedViewsForUser(user);
    if (user?.vistaInicio && allowed.includes(user.vistaInicio)) {
        return user.vistaInicio;
    }
    const preferredOrder = ['panel', 'asistencias', 'academico', 'importaciones', 'alumnos', 'reportes', 'auditoria', 'usuarios'];
    const preferred = preferredOrder.find((view) => allowed.includes(view));
    return preferred ?? allowed[0] ?? 'importaciones';
}
/** Alinear con `ROLES_APROBADORES_JUSTIFICACIONES` en el backend (sin Administrador General). */
/** CU-33: cierre mensual del módulo (no incluye Coordinador de Facultad). */
function puedeEjecutarCierreMensual(roles) {
    const set = new Set(coerceRolesToStringArray(roles).map(normalizeRol));
    return (set.has('administrador general') ||
        set.has('secretaria academica') ||
        set.has('jefe de carrera'));
}
function puedeAprobarJustificaciones(roles) {
    const set = new Set(coerceRolesToStringArray(roles).map(normalizeRol));
    return (set.has('jefe de carrera') ||
        set.has('secretaria academica') ||
        set.has('coordinador de facultad') ||
        set.has('coordinador/a de facultad') ||
        set.has('coordinadora de facultad'));
}
/**
 * Jefe de carrera sin rol de secretaría, administración global ni coordinación de facultad:
 * el buscador de alumnos ya se acota por alcance en servidor; no se muestran filtros de facultad/carrera.
 */
function esGestionUnicaCarreraAlumnosListado(roles) {
    const set = new Set(coerceRolesToStringArray(roles).map(normalizeRol));
    if (!set.has('jefe de carrera'))
        return false;
    if (set.has('administrador general') || set.has('secretaria academica'))
        return false;
    if (set.has('coordinador de facultad') ||
        set.has('coordinador/a de facultad') ||
        set.has('coordinadora de facultad')) {
        return false;
    }
    return true;
}
