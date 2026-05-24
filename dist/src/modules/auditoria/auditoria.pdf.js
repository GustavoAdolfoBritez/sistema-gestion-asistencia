"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarAuditoriaEventosPdf = generarAuditoriaEventosPdf;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const pdf_assets_1 = require("../../utils/pdf-assets");
const pdf_institutional_header_planilla_1 = require("../../utils/pdf-institutional-header-planilla");
const pdf_kit_brand_1 = require("../../utils/pdf-kit-brand");
const auditoria_accion_label_1 = require("../../utils/auditoria-accion-label");
const pdf_report_cover_1 = require("../../utils/pdf-report-cover");
const TABLE_HEADER_ROW_HEIGHT = 20;
const TABLE_ROW_MIN_HEIGHT = 20;
/**
 * Proporciones como AuditoriaPage: Fecha/Actor/Módulo/Resultado compactos;
 * Acción y Recurso ocupan el resto (colgroup w-[1%] … auto auto … w-[1%]).
 */
const CONTENT_FIT_DEFS = [
    { key: 'fecha_hora', label: 'Fecha', minWidth: 86, maxWidth: 98, shrinkResistance: 2 },
    { key: 'actor', label: 'Actor', minWidth: 115, maxWidth: 240, shrinkResistance: 7 },
    { key: 'modulo', label: 'Módulo', minWidth: 82, maxWidth: 96, shrinkResistance: 3 },
    { key: 'accion', label: 'Acción', minWidth: 130, maxWidth: 400, shrinkResistance: 9 },
    { key: 'recurso', label: 'Recurso', minWidth: 150, maxWidth: 420, shrinkResistance: 9 },
    { key: 'resultado', label: 'Resultado', minWidth: 58, maxWidth: 72, shrinkResistance: 2 },
];
/** Una sola línea con recorte; Actor y Acción/Recurso permiten salto de línea. */
const ELLIPSIS_COLUMN_KEYS = new Set(['fecha_hora', 'modulo', 'resultado']);
/** Convierte el resumen `clave=valor | …` del servicio en texto legible para el PDF. */
function humanizarFiltrosAuditoria(filtros) {
    if (!filtros || filtros === 'sin filtros')
        return filtros;
    return filtros
        .split(' | ')
        .map((part) => {
        const eq = part.indexOf('=');
        if (eq === -1)
            return part;
        const key = part.slice(0, eq).trim();
        const raw = part.slice(eq + 1).trim();
        if (key === 'desde' || key === 'hasta') {
            const d = new Date(raw);
            if (!Number.isNaN(d.getTime())) {
                const etiqueta = key === 'desde' ? 'Desde' : 'Hasta';
                const txt = (0, pdf_kit_brand_1.formatFechaHoraCompactaParaguay)(d);
                return `${etiqueta}: ${txt}`;
            }
        }
        const titulo = {
            modulo: 'Módulo',
            accion: 'Acción',
            resultado: 'Resultado',
            q: 'Búsqueda',
        }[key] ?? `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        return `${titulo}: ${raw}`;
    })
        .join('\n');
}
function eventoToRecord(item) {
    return {
        fecha_hora: (0, pdf_kit_brand_1.formatFechaHoraCompactaParaguay)(item.fecha_hora),
        actor: item.actor,
        modulo: item.modulo,
        accion: (0, auditoria_accion_label_1.etiquetaAccionAuditoria)(item.accion),
        recurso: item.recurso,
        resultado: item.resultado.toUpperCase(),
    };
}
async function generarAuditoriaEventosPdf(data, fileName) {
    fs_1.default.mkdirSync(pdf_assets_1.ACTAS_OUTPUT_DIR, { recursive: true });
    const filePath = path_1.default.join(pdf_assets_1.ACTAS_OUTPUT_DIR, fileName);
    await new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({
            size: 'A4',
            layout: 'landscape',
            margin: 0,
            bufferPages: true,
            info: {
                Title: data.titulo,
                Author: 'Sistema de control de asistencia',
            },
        });
        const stream = fs_1.default.createWriteStream(filePath);
        stream.on('finish', resolve);
        stream.on('error', reject);
        doc.on('error', reject);
        doc.pipe(stream);
        const margin = pdf_kit_brand_1.PDF_BRAND_MARGIN;
        const pageW = doc.page.width;
        const pageH = doc.page.height;
        const contentW = pageW - margin * 2;
        const bottomLimit = pageH - margin - pdf_kit_brand_1.PDF_FOOTER_RESERVED;
        const inst = (0, pdf_institutional_header_planilla_1.drawInstitutionalHeaderPlanillaLegal)(doc, pageW, pdf_institutional_header_planilla_1.PDF_INSTITUTIONAL_HEADER_TOP_REPORTS);
        let y = (0, pdf_report_cover_1.drawOperativoPdfCoverHeader)(doc, margin, contentW, inst.rowFacultadY + 4, {
            titulo: data.titulo,
            generadoEn: data.generadoEn,
        });
        const filasEnPdf = data.eventos.length;
        const alcanceExporte = filasEnPdf === data.total
            ? `${data.total} eventos; todos incluidos en este PDF (máx. ${data.capExportacion} filas por archivo).`
            : `${data.total} eventos que coinciden con el filtro; en este PDF se listan ${filasEnPdf} (máx. ${data.capExportacion} filas por archivo).`;
        const filtrosTxt = humanizarFiltrosAuditoria(data.filtros);
        y = (0, pdf_report_cover_1.drawTwoColumnMetaBlack)(doc, margin, y, contentW, { label: 'Filtros aplicados', value: filtrosTxt }, { label: 'Alcance del exporte', value: alcanceExporte });
        const tableRows = data.eventos.map(eventoToRecord);
        const columns = (0, pdf_kit_brand_1.buildContentFitTableColumns)(doc, CONTENT_FIT_DEFS, tableRows, contentW);
        const wrappedOpts = { ellipsisColumnKeys: ELLIPSIS_COLUMN_KEYS };
        const drawTableHeaderAt = (yy) => (0, pdf_kit_brand_1.drawModernTableHeader)(doc, margin, yy, columns, TABLE_HEADER_ROW_HEIGHT, 'print');
        y += 4;
        y = drawTableHeaderAt(y);
        let idx = 0;
        for (const row of tableRows) {
            const rowH = (0, pdf_kit_brand_1.measureModernTableRowWrappedHeight)(doc, columns, row, TABLE_ROW_MIN_HEIGHT, wrappedOpts);
            if (y + rowH > bottomLimit) {
                doc.addPage();
                y = margin;
                y = drawTableHeaderAt(y);
            }
            (0, pdf_kit_brand_1.drawModernTableRowWrapped)(doc, margin, y, columns, row, rowH, idx % 2 === 1, undefined, wrappedOpts);
            y += rowH;
            idx += 1;
        }
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(range.start + i);
            (0, pdf_kit_brand_1.drawFooter)(doc, margin, pageH - margin - 8, contentW, {
                pageIndex: i,
                pageTotal: range.count,
                exportedBy: data.exportedBy,
                requestId: data.requestId,
            });
        }
        doc.end();
    });
    return filePath;
}
