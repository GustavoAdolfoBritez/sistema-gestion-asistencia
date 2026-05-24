"use strict";
/**
 * Kit visual compartido para informes PDF (auditoría, informe alumno, reportes operativos, etc.).
 *
 * Tokens en blanco y negro para impresión (el logo NIHON en imagen conserva su color).
 * No importar desde la planilla PDF legal (`reportes.pdf.ts` / `generarPlanillaLegalPdf`): ese diseño está congelado.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDF_FOOTER_RESERVED = exports.PDF_TIMEZONE_PARAGUAY = exports.PDF_BRAND_MARGIN = exports.PDF_BRAND = void 0;
exports.formatFechaHoraCompactaParaguay = formatFechaHoraCompactaParaguay;
exports.formatGeneradoParaguay = formatGeneradoParaguay;
exports.fitText = fitText;
exports.drawDocumentHeader = drawDocumentHeader;
exports.drawSectionTitle = drawSectionTitle;
exports.drawKeyValueRows = drawKeyValueRows;
exports.drawStackedLabelValue = drawStackedLabelValue;
exports.maxLineWidthOfString = maxLineWidthOfString;
exports.buildContentFitTableColumns = buildContentFitTableColumns;
exports.measureModernTableRowWrappedHeight = measureModernTableRowWrappedHeight;
exports.drawModernTableRowWrapped = drawModernTableRowWrapped;
exports.drawModernTableHeader = drawModernTableHeader;
exports.drawModernTableRow = drawModernTableRow;
exports.drawFooter = drawFooter;
const fs_1 = __importDefault(require("fs"));
exports.PDF_BRAND = {
    accent: '#000000',
    accentDark: '#000000',
    text: '#000000',
    muted: '#333333',
    border: '#999999',
    zebra: '#ffffff',
    headerBg: '#000000',
    headerText: '#ffffff',
    ok: '#000000',
    err: '#000000',
};
/** Márgenes estándar para informes A4 (retrato u horizontal). */
exports.PDF_BRAND_MARGIN = 40;
/** Zona horaria para textos de generación / filtros en informes. */
exports.PDF_TIMEZONE_PARAGUAY = 'America/Asuncion';
/** Fecha y hora compactas para tablas (DD/MM/AAAA, HH:mm, 24 h, Paraguay). */
function formatFechaHoraCompactaParaguay(fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(d.getTime()))
        return '—';
    const fechaTxt = new Intl.DateTimeFormat('en-GB', {
        timeZone: exports.PDF_TIMEZONE_PARAGUAY,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(d);
    const horaTxt = new Intl.DateTimeFormat('en-GB', {
        timeZone: exports.PDF_TIMEZONE_PARAGUAY,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(d);
    return `${fechaTxt}, ${horaTxt}`;
}
function formatGeneradoParaguay(fecha = new Date()) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(d.getTime()))
        return '—';
    return new Intl.DateTimeFormat('es-PY', {
        year: 'numeric',
        month: 'long',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: exports.PDF_TIMEZONE_PARAGUAY,
    }).format(d);
}
function fitText(doc, text, maxWidth) {
    const safe = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!safe)
        return '—';
    if (doc.widthOfString(safe) <= maxWidth)
        return safe;
    let out = safe;
    while (out.length > 1 && doc.widthOfString(`${out}…`) > maxWidth)
        out = out.slice(0, -1);
    return `${out}…`;
}
/**
 * Portada compacta: logo opcional, título, subtítulo, fecha de generación.
 * @returns Y siguiente bajo el bloque.
 */
