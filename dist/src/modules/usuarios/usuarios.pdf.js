"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarListadoUsuariosPdf = generarListadoUsuariosPdf;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const pdf_assets_1 = require("../../utils/pdf-assets");
const pdf_institutional_header_planilla_1 = require("../../utils/pdf-institutional-header-planilla");
const pdf_kit_brand_1 = require("../../utils/pdf-kit-brand");
const pdf_report_cover_1 = require("../../utils/pdf-report-cover");
const ROW_HEIGHT = 18;
function humanizarFiltrosUsuarios(filtros) {
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
        const titulo = {
            estado: 'Estado',
            q: 'Búsqueda',
            rol: 'Rol exacto',
            rolCategoria: 'Categoría de rol (vista)',
        }[key] ?? `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        return `${titulo}: ${raw}`;
    })
        .join('\n');
}
async function generarListadoUsuariosPdf(data, fileName) {
    fs_1.default.mkdirSync(pdf_assets_1.ACTAS_OUTPUT_DIR, { recursive: true });
    const filePath = path_1.default.join(pdf_assets_1.ACTAS_OUTPUT_DIR, fileName);
    const columns = [
        { key: 'nombres', label: 'Nombres', width: 90, align: 'left' },
        { key: 'apellidos', label: 'Apellidos', width: 95, align: 'left' },
        { key: 'email', label: 'Correo', width: 168, align: 'left' },
        { key: 'usuario', label: 'Usuario', width: 72, align: 'left' },
        { key: 'telefono', label: 'Teléfono', width: 78, align: 'left' },
        { key: 'estado', label: 'Estado', width: 58, align: 'center' },
        { key: 'roles', label: 'Roles', width: 201, align: 'left' },
    ];
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
        const filtrosTxt = humanizarFiltrosUsuarios(data.filtros);
        y = (0, pdf_report_cover_1.drawStackedMetaBlack)(doc, margin, y, contentW, 'Filtros aplicados', filtrosTxt);
        y = (0, pdf_kit_brand_1.drawSectionTitle)(doc, margin, y, contentW, 'Usuarios');
        const drawTableHeaderAt = (yy) => (0, pdf_kit_brand_1.drawModernTableHeader)(doc, margin, yy, columns, ROW_HEIGHT, 'print');
        y = drawTableHeaderAt(y);
        let idx = 0;
        for (const item of data.usuarios) {
            if (y + ROW_HEIGHT > bottomLimit) {
                doc.addPage();
                y = margin;
                y = drawTableHeaderAt(y);
            }
            const row = {
                nombres: item.nombres,
                apellidos: item.apellidos,
                email: item.email,
                usuario: item.usuario,
                telefono: item.telefono,
                estado: item.estado,
                roles: item.roles,
            };
            (0, pdf_kit_brand_1.drawModernTableRow)(doc, margin, y, columns, row, ROW_HEIGHT, idx % 2 === 1);
            y += ROW_HEIGHT;
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
