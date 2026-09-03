import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler, badRequest } from '../lib/errors.js';
import { importarPlanilha } from '../import/planilha.js';

export const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xlsm)$/i.test(file.originalname);
    cb(ok ? null : badRequest('Envie um arquivo .xlsx ou .xlsm'), ok);
  },
});

const opcoes = z.object({
  abas: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? null : Array.isArray(v) ? v : v.split(',').map((s) => s.trim()))),
  abrir_ordens: z.coerce.boolean().default(true),
  simular: z.coerce.boolean().default(false),
});

router.post(
  '/planilha',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Nenhum arquivo enviado (campo "arquivo")');
    const { abas, abrir_ordens, simular } = opcoes.parse(req.body ?? {});
    const relatorio = await importarPlanilha(req.file.buffer, {
      abas,
      abrirOrdens: abrir_ordens,
      simular,
    });
    res.json({ ...relatorio, arquivo: req.file.originalname });
  })
);
