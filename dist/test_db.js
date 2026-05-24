"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const conexion_supabase_1 = require("./database/conexion_supabase");
console.log('Iniciando prueba de conexión...');
(0, conexion_supabase_1.probarConexion)()
    .then(() => console.log('Prueba finalizada con éxito.'))
    .catch((err) => console.error('Error en la prueba:', err));
