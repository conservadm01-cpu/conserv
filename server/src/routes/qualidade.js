import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/errors.js';
import { exigir } from '../middleware/auth.js';
import {
  duplicatasClientes, mesclarClientes, nomesSuspeitos, corrigirNome,
  pedidosParados, encerrarPedidos, datasInvertidas, corrigirEntrega,
  pedidosDuplicados, cancelarPedidos, resumoQualidade,
} from '../services/qualidade.js';

export const router = Router();
const podeCorrigir = exigir('qualidade');

router.get('/resumo', asyncHandler((_req, res) => res.json(resumoQualidade())));

router.get(
  '/duplicatas',
  asyncHandler((req, res) =>
    res.json(duplicatasClientes({ incluirParecidos: req.query.parecidos !== 'false' })))
);

router.post(
  '/duplicatas/mesclar',
  podeCorrigir,
  asyncHandler((req, res) => {
    const { manter, juntar } = z
      .object({ manter: z.number().int(), juntar: z.array(z.number().int()).min(1) })
      .parse(req.body);
    res.json(mesclarClientes(manter, juntar));
  })
);

router.get('/nomes', asyncHandler((_req, res) => res.json(nomesSuspeitos())));

router.put(
  '/nomes/:id',
  podeCorrigir,
  asyncHandler((req, res) => {
    const { nome } = z.object({ nome: z.string().trim().min(1) }).parse(req.body);
    res.json(corrigirNome(Number(req.params.id), nome));
  })
);

router.get(
  '/parados',
  asyncHandler((req, res) => res.json(pedidosParados({ dias: Number(req.query.dias) || 180 })))
);

router.post(
  '/parados/encerrar',
  podeCorrigir,
  asyncHandler((req, res) => {
    const { ids } = z.object({ ids: z.array(z.number().int()).min(1) }).parse(req.body);
    res.json(encerrarPedidos(ids));
  })
);

router.get('/datas', asyncHandler((_req, res) => res.json(datasInvertidas())));

router.put(
  '/datas/:itemId',
  podeCorrigir,
  asyncHandler((req, res) => {
    const { data } = z.object({ data: z.string().trim() }).parse(req.body);
    res.json(corrigirEntrega(Number(req.params.itemId), data));
  })
);

router.get('/pedidos-repetidos', asyncHandler((_req, res) => res.json(pedidosDuplicados())));

router.post(
  '/pedidos-repetidos/cancelar',
  podeCorrigir,
  asyncHandler((req, res) => {
    const { ids } = z.object({ ids: z.array(z.number().int()).min(1) }).parse(req.body);
    res.json(cancelarPedidos(ids));
  })
);