function drawDocumentHeader(doc, opts, marginX, startY, contentWidth) {
    let y = startY;
    const logoPath = opts.logoPath;
    if (logoPath && fs_1.default.existsSync(logoPath)) {
        const h = 36;
        const w = Math.round(h * 2.2);
        try {
            doc.image(logoPath, marginX, y, { width: w, height: h });
        }
        catch {
            /* formato no soportado, etc. */
        }
    }
    doc.fillColor(exports.PDF_BRAND.text).font('Helvetica-Bold').fontSize(16);
    doc.text(opts.title, marginX, y + 2, { width: contentWidth, align: 'right' });
    y += 42;
    if (opts.subtitle) {
        doc.font('Helvetica').fontSize(10).fillColor(exports.PDF_BRAND.muted);
        doc.text(opts.subtitle, marginX, y, { width: contentWidth });
        y += 14;
    }
    doc.font('Helvetica').fontSize(9).fillColor(exports.PDF_BRAND.muted);
    doc.text(`Generado: ${opts.generatedAt}`, marginX, y, { width: contentWidth });
    y += 16;
    doc.moveTo(marginX, y).lineTo(marginX + contentWidth, y).strokeColor(exports.PDF_BRAND.accent).lineWidth(1).stroke();
    y += 12;
    return y;
}
function drawSectionTitle(doc, marginX, y, contentWidth, title) {
    const barW = 3;
    const h = 18;
    doc.rect(marginX, y, barW, h).fill(exports.PDF_BRAND.accent);
    // Texto oscuro sobre fondo claro, con barra negra a la izquierda.
    doc.fillColor(exports.PDF_BRAND.text).font('Helvetica-Bold').fontSize(11.5);
    doc.text(title, marginX + barW + 8, y + 3, { width: contentWidth - barW - 8 });
    return y + h + 8;
}
/** Pares etiqueta / valor: etiqueta en negrita y valor debajo con sangría (evita solapes si el texto largo). */
function drawKeyValueRows(doc, marginX, startY, contentWidth, rows) {
    let y = startY;
    const indent = 10;
    const valueW = Math.max(40, contentWidth - indent);
    const lineGap = 0.5;
    const d = doc;
    for (const row of rows) {
        const label = `${row.label}:`;
        const rawVal = String(row.value ?? '').trim() || '—';
        doc.fillColor(exports.PDF_BRAND.muted).font('Helvetica-Bold').fontSize(9);
        const hLabel = d.heightOfString(label, { width: contentWidth, lineGap });
        doc.text(label, marginX, y, { width: contentWidth, lineGap });
        doc.fillColor(exports.PDF_BRAND.text).font('Helvetica').fontSize(9);
        const hVal = d.heightOfString(rawVal, { width: valueW, lineGap });
        doc.text(rawVal, marginX + indent, y + hLabel + 2, { width: valueW, lineGap });
        y += hLabel + 2 + hVal + 8;
    }
    return y + 2;
}
/** Una fila etiqueta + valor apilados (ancho fijo); usado en meta columnada. */
function drawStackedLabelValue(doc, marginX, startY, colWidth, label, value) {
    const lineGap = 0.5;
    const d = doc;
    const indent = 10;
    const valueW = Math.max(40, colWidth - indent);
    let y = startY;
    const labelText = `${label}:`;
    doc.fillColor(exports.PDF_BRAND.muted).font('Helvetica-Bold').fontSize(9);
    const hLabel = d.heightOfString(labelText, { width: colWidth, lineGap });
    doc.text(labelText, marginX, y, { width: colWidth, lineGap });
    const rawVal = String(value ?? '').trim() || '—';
    doc.fillColor(exports.PDF_BRAND.text).font('Helvetica').fontSize(9);
    const hVal = d.heightOfString(rawVal, { width: valueW, lineGap });
    doc.text(rawVal, marginX + indent, y + hLabel + 2, { width: valueW, lineGap });
    return y + hLabel + 2 + hVal + 8;
}
/** Ancho máximo de una línea (soporta saltos `\n` explícitos en el texto). */
function maxLineWidthOfString(doc, text) {
    const parts = String(text ?? '').split('\n');
    if (!parts.length)
        return 0;
    return Math.max(...parts.map((line) => doc.widthOfString(line || '—')), 0);
}
/**
 * Calcula anchos de columna midiendo cabeceras y celdas (ancho de la línea más larga).
 * Si el total supera `totalWidth`, achica primero las columnas con menor `shrinkResistance`.
 * El sobrante se reparte en columnas más resistentes. El texto que no entra en una línea
 * debe renderizarse con `drawModernTableRowWrapped`.
 */
