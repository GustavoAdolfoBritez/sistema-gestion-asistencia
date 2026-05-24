"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../../config/database");
const router = (0, express_1.Router)();
router.get('/health', async (_req, res, next) => {
    try {
        await (0, database_1.comprobarConexion)();
        res.json({ estado: 'ok', baseDatos: 'operativa' });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
