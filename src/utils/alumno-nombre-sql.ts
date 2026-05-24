/**
 * Fragmento SQL para JOIN `alumnos al`: muestra "Apellidos, Nombres" con coma
 * cuando hay datos en columnas separadas; si no, usa `nombre_apellido` (importaciones).
 */
export const SQL_ALUMNO_APELLIDOS_COMA_NOMBRES =
    "CASE WHEN COALESCE(TRIM(al.apellidos), '') <> '' OR COALESCE(TRIM(al.nombres), '') <> '' THEN TRIM(CONCAT(COALESCE(TRIM(al.apellidos), ''), ', ', COALESCE(TRIM(al.nombres), ''))) ELSE NULLIF(TRIM(al.nombre_apellido), '') END";