function buildContentFitTableColumns(doc, defs, rows, totalWidth, options) {
    const pad = options?.horizontalPadding ?? 8;
    const headerFs = options?.headerFontSize ?? 8.5;
    const cellFs = options?.cellFontSize ?? 8;
    const mins = defs.map((d) => d.minWidth ?? 28);
    const maxs = defs.map((d) => d.maxWidth ?? Infinity);
    const resistances = defs.map((d) => d.shrinkResistance ?? 5);
    const ideals = defs.map((def, i) => {
        doc.font('Helvetica-Bold').fontSize(headerFs);
        let w = maxLineWidthOfString(doc, def.label) + pad;
        doc.font('Helvetica').fontSize(cellFs);
        for (const row of rows) {
            const txt = String(row[def.key] ?? '').trim() || '—';
            w = Math.max(w, maxLineWidthOfString(doc, txt) + pad);
        }
        return Math.min(Math.max(w, mins[i]), maxs[i]);
    });
    let widths = [...ideals];
    let sum = widths.reduce((a, b) => a + b, 0);
    const growOrder = () => defs.map((_, i) => i).sort((a, b) => resistances[b] - resistances[a] || b - a);
    const shrinkOrder = () => defs.map((_, i) => i).sort((a, b) => resistances[a] - resistances[b] || b - a);
    if (sum < totalWidth) {
        let slack = totalWidth - sum;
        for (const i of growOrder()) {
            const room = maxs[i] - widths[i];
            if (room <= 0)
                continue;
            const add = Math.min(slack, room);
            widths[i] += add;
            slack -= add;
            if (slack <= 0)
                break;
        }
    }
    else if (sum > totalWidth) {
        let deficit = sum - totalWidth;
        for (const i of shrinkOrder()) {
            const room = widths[i] - mins[i];
            if (room <= 0)
                continue;
            const take = Math.min(deficit, room);
            widths[i] -= take;
            deficit -= take;
            if (deficit <= 0)
                break;
        }
    }
    sum = widths.reduce((a, b) => a + b, 0);
    let delta = totalWidth - sum;
    let guard = 0;
    while (delta !== 0 && guard < 2000) {
        if (delta > 0) {
            let moved = false;
            for (const i of growOrder()) {
                if (widths[i] >= maxs[i])
                    continue;
                widths[i] += 1;
                delta -= 1;
                moved = true;
                break;
            }
            if (!moved)
                break;
        }
        else {
            let moved = false;
            for (const i of shrinkOrder()) {
                if (widths[i] <= mins[i])
                    continue;
                widths[i] -= 1;
                delta += 1;
                moved = true;
                break;
            }
            if (!moved)
                break;
        }
        guard += 1;
    }
    return defs.map((def, i) => ({
        key: def.key,
        label: def.label,
        width: widths[i],
        align: def.align,
    }));
}
const TABLE_CELL_FONT_SIZE = 8;
const TABLE_CELL_PAD_Y = 4;
const TABLE_CELL_LINE_GAP = 0.75;
/** Altura de una fila de tabla con texto multilínea (misma tipografía que `drawModernTableRowWrapped`). */
function measureModernTableRowWrappedHeight(doc, columns, row, minRowHeight, options) {
    const d = doc;
    doc.font('Helvetica').fontSize(TABLE_CELL_FONT_SIZE);
    let maxInner = 0;
    for (const col of columns) {
        const raw = String(row[col.key] ?? '').trim() || '—';
        const innerW = Math.max(20, col.width - 8);
        const useEllipsis = options?.ellipsisColumnKeys?.has(col.key) ?? false;
        const cell = useEllipsis ? fitText(doc, raw, innerW) : raw;
        const h = d.heightOfString(cell, { width: innerW, lineGap: TABLE_CELL_LINE_GAP });
        maxInner = Math.max(maxInner, h);
    }
    return Math.max(minRowHeight, maxInner + TABLE_CELL_PAD_Y * 2);
}
/** Fila de tabla con celdas que ajustan altura al contenido (sin `…` salvo columnas indicadas en `ellipsisColumnKeys`). */
function drawModernTableRowWrapped(doc, marginX, y, columns, row, rowHeight, zebra, textColorForCell, options) {
    let x = marginX;
    doc.font('Helvetica').fontSize(TABLE_CELL_FONT_SIZE);
    for (const col of columns) {
        const raw = String(row[col.key] ?? '').trim() || '—';
        const innerW = Math.max(20, col.width - 8);
        const useEllipsis = options?.ellipsisColumnKeys?.has(col.key) ?? false;
        const cell = useEllipsis ? fitText(doc, raw, innerW) : raw;
        if (zebra) {
            doc.save();
            doc.rect(x, y, col.width, rowHeight).fill(exports.PDF_BRAND.zebra);
            doc.restore();
        }
        doc.rect(x, y, col.width, rowHeight).strokeColor(exports.PDF_BRAND.border).lineWidth(0.35).stroke();
        const textColor = textColorForCell?.(col.key, cell) ?? exports.PDF_BRAND.text;
        doc.fillColor(textColor).text(cell, x + 4, y + TABLE_CELL_PAD_Y, {
            width: innerW,
            lineGap: TABLE_CELL_LINE_GAP,
            align: col.align ?? 'left',
        });
        x += col.width;
    }
}
/**
 * Tabla con cabecera y filas zebra. No pagina sola: el caller debe llamar addPage si y + rowHeight > limite.
 * `print`: fondo blanco y texto oscuro (ahorra tinta al imprimir).
 */
