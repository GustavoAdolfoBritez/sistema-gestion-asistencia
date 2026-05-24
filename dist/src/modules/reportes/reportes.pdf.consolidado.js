"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarConsolidadoRiesgoPdf = generarConsolidadoRiesgoPdf;
const pdf_institutional_header_planilla_1 = require("../../utils/pdf-institutional-header-planilla");
const pdf_buffer_1 = require("../../utils/pdf-buffer");
const pdf_kit_brand_1 = require("../../utils/pdf-kit-brand");
const pdf_report_cover_1 = require("../../utils/pdf-report-cover");
const TABLE_HEADER_ROW_HEIGHT = 20;
const TABLE_ROW_MIN_HEIGHT = 18;
/** Mismas columnas y proporciones que la tabla en ReportesPage (sin columna Estado). */
const COLUMN_LAYOUT = [
    { key: 'periodo', label: 'Periodo', weight: 7 },
    { key: 'facultad', label: 'Facultad', weight: 20 },
    { key: 'carrera', label: 'Carrera', weight: 15 },
    { key: 'semestre', label: 'Semestre', align: 'center', weight: 7 },
    { key: 'materia', label: 'Materia', weight: 12 },
    { key: 'alumno', label: 'Alumno', weight: 15 },
    { key: 'documento', label: 'CI', weight: 10 },
    { key: 'porcentajeAsistencia', label: '% Asist.', align: 'center', weight: 8 },
    { key: 'faltasAcumuladas', label: 'Faltas', align: 'center', weight: 6 },
];
const WEIGHT_TOTAL = COLUMN_LAYOUT.reduce((s, c) => s + c.weight, 0);
function buildColumnsLikeReportesPage(contentW) {
    const widths = COLUMN_LAYOUT.map((col) => Math.max(28, Math.round((contentW * col.weight) / WEIGHT_TOTAL)));
    let delta = contentW - widths.reduce((a, b) => a + b, 0);
    let i = 0;
    const growOrder = [1, 5, 2, 4, 0, 6, 3, 7, 8]; // facultad, alumno, carrera, materia…
    while (delta !== 0 && i < 500) {
        const idx = growOrder[i % growOrder.length];
        widths[idx] += delta > 0 ? 1 : -1;
        delta += delta > 0 ? -1 : 1;
        i += 1;
    }
    return COLUMN_LAYOUT.map((col, idx) => ({
        key: col.key,
        label: col.label,
        width: widths[idx],
        align: col.align,
    }));
}
function filaToRecord(row) {
    return {
        periodo: row.periodo,
        facultad: row.facultad,
        carrera: row.carrera,
        semestre: row.semestre > 0 ? `${row.semestre}°` : '—',
        materia: row.materia,
        alumno: row.alumno,
        documento: row.documento || '—',
        porcentajeAsistencia: `${row.porcentajeAsistencia.toFixed(1)}%`,
        faltasAcumuladas: String(row.faltasAcumuladas),
    };
}
async function generarConsolidadoRiesgoPdf(data) {
    return (0, pdf_buffer_1.renderPdfDocumentToBuffer)((doc) => {
        const margin = pdf_kit_brand_1.PDF_BRAND_MARGIN;
        const pageW = doc.page.width;
        const pageH = doc.page.height;
        const contentW = pageW - margin * 2;
        const bottomLimit = pageH - margin - pdf_kit_brand_1.PDF_FOOTER_RESERVED;
        const inst = (0, pdf_institutional_header_planilla_1.drawInstitutionalHeaderPlanillaLegal)(doc, pageW, pdf_institutional_header_planilla_1.PDF_INSTITUTIONAL_HEADER_TOP_REPORTS);
        let y = (0, pdf_report_cover_1.drawOperativoPdfCoverHeader)(doc, margin, contentW, inst.rowFacultadY + 4, {
            titulo: 'REPORTE CONSOLIDADO DE INHABILITADOS',
            generadoEn: (0, pdf_kit_brand_1.formatGeneradoParaguay)(new Date()),
        });
        const totalesTxt = `Total inhabilitados: ${data.totalInhabilitados}`;
        y = (0, pdf_report_cover_1.drawInlineMetaBlack)(doc, margin, y, contentW, 'Periodo', data.periodo);
        y = (0, pdf_report_cover_1.drawInlineMetaBlack)(doc, margin, y, contentW, 'Totales', totalesTxt);
        y = (0, pdf_kit_brand_1.drawSectionTitle)(doc, margin, y, contentW, 'Detalle');
        const columns = buildColumnsLikeReportesPage(contentW);
        const tableRows = data.filas.map(filaToRecord);
        const drawTableHeaderAt = (yy) => (0, pdf_kit_brand_1.drawModernTableHeader)(doc, margin, yy, columns, TABLE_HEADER_ROW_HEIGHT, 'print');
        y = drawTableHeaderAt(y);
        let idx = 0;
        for (const rec of tableRows) {
            const rowH = (0, pdf_kit_brand_1.measureModernTableRowWrappedHeight)(doc, columns, rec, TABLE_ROW_MIN_HEIGHT);
            if (y + rowH > bottomLimit) {
                doc.addPage();
                y = margin;
                y = drawTableHeaderAt(y);
            }
            (0, pdf_kit_brand_1.drawModernTableRowWrapped)(doc, margin, y, columns, rec, rowH, idx % 2 === 1);
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
            Title: `Consolidado inhabilitados ${data.periodo}`,
            Author: 'Sistema de control de asistencia',
        },
    });
}
