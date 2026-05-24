"use strict";
/**
 * Portada y bloques meta compartidos por informes operativos (auditoría, informe alumno, consolidado, etc.).
 * No usar en la planilla legal (`reportes.pdf.ts`).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawOperativoPdfCoverHeader = drawOperativoPdfCoverHeader;
exports.drawStackedMetaBlack = drawStackedMetaBlack;
exports.textoMetaSinComas = textoMetaSinComas;
exports.drawInlineMetaBlack = drawInlineMetaBlack;
exports.drawTwoColumnMetaBlack = drawTwoColumnMetaBlack;
exports.drawReportCoverCentered = drawReportCoverCentered;
exports.drawTwoColumnMeta44Split = drawTwoColumnMeta44Split;
const pdf_kit_brand_1 = require("./pdf-kit-brand");
const SUBTITLE = 'Sistema de control de asistencia académica';
/** Título + subtítulo + generado en negro/negrita + línea de acento (mismo criterio que auditoría). */
function drawOperativoPdfCoverHeader(doc, marginX, contentWidth, startY, opts) {
    const subtitulo = opts.subtitulo ?? SUBTITLE;
    let y = startY;
    doc.fillColor(pdf_kit_brand_1.PDF_BRAND.text).font('Helvetica-Bold').fontSize(16);
    doc.text(opts.titulo, marginX, y, { width: contentWidth, align: 'center' });
    y += 18;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(pdf_kit_brand_1.PDF_BRAND.text);
    doc.text(subtitulo, marginX, y, { width: contentWidth, align: 'center' });
    y += 12;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(pdf_kit_brand_1.PDF_BRAND.text);
    doc.text(`Generado: ${opts.generadoEn}`, marginX, y, { width: contentWidth, align: 'center' });
    y += 12;
    doc
        .moveTo(marginX, y)
        .lineTo(marginX + contentWidth, y)
        .strokeColor(pdf_kit_brand_1.PDF_BRAND.accent)
        .lineWidth(1)
        .stroke();
    y += 7;
    return y;
}
/** Etiqueta y valor en negro (meta de informes operativos). */
function drawStackedMetaBlack(doc, marginX, startY, colWidth, label, value) {
    const lineGap = 0.5;
    const indent = 10;
    const valueW = Math.max(40, colWidth - indent);
    let y = startY;
    const labelText = `${label}:`;
    const d = doc;
    doc.fillColor(pdf_kit_brand_1.PDF_BRAND.text).font('Helvetica-Bold').fontSize(9);
    const hLabel = d.heightOfString(labelText, { width: colWidth, lineGap });
    doc.text(labelText, marginX, y, { width: colWidth, lineGap });
    const rawVal = String(value ?? '').trim() || '—';
    doc.fillColor(pdf_kit_brand_1.PDF_BRAND.text).font('Helvetica').fontSize(9);
    const hVal = d.heightOfString(rawVal, { width: valueW, lineGap });
    doc.text(rawVal, marginX + indent, y + hLabel + 2, { width: valueW, lineGap });
    return y + hLabel + 2 + hVal + 8;
}
/** Nombre u otro texto para PDF operativo: sin comas, espacios normalizados. */
function textoMetaSinComas(text) {
    return String(text ?? '')
        .replace(/,/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Una o más líneas: **Etiqueta:** valor (misma línea; el valor puede pasar a líneas siguientes al ancho `contentWidth`).
 */
function drawInlineMetaBlack(doc, marginX, startY, contentWidth, label, value) {
    const lineGap = 2;
    const rawVal = String(value ?? '').trim() || '—';
    const labelPart = `${String(label).trim()}: `;
    doc.fillColor(pdf_kit_brand_1.PDF_BRAND.text).font('Helvetica-Bold').fontSize(9);
    doc.text(labelPart, marginX, startY, { lineGap, continued: true });
    const xAfterLabel = doc.x;
    const valueWidth = Math.max(36, marginX + contentWidth - xAfterLabel);
    doc.font('Helvetica').fontSize(9).fillColor(pdf_kit_brand_1.PDF_BRAND.text);
    doc.text(rawVal, { width: valueWidth, lineGap });
    return doc.y + 6;
}
/** Dos columnas meta en negro (~44 % + resto). */
function drawTwoColumnMetaBlack(doc, marginX, startY, contentWidth, left, right) {
    const metaGutter = 10;
    let leftW = Math.floor(contentWidth * 0.44);
    leftW = Math.min(leftW, contentWidth - metaGutter - 220);
    leftW = Math.max(220, leftW);
    const rightW = contentWidth - leftW - metaGutter;
    const xRight = marginX + leftW + metaGutter;
    const yL = drawStackedMetaBlack(doc, marginX, startY, leftW, left.label, left.value);
    const yR = drawStackedMetaBlack(doc, xRight, startY, rightW, right.label, right.value);
    return Math.max(yL, yR) + 4;
}
/** Título + subtítulo + generado + línea horizontal (ancho alineado a `width`, típ. ancho tabla 594). */
function drawReportCoverCentered(doc, x, width, startY, opts) {
    let y = startY;
    doc.fillColor(pdf_kit_brand_1.PDF_BRAND.text).font('Helvetica-Bold').fontSize(16);
    doc.text(opts.title, x, y, { width, align: 'center' });
    y += 18;
    doc.font('Helvetica').fontSize(10).fillColor(pdf_kit_brand_1.PDF_BRAND.muted);
    doc.text(SUBTITLE, x, y, { width, align: 'center' });
    y += 12;
    doc.fontSize(9).text(`Generado: ${opts.generadoEn}`, x, y, { width, align: 'center' });
    y += 12;
    doc.moveTo(x, y).lineTo(x + width, y).strokeColor(pdf_kit_brand_1.PDF_BRAND.accent).lineWidth(1).stroke();
    y += 7;
    return y;
}
/** Dos bloques etiqueta/valor como en auditoría (~44 % izquierda + resto). */
function drawTwoColumnMeta44Split(doc, marginX, startY, contentWidth, left, right) {
    const metaGutter = 10;
    let leftW = Math.floor(contentWidth * 0.44);
    leftW = Math.min(leftW, contentWidth - metaGutter - 220);
    leftW = Math.max(220, leftW);
    const rightW = contentWidth - leftW - metaGutter;
    const xRight = marginX + leftW + metaGutter;
    const yL = (0, pdf_kit_brand_1.drawStackedLabelValue)(doc, marginX, startY, leftW, left.label, left.value);
    const yR = (0, pdf_kit_brand_1.drawStackedLabelValue)(doc, xRight, startY, rightW, right.label, right.value);
    return Math.max(yL, yR) + 4;
}