function drawModernTableHeader(doc, marginX, y, columns, rowHeight, style = 'print') {
    const bg = style === 'print' ? '#ffffff' : exports.PDF_BRAND.headerBg;
    const textColor = style === 'print' ? exports.PDF_BRAND.text : exports.PDF_BRAND.headerText;
    let x = marginX;
    doc.font('Helvetica-Bold').fontSize(8.5);
    for (const col of columns) {
        doc.rect(x, y, col.width, rowHeight).fill(bg);
        if (style === 'print') {
            doc.rect(x, y, col.width, rowHeight).strokeColor(exports.PDF_BRAND.border).lineWidth(0.35).stroke();
        }
        doc.fillColor(textColor).font('Helvetica-Bold').fontSize(8.5);
        const innerW = Math.max(12, col.width - 8);
        const label = fitText(doc, col.label, innerW);
        doc.text(label, x + 4, y + 6, { width: innerW, align: col.align ?? 'left' });
        x += col.width;
    }
    return y + rowHeight;
}
function drawModernTableRow(doc, marginX, y, columns, row, rowHeight, zebra, textColorForCell) {
    let x = marginX;
    doc.font('Helvetica').fontSize(8);
    for (const col of columns) {
        const cell = fitText(doc, row[col.key] ?? '—', col.width - 8);
        if (zebra) {
            doc.save();
            doc.rect(x, y, col.width, rowHeight).fill(exports.PDF_BRAND.zebra);
            doc.restore();
        }
        doc.rect(x, y, col.width, rowHeight).strokeColor(exports.PDF_BRAND.border).lineWidth(0.35).stroke();
        const textColor = textColorForCell?.(col.key, cell) ?? exports.PDF_BRAND.text;
        doc.fillColor(textColor).text(cell, x + 4, y + 6, { width: col.width - 8, align: col.align ?? 'left' });
        x += col.width;
    }
}
function drawFooter(doc, marginX, bottomY, contentWidth, opts) {
    const parts = [`Página ${opts.pageIndex + 1} de ${opts.pageTotal}`];
    if (opts.exportedBy)
        parts.push(`Exportado por: ${opts.exportedBy}`);
    if (opts.requestId)
        parts.push(`Request: ${opts.requestId}`);
    doc.font('Helvetica').fontSize(7.5).fillColor(exports.PDF_BRAND.muted);
    doc.text(parts.join(' · '), marginX, bottomY, { width: contentWidth, align: 'center' });
}
/** Altura reservada para pie (para calcular corte de página antes de dibujar filas). */
exports.PDF_FOOTER_RESERVED = 28;
