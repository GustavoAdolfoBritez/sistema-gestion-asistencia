"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nombreArchivoPdfSeguro = nombreArchivoPdfSeguro;
exports.enviarPdfBuffer = enviarPdfBuffer;
function nombreArchivoPdfSeguro(fileName) {
    const base = fileName.replace(/[^\w\u00C0-\u024F.\- ()]/g, '_').trim();
    return base.endsWith('.pdf') ? base : `${base || 'documento'}.pdf`;
}
/** Envía un PDF generado en memoria (sin persistir en Storage). */
function enviarPdfBuffer(res, buffer, fileName, status = 200) {
    const safe = nombreArchivoPdfSeguro(fileName);
    res.status(status);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safe)}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
}
