-- El Cronograma de Catedra (pestana "Cronograma de Catedra" en Asistencias)
-- depende de las tablas curso_cronograma_semanas y curso_evaluaciones,
-- agregadas originalmente en database/20260630_cronograma_catedra.sql y
-- database/20260630_cronograma_firmas_individuales.sql. Igual que paso con
-- la columna modalidad de sesiones_clase, es probable que estas tablas se
-- hayan creado a mano en el entorno original y nunca se corrieran esas
-- migraciones sobre bases nuevas (p. ej. el entorno de demo), lo que rompia
-- GET /academico/cursos/:id/cronograma con "relation curso_cronograma_semanas
-- does not exist".
--
-- Este archivo consolida ambas migraciones en una sola, 100% idempotente,
-- para poder correrla de forma segura sobre cualquier base (ya tenga las
-- tablas o no).

CREATE TABLE IF NOT EXISTS curso_cronograma_semanas (
    id SERIAL PRIMARY KEY,
    curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
    semana_numero SMALLINT NOT NULL CHECK (semana_numero > 0),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    contenidos TEXT[] NOT NULL DEFAULT '{}',
    actividades TEXT[] NOT NULL DEFAULT '{}',
    horas NUMERIC(5,1) DEFAULT 0,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (curso_id, semana_numero)
);

CREATE INDEX IF NOT EXISTS idx_cronograma_semanas_curso ON curso_cronograma_semanas(curso_id);

CREATE TABLE IF NOT EXISTS curso_evaluaciones (
    id SERIAL PRIMARY KEY,
    curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('parcial', 'final')),
    fecha DATE,
    alcance_prueba TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (curso_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_curso ON curso_evaluaciones(curso_id);

ALTER TABLE curso_cronograma_semanas ADD COLUMN IF NOT EXISTS firmado_por UUID REFERENCES docentes(id);
ALTER TABLE curso_cronograma_semanas ADD COLUMN IF NOT EXISTS firmado_en TIMESTAMPTZ;

ALTER TABLE curso_evaluaciones ADD COLUMN IF NOT EXISTS firmado_por UUID REFERENCES docentes(id);
ALTER TABLE curso_evaluaciones ADD COLUMN IF NOT EXISTS firmado_en TIMESTAMPTZ;

-- Nota: la tabla curso_cronograma_firmas (firma unica por curso completo,
-- ver database/20260630_cronograma_firmas.sql) quedo obsoleta y reemplazada
-- por las firmas individuales de arriba; el codigo actual ya no la usa, por
-- lo que no hace falta crearla en bases nuevas.
