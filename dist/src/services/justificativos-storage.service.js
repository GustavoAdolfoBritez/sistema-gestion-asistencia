"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subirJustificativoPdf = subirJustificativoPdf;
const supabase_1 = require("../config/supabase");
const actas_storage_service_1 = require("./actas-storage.service");
const JUSTIFICATIVOS_BUCKET = 'justificativos';
/** Sube un PDF justificativo al bucket `justificativos` y devuelve la URL pública absoluta. */
async function subirJustificativoPdf(buffer, originalName) {
    const slug = (0, actas_storage_service_1.sanitizeStoragePath)(originalName).replace(/\.pdf$/i, '');
    const ruta = `${Date.now()}-${slug}.pdf`;
    const { error } = await supabase_1.supabase.storage.from(JUSTIFICATIVOS_BUCKET).upload(ruta, buffer, {
        contentType: 'application/pdf',
        upsert: false,
    });
    if (error) {
        throw new Error(`No se pudo subir el justificativo a Supabase Storage: ${error.message}`);
    }
    const { data } = supabase_1.supabase.storage.from(JUSTIFICATIVOS_BUCKET).getPublicUrl(ruta);
    return data.publicUrl;
}
