-- La columna modalidad (presencial/virtual) se usaba en el codigo (creacion de
-- sesion, cambio de modalidad, cierre de jornada, listado de sesiones) pero
-- nunca quedo registrada en una migracion: probablemente se agrego a mano
-- desde el panel de Supabase en el entorno original. Bases nuevas creadas
-- solo a partir de schema.sql + migraciones (p. ej. el entorno de demo)
-- no la tenian, lo que rompia GET /asistencias/sesiones con "column
-- modalidad does not exist".
ALTER TABLE sesiones_clase ADD COLUMN IF NOT EXISTS modalidad VARCHAR(20) NOT NULL DEFAULT 'presencial';

ALTER TABLE sesiones_clase DROP CONSTRAINT IF EXISTS sesiones_clase_modalidad_check;
ALTER TABLE sesiones_clase ADD CONSTRAINT sesiones_clase_modalidad_check CHECK (modalidad IN ('presencial', 'virtual'));
