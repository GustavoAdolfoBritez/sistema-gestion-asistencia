import type { Response } from 'express';

export function nombreArchivoPdfSeguro(fileName: string): string {
    const base = fileName.replace(/[^\w\u00C0-\u024F.\- ()]/g, '_').trim();
    return base.endsWith('.pdf') ? base : `${base || 'documento'}.pdf`;
}

/** Envía un PDF generado en memoria (sin persistir en Storage). */
export function enviarPdfBuffer(res: Response, buffer: Buffer, fileName: string, status = 200): void {
    const safe = nombreArchivoPdfSeguro(fileName);
    res.status(status);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safe)}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
}
