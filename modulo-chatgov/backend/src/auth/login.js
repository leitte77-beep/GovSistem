import express from 'express';
import bcrypt from 'bcrypt';
import db from '../db.js';
import { signToken } from './jwt.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
    }

    const operador = await db.oneOrNone(
      `SELECT o.id, o.nome, o.email, o.senha_hash, o.papel, o.tenant_id, t.nome as tenant_nome, t.slug as tenant_slug
       FROM operadores o
       JOIN tenants t ON t.id = o.tenant_id
       WHERE o.email = $1 AND t.ativo = true`,
      [email.toLowerCase().trim()]
    );

    if (!operador) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const valido = await bcrypt.compare(senha, operador.senha_hash);
    if (!valido) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const token = signToken({
      sub: operador.id,
      nome: operador.nome,
      email: operador.email,
      papel: operador.papel,
      tenantId: operador.tenant_id,
      tenantNome: operador.tenant_nome,
      tenantSlug: operador.tenant_slug,
    });

    return res.json({
      token,
      operador: {
        id: operador.id,
        nome: operador.nome,
        email: operador.email,
        papel: operador.papel,
        tenantId: operador.tenant_id,
        tenantNome: operador.tenant_nome,
        tenantSlug: operador.tenant_slug,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

export default router;
