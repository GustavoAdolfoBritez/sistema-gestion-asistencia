"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPdfDocumentToBuffer = renderPdfDocumentToBuffer;
const pdfkit_1 = __importDefault(require("pdfkit"));
/** Captura la salida de pdfkit en RAM usando eventos `data` + Buffer.concat (sin disco). */
function renderPdfDocumentToBuffer(build, options) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default(options);
        const chunks = [];
        doc.on('data', (chunk) => {
            chunks.push(chunk);
        });
        doc.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
        doc.on('error', reject);
        try {
            build(doc);
            doc.end();
        }
        catch (error) {
            reject(error);
        }
    });
}
