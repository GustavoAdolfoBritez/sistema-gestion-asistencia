"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLANILLA_TABLE_STATIC_WIDTH = exports.PDF_INSTITUTIONAL_HEADER_TOP_REPORTS = exports.PDF_INSTITUTIONAL_HEADER_TOP = void 0;
exports.planillaTableContentX = planillaTableContentX;
exports.drawInstitutionalHeaderPlanillaLegal = drawInstitutionalHeaderPlanillaLegal;
const fs_1 = __importDefault(require("fs"));
const pdf_assets_1 = require("./pdf-assets");
/**
 * Encabezado institucional alineado al de la planilla PDF legal (banner, lema, LEY 3.688/08, misión).
 * Centralizado para reutilizar en informes. Planilla legal e informes comparten el mismo margen superior
 * (`PDF_INSTITUTIONAL_HEADER_TOP`); `PDF_INSTITUTIONAL_HEADER_TOP_REPORTS` es alias para no romper imports.
 */
/**
 * Distancia desde el borde superior de la página al inicio del bloque institucional (logo).
 * Misma altura en planilla legal y en el resto de PDFs del sistema.
 */
exports.PDF_INSTITUTIONAL_HEADER_TOP = 24;
/** Mismo valor que `PDF_INSTITUTIONAL_HEADER_TOP` (imports existentes en informes). */
exports.PDF_INSTITUTIONAL_HEADER_TOP_REPORTS = exports.PDF_INSTITUTIONAL_HEADER_TOP;
/** Misma proporción que en planilla legal (331×59). */
const BANNER_W = 150;
const BANNER_H = Math.round((BANNER_W * 59) / 331);
/** Ancho del bloque de misión alineado a la tabla de la planilla (594 pt). */
exports.PLANILLA_TABLE_STATIC_WIDTH = 594;
function planillaTableContentX(pageWidth) {
    return Math.round((pageWidth - exports.PLANILLA_TABLE_STATIC_WIDTH) / 2);
}
/**
 * Dibuja logo centrado, lema, ley y misión como en la planilla legal.
 * @param marginTop distancia desde el borde superior de la página (p. ej. `PDF_INSTITUTIONAL_HEADER_TOP`).
 */
function drawInstitutionalHeaderPlanillaLegal(doc, pageWidth, marginTop) {
    const bannerX = pageWidth / 2 - BANNER_W / 2;
    const bannerY = marginTop;
    if (fs_1.default.existsSync(pdf_assets_1.PDF_LOGO_PATH)) {
        doc.image(pdf_assets_1.PDF_LOGO_PATH, bannerX, bannerY, { width: BANNER_W, height: BANNER_H });
    }
    else {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
            .text('UNIVERSIDAD NIHON GAKKO', 0, bannerY + 12, { width: pageWidth, align: 'center' });
    }
    const afterBanner = bannerY + BANNER_H + 4;
    doc.font('Helvetica-BoldOblique').fontSize(10).fillColor('#000')
        .text('"ESFUERZO Y DISCIPLINA PARA EL ÉXITO"', 0, afterBanner, { width: pageWidth, align: 'center' });
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#000')
        .text('LEY 3.688/08', 0, afterBanner + 14, { width: pageWidth, align: 'center' });
    const misionY = afterBanner + 27;
    const tableX = planillaTableContentX(pageWidth);
    const tableW = exports.PLANILLA_TABLE_STATIC_WIDTH;
    doc.font('Helvetica-Oblique').fontSize(6.2).fillColor('#000')
        .text('Mision : Es una instituciòn educativa de gestion privada, con capital humano altamente calificado y comprometida en ofrecer una educación integral de calidad, en todos los niveles educativos, inspirada en la cultura propia y universal, basada en los valores humanos, la investigación científica, el servicio a la comunidad, el desarrollo artístico y cultural, para la formación de ciudadanos socialmente responsables.', tableX, misionY, { width: tableW, align: 'left', lineGap: 0 });
    const rowFacultadY = misionY + 16;
    return { rowFacultadY, tableX, tableW };
}
