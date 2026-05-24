import path from 'path';

/** Salida de actas e informes PDF (misma convención que el resto del sistema). */
export const ACTAS_OUTPUT_DIR = path.resolve(process.cwd(), 'generated', 'actas');

/** Logo institucional para portadas de informes (no usar en planilla legal congelada). */
export const PDF_LOGO_PATH = path.resolve(process.cwd(), 'generated', 'assets', 'ung-logo.png');

/** Logo banner horizontal (331×59) — solo para informes que usen proporción ancha. */
export const PDF_LOGO_BANNER_WIDTH_PT = 150;
export const PDF_LOGO_BANNER_HEIGHT_PT = Math.round((PDF_LOGO_BANNER_WIDTH_PT * 59) / 331);
