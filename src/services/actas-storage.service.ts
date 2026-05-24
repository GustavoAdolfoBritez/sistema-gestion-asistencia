import { supabase } from '../config/supabase';

const ACTAS_BUCKET = 'actas';

function sanitizeStoragePath(fileName: string): string {
    const base = fileName.replace(/\\/g, '/').split('/').pop() ?? 'documento.pdf';
    return base.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'documento.pdf';
}

/** Sube un PDF en memoria al bucket `actas` y devuelve la URL pública absoluta. */
export async function subirActaPdf(buffer: Buffer, fileName: string): Promise<string> {
    const ruta = sanitizeStoragePath(fileName);

    const { error } = await supabase.storage.from(ACTAS_BUCKET).upload(ruta, buffer, {
        contentType: 'application/pdf',
        upsert: true,
    });

    if (error) {
        throw new Error(`No se pudo subir el PDF a Supabase Storage: ${error.message}`);
    }

    const { data } = supabase.storage.from(ACTAS_BUCKET).getPublicUrl(ruta);
    return data.publicUrl;
}
