"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const rbac_1 = require("../../utils/rbac");
const auditoria_service_1 = require("./auditoria.service");
const router = (0, express_1.Router)();
router.use('/auditoria', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ADMIN_O_ACADEMICOS));
router.get('/auditoria/eventos', async (req, res, next) => {
    try {
        const { desde, hasta, actorUsuarioId, modulo, accion, resultado, severidad, recursoTipo, q, limit, offset } = req.query;
        const data = await (0, auditoria_service_1.listarEventosAuditoria)({
            desde: desde ? String(desde) : undefined,
            hasta: hasta ? String(hasta) : undefined,
            actorUsuarioId: actorUsuarioId ? String(actorUsuarioId) : undefined,
            modulo: modulo ? String(modulo) : undefined,
            accion: accion ? String(accion) : undefined,
            resultado: resultado ? String(resultado) : undefined,
            severidad: severidad ? String(severidad) : undefined,
            recursoTipo: recursoTipo ? String(recursoTipo) : undefined,
            q: q ? String(q) : undefined,
            limit: limit ? Number(limit) : undefined,
            offset: offset ? Number(offset) : undefined
        });
        res.json(data);
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('auditoria_eventos no existe')) {
                return res.status(503).json({ mensaje: error.message });
            }
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.get('/auditoria/eventos/:id', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!id || Number.isNaN(id)) {
            return res.status(400).json({ mensaje: 'El identificador no es válido' });
        }
        const evento = await (0, auditoria_service_1.obtenerEventoAuditoriaPorId)(id);
        if (!evento) {
            return res.status(404).json({ mensaje: 'Evento no encontrado' });
        }
        res.json(evento);
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('auditoria_eventos no existe')) {
                return res.status(503).json({ mensaje: error.message });
            }
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
router.post('/auditoria/eventos/pdf', async (req, res, next) => {
    try {
        const contextoAuditoria = (0, auditoria_service_1.construirContextoAuditoria)(req);
        const { desde, hasta, actorUsuarioId, modulo, accion, resultado, severidad, recursoTipo, q, limit } = req.body ?? {};
        const exportacion = await (0, auditoria_service_1.exportarEventosAuditoriaPdf)({
            desde: desde ? String(desde) : undefined,
            hasta: hasta ? String(hasta) : undefined,
            actorUsuarioId: actorUsuarioId ? String(actorUsuarioId) : undefined,
            modulo: modulo ? String(modulo) : undefined,
            accion: accion ? String(accion) : undefined,
            resultado: resultado ? String(resultado) : undefined,
            severidad: severidad ? String(severidad) : undefined,
            recursoTipo: recursoTipo ? String(recursoTipo) : undefined,
            q: q ? String(q) : undefined,
            limit: limit ? Number(limit) : undefined,
            offset: 0,
        }, {
            exportedBy: contextoAuditoria.actorEmail ?? contextoAuditoria.actorUsuarioId,
            requestId: contextoAuditoria.requestId,
        });
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'auditoria',
            accion: 'exportar_auditoria_pdf',
            recursoTipo: 'reporte_auditoria',
            detalle: {
                filtros: { desde, hasta, modulo, accion, resultado, q },
                total: exportacion.total
            },
            despues: exportacion,
            contexto: contextoAuditoria
        });
        res.status(201).json(exportacion);
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('auditoria_eventos no existe')) {
                return res.status(503).json({ mensaje: error.message });
            }
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});
exports.default = router;
