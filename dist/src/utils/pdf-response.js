"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nombreArchivoPdfSeguro = nombreArchivoPdfSeguro;
exports.enviarPdfBuffer = enviarPdfBuffer;
function nombreArchivoPdfSeguro(fileName) {
    const base = fileName.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
    return base.endsWith('.pdf') ? base : `${base || 'documento'}.pdf`;
}
function contentDispositionInline(fileName) {
    const safe = nombreArchivoPdfSeguro(fileName);
    const asciiFallback = safe.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
    return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
/** Envía un PDF generado en memoria (sin persistir en Storage). */
function enviarPdfBuffer(res, buffer, fileName, status = 200) {
    const safe = nombreArchivoPdfSeguro(fileName);
    res.status(status);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDispositionInline(safe));
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
}
