"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeStoragePath = sanitizeStoragePath;
exports.subirActaPdf = subirActaPdf;
const supabase_1 = require("../config/supabase");
const ACTAS_BUCKET = 'actas';
/**
 * Supabase Storage exige claves seguras (sin espacios, comas, acentos ni caracteres reservados).
 * Convierte el nombre legible del PDF a un slug ASCII compatible.
 */
function sanitizeStoragePath(fileName) {
    const base = fileName.replace(/\\/g, '/').split('/').pop() ?? 'documento.pdf';
    const stem = base.replace(/\.pdf$/i, '');
    const slug = stem
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    return `${slug.slice(0, 200) || 'documento'}.pdf`;
}
/** Sube un PDF en memoria al bucket `actas` y devuelve la URL pública absoluta. */
async function subirActaPdf(buffer, fileName) {
    const ruta = sanitizeStoragePath(fileName);
    const { error } = await supabase_1.supabase.storage.from(ACTAS_BUCKET).upload(ruta, buffer, {
        contentType: 'application/pdf',
        upsert: true,
    });
    if (error) {
        throw new Error(`No se pudo subir el PDF a Supabase Storage: ${error.message}`);
    }
    const { data } = supabase_1.supabase.storage.from(ACTAS_BUCKET).getPublicUrl(ruta);
    return data.publicUrl;
}
