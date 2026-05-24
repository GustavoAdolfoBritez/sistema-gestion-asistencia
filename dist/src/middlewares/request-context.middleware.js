"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjuntarRequestContext = adjuntarRequestContext;
const crypto_1 = require("crypto");
function obtenerPrimerValor(value) {
    if (!value) {
        return undefined;
    }
    const texto = Array.isArray(value) ? value[0] : value;
    const [primero] = texto.split(',');
    const limpio = primero?.trim();
    return limpio || undefined;
}
function adjuntarRequestContext(req, res, next) {
    const requestId = obtenerPrimerValor(req.headers['x-request-id']) ?? (0, crypto_1.randomUUID)();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
}
