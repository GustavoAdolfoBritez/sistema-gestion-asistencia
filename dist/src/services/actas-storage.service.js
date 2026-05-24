"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subirActaPdf = subirActaPdf;
const supabase_1 = require("../config/supabase");
const ACTAS_BUCKET = 'actas';
function sanitizeStoragePath(fileName) {
    const base = fileName.replace(/\\/g, '/').split('/').pop() ?? 'documento.pdf';
    return base.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'documento.pdf';
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
