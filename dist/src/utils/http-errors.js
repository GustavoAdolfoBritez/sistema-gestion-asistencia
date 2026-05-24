"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendJsonError = sendJsonError;
function sendJsonError(res, status, body) {
    const payload = { mensaje: body.mensaje };
    if (body.codigo !== undefined) {
        payload.codigo = body.codigo;
    }
    if (body.detalles !== undefined) {
        payload.detalles = body.detalles;
    }
    return res.status(status).json(payload);
}
