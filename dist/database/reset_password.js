"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const conexion_supabase_1 = require("./conexion_supabase");
async function main() {
    const [, , username, newPassword] = process.argv;
    if (!username || !newPassword) {
        console.error('Uso: npx ts-node database/reset_password.ts <username> <nueva_contraseña>');
        process.exit(1);
    }
    const hash = await bcryptjs_1.default.hash(newPassword, 12);
    const { rowCount } = await conexion_supabase_1.pool.query('UPDATE usuarios SET password_hash = $1 WHERE usuario = $2', [hash, username]);
    if (!rowCount) {
        console.error(`No se encontró un usuario con username "${username}".`);
        process.exit(1);
    }
    await conexion_supabase_1.pool.end();
    console.log(`Contraseña actualizada para ${username}.`);
}
main().catch((error) => {
    console.error('Error al actualizar la contraseña:', error instanceof Error ? error.message : error);
    process.exit(1);
});
