"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const rbac_1 = require("../../utils/rbac");
const auditoria_service_1 = require("./auditoria.service");
const pdf_response_1 = require("../../utils/pdf-response");
const router = (0, express_1.Router)();
router.use('/auditoria', ...auth_middleware_1.autenticarConPoliticaAlcance, (0, auth_middleware_1.autorizarRoles)(...rbac_1.ROLES_ADMIN_O_ACADEMICOS));
router.get('/auditoria/eventos', async (req, res, next) => {
    try {
        const { desde, hasta, actorUsuarioId, modulo, accion, resultado, severidad, recursoTipo, q, limit, offset, page } = req.query;
        const limitNum = limit ? Number(limit) : undefined;
        const pageNum = page ? Number(page) : undefined;
        let offsetNum = offset ? Number(offset) : undefined;
        if (pageNum && limitNum && Number.isFinite(pageNum) && Number.isFinite(limitNum)) {
            offsetNum = Math.max(0, (Math.max(1, Math.trunc(pageNum)) - 1) * Math.trunc(limitNum));
        }
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
            limit: limitNum,
            offset: offsetNum
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
        const usuarioId = contextoAuditoria.actorUsuarioId;
        if (!usuarioId) {
            return res.status(401).json({ mensaje: 'No autenticado' });
        }
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
        }, usuarioId);
        await (0, auditoria_service_1.registrarEventoAuditoriaSegura)({
            modulo: 'auditoria',
            accion: 'exportar_auditoria_pdf',
            recursoTipo: 'reporte_auditoria',
            detalle: {
                filtros: { desde, hasta, modulo, accion, resultado, q },
                total: exportacion.total
            },
            despues: { actaId: exportacion.acta.id, url_documento: exportacion.acta.url_documento },
            contexto: contextoAuditoria
        });
        res.setHeader('X-Acta-Id', String(exportacion.acta.id));
        (0, pdf_response_1.enviarPdfBuffer)(res, exportacion.buffer, exportacion.fileName, 201);
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
