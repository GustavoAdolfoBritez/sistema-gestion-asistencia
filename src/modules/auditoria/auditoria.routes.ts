import { Router } from 'express';
import { autenticarConPoliticaAlcance, autorizarRoles } from '../../middlewares/auth.middleware';
import { ROLES_ADMIN_O_ACADEMICOS } from '../../utils/rbac';
import {
    listarEventosAuditoria,
    obtenerEventoAuditoriaPorId,
    exportarEventosAuditoriaPdf,
    construirContextoAuditoria,
    registrarEventoAuditoriaSegura
} from './auditoria.service';

const router = Router();

router.use('/auditoria', ...autenticarConPoliticaAlcance, autorizarRoles(...ROLES_ADMIN_O_ACADEMICOS));

router.get('/auditoria/eventos', async (req, res, next) => {
    try {
        const { desde, hasta, actorUsuarioId, modulo, accion, resultado, severidad, recursoTipo, q, limit, offset } = req.query;

        const data = await listarEventosAuditoria({
            desde: desde ? String(desde) : undefined,
            hasta: hasta ? String(hasta) : undefined,
            actorUsuarioId: actorUsuarioId ? String(actorUsuarioId) : undefined,
            modulo: modulo ? String(modulo) : undefined,
            accion: accion ? String(accion) : undefined,
            resultado: resultado ? (String(resultado) as 'ok' | 'error') : undefined,
            severidad: severidad ? (String(severidad) as 'baja' | 'media' | 'alta') : undefined,
            recursoTipo: recursoTipo ? String(recursoTipo) : undefined,
            q: q ? String(q) : undefined,
            limit: limit ? Number(limit) : undefined,
            offset: offset ? Number(offset) : undefined
        });

        res.json(data);
    } catch (error) {
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

        const evento = await obtenerEventoAuditoriaPorId(id);
        if (!evento) {
            return res.status(404).json({ mensaje: 'Evento no encontrado' });
        }

        res.json(evento);
    } catch (error) {
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
        const contextoAuditoria = construirContextoAuditoria(req);
        const { desde, hasta, actorUsuarioId, modulo, accion, resultado, severidad, recursoTipo, q, limit } = req.body ?? {};

        const exportacion = await exportarEventosAuditoriaPdf(
            {
                desde: desde ? String(desde) : undefined,
                hasta: hasta ? String(hasta) : undefined,
                actorUsuarioId: actorUsuarioId ? String(actorUsuarioId) : undefined,
                modulo: modulo ? String(modulo) : undefined,
                accion: accion ? String(accion) : undefined,
                resultado: resultado ? (String(resultado) as 'ok' | 'error') : undefined,
                severidad: severidad ? (String(severidad) as 'baja' | 'media' | 'alta') : undefined,
                recursoTipo: recursoTipo ? String(recursoTipo) : undefined,
                q: q ? String(q) : undefined,
                limit: limit ? Number(limit) : undefined,
                offset: 0,
            },
            {
                exportedBy: contextoAuditoria.actorEmail ?? contextoAuditoria.actorUsuarioId,
                requestId: contextoAuditoria.requestId,
            }
        );

        await registrarEventoAuditoriaSegura({
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
    } catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('auditoria_eventos no existe')) {
                return res.status(503).json({ mensaje: error.message });
            }
            return res.status(400).json({ mensaje: error.message });
        }
        next(error);
    }
});

export default router;
