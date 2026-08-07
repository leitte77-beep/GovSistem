import React, { useState } from 'react';
import { T } from '../theme.js';
import { useLogado } from './LogadoContext.jsx';

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '14px 16px', fontSize: 14,
  borderRadius: T.radiusSm, border: `1.5px solid ${T.borderStrong}`,
  background: T.surfaceAlt, color: T.text, outline: 'none', fontFamily: T.font,
  marginBottom: 12,
};

export function CriarConta({ navigate }) {
  const { login } = useLogado();
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const criar = async (e) => {
    e.preventDefault();
    setErro('');
    if (senha !== confirmarSenha) { setErro('Senhas não conferem'); return; }
    if (senha.length < 6) { setErro('A senha deve ter no mínimo 6 caracteres'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/public/protocols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          cpf: cpf.trim() || undefined,
          telefone: telefone.trim() || undefined,
          email: email.trim(),
          servico_id: null,
          assunto: 'Cadastro de usuário',
          criar_conta: true,
          senha_conta: senha,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erro || 'Erro ao criar conta');

      // Login automático após cadastro
      const loginRes = await fetch('/api/v1/public/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), senha }),
      });
      const loginData = await loginRes.json().catch(() => ({}));
      if (loginRes.ok && loginData.token) {
        login(loginData.token, { nome: loginData.nome || nome, email, conta_id: loginData.conta_id });
        navigate('meus-protocolos');
      } else {
        navigate('');
      }
    } catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  };

  return React.createElement('div', {
    style: { maxWidth: T.maxWidth, margin: '0 auto', padding: '20px' },
  },
    React.createElement('div', { style: { textAlign: 'center', marginBottom: 20 } },
      React.createElement('button', {
        onClick: () => navigate(''),
        style: { background: 'none', border: 'none', color: T.primary, fontSize: 14, cursor: 'pointer', fontWeight: 600, padding: '8px' },
      }, '← Voltar'),
      React.createElement('h1', { style: { fontSize: 22, fontWeight: 800, color: T.text, margin: '8px 0 4px' } }, 'Criar minha conta'),
      React.createElement('p', { style: { fontSize: 13, color: T.textMuted, margin: 0 } }, 'Cadastre-se para centralizar seus protocolos'),
    ),

    React.createElement('form', {
      onSubmit: criar,
      style: { background: T.surface, borderRadius: T.radiusLg, padding: 28, boxShadow: T.shadowMd, border: `1px solid ${T.border}` },
    },
      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4 } }, 'Nome completo *'),
      React.createElement('input', { value: nome, onChange: (e) => setNome(e.target.value), placeholder: 'Seu nome completo', required: true, style: inputStyle }),

      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4 } }, 'CPF'),
      React.createElement('input', { value: cpf, onChange: (e) => setCpf(e.target.value), placeholder: '000.000.000-00', style: inputStyle }),

      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4 } }, 'Telefone'),
      React.createElement('input', { value: telefone, onChange: (e) => setTelefone(e.target.value), placeholder: '(00) 00000-0000', style: inputStyle }),

      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4 } }, 'E-mail *'),
      React.createElement('input', { type: 'email', value: email, onChange: (e) => setEmail(e.target.value), placeholder: 'seu@email.com', required: true, autoComplete: 'email', style: inputStyle }),

      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4 } }, 'Senha *'),
      React.createElement('input', { type: 'password', value: senha, onChange: (e) => setSenha(e.target.value), placeholder: 'Mínimo 6 caracteres', required: true, autoComplete: 'new-password', style: inputStyle }),

      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4 } }, 'Confirmar senha *'),
      React.createElement('input', { type: 'password', value: confirmarSenha, onChange: (e) => setConfirmarSenha(e.target.value), placeholder: 'Digite a senha novamente', required: true, style: { ...inputStyle, marginBottom: 16 } }),

      erro && React.createElement('div', {
        style: { fontSize: 12.5, color: T.danger, background: T.dangerSoft, padding: '10px 12px', borderRadius: T.radiusSm, marginBottom: 12 },
      }, erro),

      React.createElement('button', {
        type: 'submit', disabled: loading,
        style: {
          width: '100%', padding: '14px', borderRadius: T.radiusSm, border: 'none',
          background: loading ? T.surfaceMuted : T.primary, color: '#fff',
          fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
        },
      }, loading ? 'Criando conta...' : 'Criar conta'),
    ),
  );
}
