"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarPdfAusentismoFacultadCarrera = generarPdfAusentismoFacultadCarrera;
const pdf_institutional_header_planilla_1 = require("../../utils/pdf-institutional-header-planilla");
const pdf_buffer_1 = require("../../utils/pdf-buffer");
const pdf_kit_brand_1 = require("../../utils/pdf-kit-brand");
const pdf_report_cover_1 = require("../../utils/pdf-report-cover");
const TABLE_HEADER_ROW_HEIGHT = 22;
const TABLE_ROW_MIN_HEIGHT = 18;
function formatResumenAusentismoLinea(resumen) {
    const partes = [
        `${resumen.totalCarreras} carrera${resumen.totalCarreras === 1 ? '' : 's'}`,
        `${resumen.totalCursos} curso${resumen.totalCursos === 1 ? '' : 's'}`,
        `${resumen.promedioAusentismo.toFixed(1)} % de ausentismo (promedio)`,
        `${resumen.totalFaltas} falta${resumen.totalFaltas === 1 ? '' : 's'} totales`,
    ];
    return partes.join('; ');
}
/** Mismas columnas que la tabla en ReportesPage; mínimos evitan encabezados/celdas superpuestos. */
const CONTENT_FIT_DEFS = [
    { key: 'facultad', label: 'Facultad', minWidth: 140, maxWidth: 300, shrinkResistance: 9 },
    { key: 'carrera', label: 'Carrera', minWidth: 120, maxWidth: 240, shrinkResistance: 8 },
    { key: 'totalCursos', label: 'Cursos', align: 'center', minWidth: 46, maxWidth: 54, shrinkResistance: 2 },
    { key: 'promedioAusentismo', label: '% Ausentismo', align: 'center', minWidth: 80, maxWidth: 92, shrinkResistance: 4 },
    { key: 'promedioAsistencia', label: '% Asistencia', align: 'center', minWidth: 80, maxWidth: 92, shrinkResistance: 4 },
    { key: 'nivel', label: 'Nivel', align: 'center', minWidth: 84, maxWidth: 108, shrinkResistance: 5 },
];
const ELLIPSIS_COLUMN_KEYS = new Set([
    'totalCursos',
    'promedioAusentismo',
    'promedioAsistencia',
    'nivel',
]);
function filaToRecord(row) {
    return {
        facultad: row.facultad,
        carrera: row.carrera,
        totalCursos: String(row.totalCursos),
        promedioAusentismo: `${row.promedioAusentismo.toFixed(1)}%`,
        promedioAsistencia: `${row.promedioAsistencia.toFixed(1)}%`,
        nivel: row.nivel,
    };
}
async function generarPdfAusentismoFacultadCarrera(data) {
    return (0, pdf_buffer_1.renderPdfDocumentToBuffer)((doc) => {
        const margin = pdf_kit_brand_1.PDF_BRAND_MARGIN;
        const pageW = doc.page.width;
        const pageH = doc.page.height;
        const contentW = pageW - margin * 2;
        const bottomLimit = pageH - margin - pdf_kit_brand_1.PDF_FOOTER_RESERVED;
        const inst = (0, pdf_institutional_header_planilla_1.drawInstitutionalHeaderPlanillaLegal)(doc, pageW, pdf_institutional_header_planilla_1.PDF_INSTITUTIONAL_HEADER_TOP_REPORTS);
        let y = (0, pdf_report_cover_1.drawOperativoPdfCoverHeader)(doc, margin, contentW, inst.rowFacultadY + 4, {
            titulo: 'ESTADÍSTICAS DE AUSENTISMO POR FACULTAD / CARRERA',
            generadoEn: (0, pdf_kit_brand_1.formatGeneradoParaguay)(new Date()),
        });
        y = (0, pdf_report_cover_1.drawInlineMetaBlack)(doc, margin, y, contentW, 'Periodo', data.periodo);
        y = (0, pdf_report_cover_1.drawInlineMetaBlack)(doc, margin, y, contentW, 'Alcance', data.alcance || '—');
        y = (0, pdf_report_cover_1.drawInlineMetaBlack)(doc, margin, y, contentW, 'Resumen', formatResumenAusentismoLinea(data.resumen));
        y = (0, pdf_kit_brand_1.drawSectionTitle)(doc, margin, y, contentW, 'Por facultad y carrera');
        const tableRows = data.filas.map(filaToRecord);
        const columns = (0, pdf_kit_brand_1.buildContentFitTableColumns)(doc, CONTENT_FIT_DEFS, tableRows, contentW);
        const wrappedOpts = { ellipsisColumnKeys: ELLIPSIS_COLUMN_KEYS };
        const drawTableHeaderAt = (yy) => (0, pdf_kit_brand_1.drawModernTableHeader)(doc, margin, yy, columns, TABLE_HEADER_ROW_HEIGHT, 'print');
        y = drawTableHeaderAt(y);
        let idx = 0;
        for (const rec of tableRows) {
            const rowH = (0, pdf_kit_brand_1.measureModernTableRowWrappedHeight)(doc, columns, rec, TABLE_ROW_MIN_HEIGHT, wrappedOpts);
            if (y + rowH > bottomLimit) {
                doc.addPage();
                y = margin;
                y = drawTableHeaderAt(y);
            }
            (0, pdf_kit_brand_1.drawModernTableRowWrapped)(doc, margin, y, columns, rec, rowH, idx % 2 === 1, undefined, wrappedOpts);
            y += rowH;
            idx += 1;
        }
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(range.start + i);
            (0, pdf_kit_brand_1.drawFooter)(doc, margin, pageH - margin - 8, contentW, {
                pageIndex: i,
                pageTotal: range.count,
            });
        }
    }, {
        size: 'A4',
        layout: 'landscape',
        margin: 0,
        bufferPages: true,
        info: {
            Title: `Ausentismo por facultad/carrera ${data.periodo}`,
            Author: 'Sistema de control de asistencia',
        },
    });
}
