"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQL_ALUMNO_APELLIDOS_COMA_NOMBRES = void 0;
/**
 * Fragmento SQL para JOIN `alumnos al`: muestra "Apellidos, Nombres" con coma
 * cuando hay datos en columnas separadas; si no, usa `nombre_apellido` (importaciones).
 */
exports.SQL_ALUMNO_APELLIDOS_COMA_NOMBRES = "CASE WHEN COALESCE(TRIM(al.apellidos), '') <> '' OR COALESCE(TRIM(al.nombres), '') <> '' THEN TRIM(CONCAT(COALESCE(TRIM(al.apellidos), ''), ', ', COALESCE(TRIM(al.nombres), ''))) ELSE NULLIF(TRIM(al.nombre_apellido), '') END";
