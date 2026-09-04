import { Router } from 'express';
import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';

const opcional = z.string().trim().nullish();

/**
 * Colaboradores. O salário alimenta o custo do minuto do setor, então a
 * listagem já traz o vínculo com o departamento para conferência rápida.
 */
export const router = crudRouter({
  tabela: 'colaboradores',
  campos: [
    'nome', 'cpf', 'cargo', 'departamento_id', 'data_admissao', 'salario',
    'vale_transporte', 'produtivo', 'telefone', 'email', 'status', 'observacao', 'ativo',
  ],
  schema: z.object({
    nome: z.string().trim().min(1),
    cpf: opcional,
    cargo: opcional,
    departamento_id: z.number().int().nullish(),
    data_admissao: opcional,
    salario: z.number().min(0).optional(),
    vale_transporte: z.number().min(0).optional(),
    produtivo: z.number().int().optional(),
    telefone: opcional,
    email: opcional,
    status: z.enum(['ATIVO', 'AFASTADO', 'INATIVO']).optional(),
    observacao: opcional,
    ativo: z.number().int().optional(),
  }),
  listaSql: `SELECT c.*, d.nome AS departamento FROM colaboradores c
             LEFT JOIN departamentos d ON d.id = c.departamento_id`,
  ordem: 'c.nome',
  busca: ['c.nome', 'c.cargo', 'c.cpf'],
});
