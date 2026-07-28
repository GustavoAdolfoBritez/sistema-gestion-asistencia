-- =====================================================================
-- SEED DE DATOS FICTICIOS — ENTORNO DE DEMOSTRACIÓN (SANDBOX)
-- =====================================================================
-- Este script NO debe ejecutarse jamás contra la base de datos real de
-- la universidad. Está pensado para poblar una instancia de Supabase/
-- PostgreSQL totalmente SEPARADA y AISLADA, creada únicamente para que
-- reclutadores y revisores técnicos prueben el sistema con datos falsos.
--
-- REQUISITOS PREVIOS (en ese orden, sobre la base de datos demo vacía):
--   1) database/schema.sql
--   2) Todas las migraciones incrementales en database/*.sql (por fecha)
--   3) Este archivo: database/seed_demo.sql
--
-- VARIABLES DE ENTORNO NECESARIAS PARA CONECTAR EL BACKEND A ESTA DEMO
-- (ver src/config/env.ts — no versionar valores reales, solo referencia):
--   PORT=4000
--   NODE_ENV=production
--   SUPABASE_DB_URL=postgresql://usuario:password@host:puerto/basededatos   -> cadena de conexión del proyecto DEMO (no el de desarrollo)
--   SUPABASE_URL=https://<proyecto-demo>.supabase.co
--   SUPABASE_SERVICE_ROLE_KEY=<service_role_key del proyecto DEMO>
--   JWT_SECRET=<secreto propio de la demo, distinto al de producción>
--   JWT_REFRESH_SECRET=<secreto propio de la demo, distinto al de producción>
--   CORS_ORIGINS=https://<dominio-de-la-demo-frontend>
--
-- VARIABLE DE ENTORNO EN EL FRONTEND DE LA DEMO (ver frontend/.env.example):
--   VITE_API_URL=https://<api-de-la-demo>/api
--   VITE_IS_DEMO=true   -> habilita el selector rápido de credenciales en el Login
--
-- REEJECUCIÓN SEGURA:
--   El script es idempotente: al inicio elimina cualquier dato de demo
--   previamente sembrado (identificado por dominio de email *.demo@ung.edu.py
--   y por el nombre de facultad "(Demo)") antes de volver a insertarlo.
--   Las fechas de sesiones/asistencias se calculan en relación a la fecha
--   actual (CURRENT_DATE), por lo que el dashboard siempre muestra
--   actividad "reciente" sin importar cuándo se ejecute este script.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) LIMPIEZA IDEMPOTENTE DE UNA SIEMBRA DE DEMO ANTERIOR
--    (orden obligatorio por las restricciones de llaves foráneas)
-- ---------------------------------------------------------------------

-- 0.1) Cursos de demo -> cascada elimina sesiones, matrículas, asistencias,
--      justificaciones, alertas y habilitaciones asociadas.
DELETE FROM cursos c
USING modulos_academicos mo, materias ma, planes_estudio pe, carreras ca, facultades f
WHERE c.modulo_id = mo.id
  AND mo.materia_id = ma.id
  AND ma.plan_id = pe.id
  AND pe.carrera_id = ca.id
  AND ca.facultad_id = f.id
  AND f.nombre = 'Facultad de Ciencias Informáticas (Demo)';

-- 0.2) Eventos de auditoría de los actores demo (evitan bloquear el borrado de usuarios).
DELETE FROM auditoria_eventos WHERE actor_email LIKE '%.demo@ung.edu.py';
DELETE FROM auditorias WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '%.demo@ung.edu.py');

-- 0.3) Alumnos de demo (ya sin matrículas activas tras borrar los cursos).
DELETE FROM alumnos WHERE numero_documento LIKE '90100%';

-- 0.4) Estructura académica de demo (carreras -> cascada planes/materias/módulos).
DELETE FROM carreras ca USING facultades f
WHERE ca.facultad_id = f.id AND f.nombre = 'Facultad de Ciencias Informáticas (Demo)';
DELETE FROM facultades WHERE nombre = 'Facultad de Ciencias Informáticas (Demo)';

-- 0.5) Usuarios de demo -> cascada elimina docentes, usuarios_roles,
--      tokens_refresco y usuario_scopes.
DELETE FROM usuarios WHERE email LIKE '%.demo@ung.edu.py';

-- ---------------------------------------------------------------------
-- 1) SIEMBRA PRINCIPAL
-- ---------------------------------------------------------------------
DO $$
DECLARE
    -- Contraseña única para los 3 usuarios de demo: "Demo123456!"
    -- Hash generado con bcryptjs (mismo algoritmo y costo=12 que usa el backend,
    -- ver src/modules/usuarios/usuarios.service.ts -> bcrypt.hash(password, 12)).
    v_password_hash CONSTANT VARCHAR := '$2b$12$vnSeApIw/3iu1sNhOjceKeV6wDOZx1SxRO5zBzl5sc4dh/XI7F30a';

    -- IDs fijos y memorables para los usuarios de demo (facilita depuración y reejecución).
    v_usuario_admin_id CONSTANT UUID := 'd0000000-0000-4000-8000-000000000001';
    v_usuario_secretaria_id CONSTANT UUID := 'd0000000-0000-4000-8000-000000000002';
    v_usuario_docente_id CONSTANT UUID := 'd0000000-0000-4000-8000-000000000003';
    v_docente_id CONSTANT UUID := 'd0000000-0000-4000-8000-0000000000d1';

    v_rol_admin_id INTEGER;
    v_rol_secretaria_id INTEGER;
    v_rol_docente_id INTEGER;

    v_facultad_id INTEGER;
    v_carrera_id INTEGER;
    v_plan_id INTEGER;
    v_materia1_id INTEGER;
    v_materia2_id INTEGER;
    v_modulo1_id INTEGER;
    v_modulo2_id INTEGER;
    v_curso1_id INTEGER;
    v_curso2_id INTEGER;

    v_curso_id INTEGER;
    v_fecha_inicio_modulo DATE;
    v_fecha_fin_modulo DATE;
    v_fecha DATE;
    v_sesion_id INTEGER;
    v_asistencia_id BIGINT;
    v_matricula RECORD;
    v_rand NUMERIC;
    v_estado_asistencia estado_asistencia;
    v_justificada BOOLEAN;
    v_inicio_mes_actual CONSTANT DATE := date_trunc('month', CURRENT_DATE)::date;
    v_sesiones_mes_actual INTEGER;
BEGIN
    -- Reproducibilidad: mismo patrón de asistencia en cada reejecución.
    PERFORM setseed(0.4269);

    -- -------------------------------------------------------------
    -- 1.1) ROLES (garantiza que existan; no se tocan si ya existían)
    -- -------------------------------------------------------------
    INSERT INTO roles (nombre, descripcion) VALUES
        ('Administrador General', 'Acceso total al sistema'),
        ('Secretaría Académica', 'Gestión académica y de usuarios'),
        ('Jefe de Carrera', 'Gestión académica a nivel de carrera'),
        ('Coordinador de Facultad', 'Coordinación a nivel de facultad'),
        ('Docente', 'Registro de asistencia y cronograma de cátedra')
    ON CONFLICT (nombre) DO NOTHING;

    SELECT id INTO v_rol_admin_id FROM roles WHERE nombre = 'Administrador General';
    SELECT id INTO v_rol_secretaria_id FROM roles WHERE nombre = 'Secretaría Académica';
    SELECT id INTO v_rol_docente_id FROM roles WHERE nombre = 'Docente';

    -- -------------------------------------------------------------
    -- 1.2) USUARIOS DE DEMO (misma contraseña: Demo123456!)
    -- -------------------------------------------------------------
    INSERT INTO usuarios (id, username, nombres, apellidos, email, password_hash, estado)
    VALUES
        (v_usuario_admin_id, 'admin.demo', 'Administración', 'Demo', 'admin.demo@ung.edu.py', v_password_hash, 'activo'),
        (v_usuario_secretaria_id, 'secretaria.demo', 'Secretaría', 'Demo', 'secretaria.demo@ung.edu.py', v_password_hash, 'activo'),
        (v_usuario_docente_id, 'docente.demo', 'Docente', 'Demo', 'docente.demo@ung.edu.py', v_password_hash, 'activo');

    INSERT INTO usuarios_roles (usuario_id, rol_id) VALUES
        (v_usuario_admin_id, v_rol_admin_id),
        (v_usuario_secretaria_id, v_rol_secretaria_id),
        (v_usuario_docente_id, v_rol_docente_id);

    INSERT INTO docentes (id, usuario_id, legajo, titulo_academico)
    VALUES (v_docente_id, v_usuario_docente_id, 'DEMO-0001', 'Lic. en Informática');

    -- -------------------------------------------------------------
    -- 1.3) ESTRUCTURA ACADÉMICA FICTICIA
    -- -------------------------------------------------------------
    INSERT INTO facultades (nombre, estado)
    VALUES ('Facultad de Ciencias Informáticas (Demo)', TRUE)
    RETURNING id INTO v_facultad_id;

    INSERT INTO carreras (facultad_id, nombre, codigo)
    VALUES (v_facultad_id, 'Ingeniería en Sistemas de Información', 'ISI-DEMO')
    RETURNING id INTO v_carrera_id;

    INSERT INTO planes_estudio (carrera_id, nombre, resolucion, anio_vigencia)
    VALUES (v_carrera_id, 'Plan de Estudios 2020 (Demo)', 'RES-DEMO-001', 2020)
    RETURNING id INTO v_plan_id;

    INSERT INTO materias (plan_id, nombre, codigo, semestre, carga_horaria)
    VALUES (v_plan_id, 'Bases de Datos II', 'BD2-DEMO', 3, 64)
    RETURNING id INTO v_materia1_id;

    INSERT INTO materias (plan_id, nombre, codigo, semestre, carga_horaria)
    VALUES (v_plan_id, 'Programación Web', 'PWEB-DEMO', 3, 64)
    RETURNING id INTO v_materia2_id;

    -- Módulo (mes lectivo) de cada materia: desde 35 días atrás hasta ayer,
    -- para que las sesiones queden "cerradas" y alimenten el dashboard.
    v_fecha_inicio_modulo := CURRENT_DATE - INTERVAL '35 days';
    v_fecha_fin_modulo := CURRENT_DATE - INTERVAL '1 day';

    INSERT INTO modulos_academicos (materia_id, anio, mes, fecha_inicio, fecha_fin, estado)
    VALUES (v_materia1_id, EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT, EXTRACT(MONTH FROM CURRENT_DATE)::SMALLINT, v_fecha_inicio_modulo, v_fecha_fin_modulo, 'planificado')
    RETURNING id INTO v_modulo1_id;

    INSERT INTO modulos_academicos (materia_id, anio, mes, fecha_inicio, fecha_fin, estado)
    VALUES (v_materia2_id, EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT, EXTRACT(MONTH FROM CURRENT_DATE)::SMALLINT, v_fecha_inicio_modulo, v_fecha_fin_modulo, 'planificado')
    RETURNING id INTO v_modulo2_id;

    INSERT INTO cursos (modulo_id, docente_id, aula, horario_inicio, horario_fin, cupo, notas)
    VALUES (v_modulo1_id, v_docente_id, 'Laboratorio 3', '18:00', '20:00', 20, 'Curso de demostración — datos ficticios')
    RETURNING id INTO v_curso1_id;

    INSERT INTO cursos (modulo_id, docente_id, aula, horario_inicio, horario_fin, cupo, notas)
    VALUES (v_modulo2_id, v_docente_id, 'Aula 105', '19:00', '21:00', 20, 'Curso de demostración — datos ficticios')
    RETURNING id INTO v_curso2_id;

    -- Una sesión "programada" a futuro por curso, para mostrar la planilla del próximo día de clase.
    INSERT INTO sesiones_clase (curso_id, fecha, estado)
    VALUES (v_curso1_id, CURRENT_DATE + INTERVAL '3 days', 'programada');
    INSERT INTO sesiones_clase (curso_id, fecha, estado)
    VALUES (v_curso2_id, CURRENT_DATE + INTERVAL '4 days', 'programada');

    -- -------------------------------------------------------------
    -- 1.3 bis) CRONOGRAMA DE CÁTEDRA (5 semanas + evaluaciones)
    --      El rango del módulo (35 días) se divide en 5 semanas exactas.
    --      La semana 1 queda firmada (para mostrar el estado "Firmado"
    --      en la UI); el resto queda pendiente, para poder probar el
    --      flujo de firma del docente en la demo.
    -- -------------------------------------------------------------
    INSERT INTO curso_cronograma_semanas (curso_id, semana_numero, fecha_inicio, fecha_fin, contenidos, actividades, horas, firmado_por, firmado_en)
    VALUES
        (v_curso1_id, 1, v_fecha_inicio_modulo,      v_fecha_inicio_modulo + 6,  ARRAY['Repaso de modelo relacional', 'Normalización (1FN, 2FN, 3FN)'], ARRAY['Ejercicios de normalización en clase'], 4, v_docente_id, v_fecha_inicio_modulo + 6 + TIME '21:00'),
        (v_curso1_id, 2, v_fecha_inicio_modulo + 7,  v_fecha_inicio_modulo + 13, ARRAY['Transacciones y niveles de aislamiento', 'Propiedades ACID'], ARRAY['Laboratorio de transacciones en PostgreSQL'], 4, NULL, NULL),
        (v_curso1_id, 3, v_fecha_inicio_modulo + 14, v_fecha_inicio_modulo + 20, ARRAY['Índices y optimización de consultas', 'Lectura de planes con EXPLAIN ANALYZE'], ARRAY['Taller de tuning de queries'], 4, NULL, NULL),
        (v_curso1_id, 4, v_fecha_inicio_modulo + 21, v_fecha_inicio_modulo + 27, ARRAY['Procedimientos almacenados y triggers', 'Introducción a PL/pgSQL'], ARRAY['Práctica: trigger de auditoría'], 4, NULL, NULL),
        (v_curso1_id, 5, v_fecha_inicio_modulo + 28, v_fecha_fin_modulo,         ARRAY['Replicación y backups', 'Estrategias de alta disponibilidad'], ARRAY['Simulación de restore de backup'], 4, NULL, NULL);

    INSERT INTO curso_cronograma_semanas (curso_id, semana_numero, fecha_inicio, fecha_fin, contenidos, actividades, horas, firmado_por, firmado_en)
    VALUES
        (v_curso2_id, 1, v_fecha_inicio_modulo,      v_fecha_inicio_modulo + 6,  ARRAY['Fundamentos de HTML5 y CSS3', 'Flexbox y Grid'], ARRAY['Maquetado de una landing page'], 4, v_docente_id, v_fecha_inicio_modulo + 6 + TIME '21:00'),
        (v_curso2_id, 2, v_fecha_inicio_modulo + 7,  v_fecha_inicio_modulo + 13, ARRAY['JavaScript moderno (ES6+)', 'Manipulación del DOM'], ARRAY['Práctica: formulario interactivo con validaciones'], 4, NULL, NULL),
        (v_curso2_id, 3, v_fecha_inicio_modulo + 14, v_fecha_inicio_modulo + 20, ARRAY['Introducción a React', 'Componentes, props y estado'], ARRAY['Laboratorio: primer componente en React'], 4, NULL, NULL),
        (v_curso2_id, 4, v_fecha_inicio_modulo + 21, v_fecha_inicio_modulo + 27, ARRAY['Consumo de APIs REST', 'Manejo de estado con hooks'], ARRAY['Proyecto: listado dinámico con fetch a una API pública'], 4, NULL, NULL),
        (v_curso2_id, 5, v_fecha_inicio_modulo + 28, v_fecha_fin_modulo,         ARRAY['Control de versiones con Git', 'Despliegue y buenas prácticas'], ARRAY['Despliegue del proyecto final en Vercel'], 4, NULL, NULL);

    INSERT INTO curso_evaluaciones (curso_id, tipo, fecha, alcance_prueba, firmado_por, firmado_en)
    VALUES
        (v_curso1_id, 'parcial', v_fecha_inicio_modulo + 20, 'Unidades I a III: modelo relacional, normalización y transacciones', v_docente_id, v_fecha_inicio_modulo + 20 + TIME '21:00'),
        (v_curso1_id, 'final',   v_fecha_fin_modulo,          'Unidades I a V: programa completo de la materia', NULL, NULL),
        (v_curso2_id, 'parcial', v_fecha_inicio_modulo + 20, 'Unidades I a III: HTML, CSS, JavaScript y DOM', v_docente_id, v_fecha_inicio_modulo + 20 + TIME '21:00'),
        (v_curso2_id, 'final',   v_fecha_fin_modulo,          'Unidades I a V: programa completo de la materia', NULL, NULL);

    -- -------------------------------------------------------------
    -- 1.4) ALUMNOS FICTICIOS (14) — nombres, apellidos y CI inventados
    -- -------------------------------------------------------------
    INSERT INTO alumnos (numero_documento, numero_orden, nombres, apellidos, nombre_apellido, referencia_carrera_id, semestre_curricular, cohorte_anio)
    SELECT t.ci, t.orden, t.nombres, t.apellidos, t.apellidos || ', ' || t.nombres, v_carrera_id, 3, 2024
    FROM (VALUES
        ('9010001', 1, 'Mateo', 'Bareiro'),
        ('9010002', 2, 'Valentina', 'Ayala'),
        ('9010003', 3, 'Facundo', 'Ríos'),
        ('9010004', 4, 'Camila', 'Franco'),
        ('9010005', 5, 'Joaquín', 'Villalba'),
        ('9010006', 6, 'Sofía', 'Ovando'),
        ('9010007', 7, 'Nicolás', 'Ledesma'),
        ('9010008', 8, 'Renata', 'Cabrera'),
        ('9010009', 9, 'Ezequiel', 'Meza'),
        ('9010010', 10, 'Abril', 'Núñez'),
        ('9010011', 11, 'Bruno', 'Zárate'),
        ('9010012', 12, 'Milagros', 'Paredes'),
        ('9010013', 13, 'Tomás', 'Coronel'),
        ('9010014', 14, 'Delfina', 'Aquino')
    ) AS t(ci, orden, nombres, apellidos);

    -- -------------------------------------------------------------
    -- 1.5) MATRÍCULAS
    --      Curso 1 (Bases de Datos II): los 14 alumnos.
    --      Curso 2 (Programación Web): los primeros 10 alumnos.
    -- -------------------------------------------------------------
    INSERT INTO matriculas (curso_id, alumno_id, orden_lista)
    SELECT v_curso1_id, al.id, al.numero_orden
    FROM alumnos al
    WHERE al.numero_documento LIKE '90100%';

    INSERT INTO matriculas (curso_id, alumno_id, orden_lista)
    SELECT v_curso2_id, al.id, al.numero_orden
    FROM alumnos al
    WHERE al.numero_documento LIKE '90100%' AND al.numero_orden <= 10;

    -- -------------------------------------------------------------
    -- 1.6) SESIONES DE CLASE (cerradas, días lunes a jueves) + ASISTENCIAS
    --      Distribución: ~78% presente, ~10% ausente sin justificar,
    --      ~4% ausente con justificación pendiente, ~6% justificada
    --      (aprobada), ~2% ausente con justificación rechazada.
    --
    --      Dentro del MES EN CURSO se limitan a solo 4 sesiones ya
    --      tomadas (las primeras del mes); el resto de los días queda
    --      sin sesión para que cualquiera pueda probar el flujo de
    --      "Tomar lista" en la demo sin encontrarse el mes ya completo.
    --      Los meses anteriores sí se completan enteros (alimentan el
    --      historial de dashboard/reportes).
    -- -------------------------------------------------------------
    FOREACH v_curso_id IN ARRAY ARRAY[v_curso1_id, v_curso2_id]
    LOOP
        SELECT mo.fecha_inicio, mo.fecha_fin
        INTO v_fecha_inicio_modulo, v_fecha_fin_modulo
        FROM cursos c JOIN modulos_academicos mo ON mo.id = c.modulo_id
        WHERE c.id = v_curso_id;

        v_fecha := v_fecha_inicio_modulo;
        v_sesiones_mes_actual := 0;
        WHILE v_fecha <= v_fecha_fin_modulo LOOP
            IF EXTRACT(DOW FROM v_fecha) BETWEEN 1 AND 4
               AND (v_fecha < v_inicio_mes_actual OR v_sesiones_mes_actual < 4) THEN
                IF v_fecha >= v_inicio_mes_actual THEN
                    v_sesiones_mes_actual := v_sesiones_mes_actual + 1;
                END IF;

                INSERT INTO sesiones_clase (curso_id, fecha, estado, cerrado_por, cerrado_en)
                VALUES (v_curso_id, v_fecha, 'cerrada', v_usuario_docente_id, v_fecha + TIME '20:15')
                RETURNING id INTO v_sesion_id;

                FOR v_matricula IN
                    SELECT id FROM matriculas WHERE curso_id = v_curso_id
                LOOP
                    v_rand := random();
                    v_justificada := FALSE;

                    IF v_rand < 0.78 THEN
                        v_estado_asistencia := 'presente';
                    ELSIF v_rand < 0.88 THEN
                        v_estado_asistencia := 'ausente'; -- sin justificar
                    ELSIF v_rand < 0.92 THEN
                        v_estado_asistencia := 'ausente'; -- justificación pendiente de revisión
                    ELSIF v_rand < 0.98 THEN
                        v_estado_asistencia := 'justificada'; -- justificación ya aprobada
                        v_justificada := TRUE;
                    ELSE
                        v_estado_asistencia := 'ausente'; -- justificación rechazada
                    END IF;

                    INSERT INTO asistencias (sesion_id, matricula_id, estado, justificada, registrado_por, registrado_en)
                    VALUES (v_sesion_id, v_matricula.id, v_estado_asistencia, v_justificada, v_usuario_docente_id, v_fecha + TIME '20:10')
                    RETURNING id INTO v_asistencia_id;

                    IF v_estado_asistencia = 'justificada' THEN
                        INSERT INTO justificaciones (asistencia_id, motivo, estado_revision, revisado_por, revisado_en, comentarios_revision)
                        VALUES (v_asistencia_id, 'Certificado médico presentado en secretaría (dato de demostración).', 'aprobada', v_usuario_secretaria_id, v_fecha + TIME '09:00', 'Documentación válida.');
                    ELSIF v_rand >= 0.88 AND v_rand < 0.92 THEN
                        INSERT INTO justificaciones (asistencia_id, motivo, estado_revision)
                        VALUES (v_asistencia_id, 'Constancia laboral presentada (dato de demostración, pendiente de revisión).', 'pendiente');
                    ELSIF v_rand >= 0.98 THEN
                        INSERT INTO justificaciones (asistencia_id, motivo, estado_revision, revisado_por, revisado_en, comentarios_revision)
                        VALUES (v_asistencia_id, 'Justificación presentada fuera de plazo (dato de demostración).', 'rechazada', v_usuario_secretaria_id, v_fecha + TIME '09:00', 'Fuera del plazo de 48 horas.');
                    END IF;
                END LOOP;
            END IF;
            v_fecha := v_fecha + 1;
        END LOOP;
    END LOOP;

    -- -------------------------------------------------------------
    -- 1.7) ALERTAS DE ASISTENCIA para matrículas en riesgo/irregulares
    --      (el % y estado académico ya fueron recalculados por el
    --      trigger trg_asistencias_recalculo al insertar las asistencias)
    -- -------------------------------------------------------------
    INSERT INTO alertas_asistencia (matricula_id, tipo_alerta, faltas_acumuladas, umbral_porcentaje, generado_por, estado)
    SELECT m.id,
           CASE WHEN m.estado_academico = 'irregular' THEN 'critica' ELSE 'riesgo' END::tipo_alerta_asistencia,
           m.faltas_acumuladas,
           m.porcentaje_asistencia,
           v_usuario_secretaria_id,
           'pendiente'
    FROM matriculas m
    WHERE m.curso_id IN (v_curso1_id, v_curso2_id)
      AND m.estado_academico IN ('en_riesgo', 'irregular');

    -- -------------------------------------------------------------
    -- 1.8) EVENTOS DE AUDITORÍA ILUSTRATIVOS (para el módulo Auditoría)
    -- -------------------------------------------------------------
    INSERT INTO auditoria_eventos (fecha_hora, actor_usuario_id, actor_email, actor_username, actor_roles, modulo, accion, recurso_tipo, recurso_resumen, resultado, severidad, detalle)
    VALUES
        (NOW() - INTERVAL '6 days', v_usuario_admin_id, 'admin.demo@ung.edu.py', 'admin.demo', ARRAY['Administrador General'], 'auth', 'login', 'sesion', 'Inicio de sesión exitoso', 'ok', 'baja', '{"origen": "demo"}'),
        (NOW() - INTERVAL '5 days', v_usuario_secretaria_id, 'secretaria.demo@ung.edu.py', 'secretaria.demo', ARRAY['Secretaría Académica'], 'academico', 'crear_curso', 'curso', 'Bases de Datos II — Laboratorio 3', 'ok', 'media', '{"origen": "demo"}'),
        (NOW() - INTERVAL '4 days', v_usuario_docente_id, 'docente.demo@ung.edu.py', 'docente.demo', ARRAY['Docente'], 'asistencias', 'registrar_lote', 'sesion_clase', 'Registro de planilla del día', 'ok', 'baja', '{"origen": "demo"}'),
        (NOW() - INTERVAL '3 days', v_usuario_secretaria_id, 'secretaria.demo@ung.edu.py', 'secretaria.demo', ARRAY['Secretaría Académica'], 'asistencias', 'aprobar_justificacion', 'justificacion', 'Certificado médico aprobado', 'ok', 'media', '{"origen": "demo"}'),
        (NOW() - INTERVAL '2 days', v_usuario_admin_id, 'admin.demo@ung.edu.py', 'admin.demo', ARRAY['Administrador General'], 'usuarios', 'crear', 'usuario', 'Alta de usuario de prueba', 'ok', 'alta', '{"origen": "demo"}'),
        (NOW() - INTERVAL '1 days', v_usuario_docente_id, 'docente.demo@ung.edu.py', 'docente.demo', ARRAY['Docente'], 'reportes', 'generar_pdf', 'informe_alumno', 'Informe individual generado', 'ok', 'baja', '{"origen": "demo"}'),
        (NOW() - INTERVAL '10 hours', v_usuario_secretaria_id, 'secretaria.demo@ung.edu.py', 'secretaria.demo', ARRAY['Secretaría Académica'], 'reportes', 'cierre_mensual', 'curso', 'Intento de cierre con datos incompletos', 'error', 'alta', '{"origen": "demo", "motivo": "faltan_sesiones_por_cerrar"}'),
        (NOW() - INTERVAL '2 hours', v_usuario_admin_id, 'admin.demo@ung.edu.py', 'admin.demo', ARRAY['Administrador General'], 'auth', 'login', 'sesion', 'Inicio de sesión exitoso', 'ok', 'baja', '{"origen": "demo"}');

END;
$$ LANGUAGE plpgsql;

COMMIT;

-- =====================================================================
-- RESUMEN DE ACCESOS DE DEMOSTRACIÓN (misma contraseña para los 3):
--
--   Administrador General   -> admin.demo@ung.edu.py       | Demo123456!
--   Secretaría Académica    -> secretaria.demo@ung.edu.py  | Demo123456!
--   Docente                 -> docente.demo@ung.edu.py     | Demo123456!
--
-- Estas credenciales solo existen en la base de datos de demostración
-- aislada y no tienen ninguna relación con el sistema productivo real.
-- =====================================================================
