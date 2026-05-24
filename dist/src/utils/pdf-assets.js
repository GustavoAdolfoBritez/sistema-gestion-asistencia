"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDF_LOGO_BANNER_HEIGHT_PT = exports.PDF_LOGO_BANNER_WIDTH_PT = exports.PDF_LOGO_PATH = exports.ACTAS_OUTPUT_DIR = void 0;
const path_1 = __importDefault(require("path"));
/** Salida de actas e informes PDF (misma convención que el resto del sistema). */
exports.ACTAS_OUTPUT_DIR = path_1.default.resolve(process.cwd(), 'generated', 'actas');
/** Logo institucional para portadas de informes (no usar en planilla legal congelada). */
exports.PDF_LOGO_PATH = path_1.default.resolve(process.cwd(), 'generated', 'assets', 'ung-logo.png');
/** Logo banner horizontal (331×59) — solo para informes que usen proporción ancha. */
exports.PDF_LOGO_BANNER_WIDTH_PT = 150;
exports.PDF_LOGO_BANNER_HEIGHT_PT = Math.round((exports.PDF_LOGO_BANNER_WIDTH_PT * 59) / 331);
