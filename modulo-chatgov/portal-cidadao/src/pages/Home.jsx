import React, { useState } from 'react';
import { T } from '../theme.js';
import { api, setToken } from '../api.js';
import { useLogado } from './LogadoContext.jsx';

const inputStyle = (erro) => ({
  width: '100%', boxSizing: 'border-box', padding: '14px 16px', fontSize: 15,
  borderRadius: T.radiusSm, border: `1.5px solid ${erro ? T.danger : T.borderStrong}`,
  background: T.surfaceAlt, color: T.text, outline: 'none', fontFamily: T.font,
  transition: 'border-color 0.15s',
});

export function Home({ navigate }) {
  const { conta, login, logout } = useLogado();
  // O QR Code do comprovante aponta para ?protocolo=NNNN: já chega com o
  // número preenchido, restando ao cidadão informar o código de acesso.
  const [numero, setNumero] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('protocolo') || '';
    } catch { return ''; }
  });
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  // Login como conta cadastrada
  const [emailLogin, setEmailLogin] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');
  const [erroLogin, setErroLogin] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);

  const consultar = async (e) => {
    e.preventDefault();
    if (!numero.trim() || !senha.trim()) return;
    setLoading(true); setErro('');
    try {
      const data = await api.acessar(numero.trim(), senha.trim());
      setToken(data.token);
      navigate(`protocolo/${data.protocolo_id}`);
    } catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  };

  const fazerLogin = async (e) => {
    e.preventDefault();
    setLoadingLogin(true); setErroLogin('');
    try {
      const data = await api.login(emailLogin.trim(), senhaLogin);
      login(data.token, { nome: data.nome, email: data.email, conta_id: data.conta_id });
      navigate('meus-protocolos');
    } catch (e) { setErroLogin(e.message); }
    finally { setLoadingLogin(false); }
  };

  return React.createElement('div', {
    style: { maxWidth: T.maxWidth, margin: '0 auto', padding: '40px 20px', display: 'flex', flexDirection: 'column', gap: 32 },
  },
    // Header institucional
    React.createElement('div', { style: { textAlign: 'center' } },
      React.createElement('div', {
        style: { width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #2563EB, #4F46E5)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(37,99,235,0.3)' },
      }, React.createElement('span', { style: { fontSize: 32, color: '#fff', fontWeight: 800 } }, 'PD')),
      React.createElement('h1', { style: { fontSize: 26, fontWeight: 800, color: T.text, margin: '16px 0 4px' } }, 'Protocolo Digital'),
      React.createElement('p', { style: { fontSize: 14, color: T.textSecondary, margin: 0 } }, 'Consulte e acompanhe suas solicitações'),
    ),

    // Seção: Consultar protocolo
    React.createElement('div', {
      style: { background: T.surface, borderRadius: T.radiusLg, padding: 28, boxShadow: T.shadowMd, border: `1px solid ${T.border}` },
    },
      React.createElement('h2', { style: { fontSize: 18, fontWeight: 700, color: T.text, margin: '0 0 6px' } }, 'Consultar protocolo'),
      React.createElement('p', { style: { fontSize: 13, color: T.textMuted, margin: '0 0 20px' } }, 'Informe o número do protocolo e o código de acesso recebido'),

      React.createElement('form', { onSubmit: consultar },
        React.createElement('input', {
          value: numero, onChange: (e) => setNumero(e.target.value),
          placeholder: 'Número do protocolo (ex: 2026-08-000001)',
          autoFocus: true, style: { ...inputStyle(false), marginBottom: 10 },
        }),
        React.createElement('input', {
          type: 'password', value: senha, onChange: (e) => setSenha(e.target.value),
          placeholder: 'Código de acesso',
          style: { ...inputStyle(!!erro), marginBottom: erro ? 8 : 16 },
        }),
        erro && React.createElement('div', {
          style: { fontSize: 12.5, color: T.danger, background: T.dangerSoft, padding: '8px 12px', borderRadius: T.radiusSm, marginBottom: 12 },
        }, erro),
        React.createElement('button', {
          type: 'submit', disabled: loading,
          style: {
            width: '100%', padding: '14px', borderRadius: T.radiusSm, border: 'none',
            background: loading ? T.surfaceMuted : T.primary, color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
          },
        }, loading ? 'Consultando...' : 'Consultar protocolo'),
      ),
    ),

    // Seção: Login conta cadastrada
    !conta && React.createElement('div', {
      style: { background: T.surface, borderRadius: T.radiusLg, padding: 28, boxShadow: T.shadowMd, border: `1px solid ${T.border}` },
    },
      React.createElement('h2', { style: { fontSize: 18, fontWeight: 700, color: T.text, margin: '0 0 6px' } }, 'Minha conta'),
      React.createElement('p', { style: { fontSize: 13, color: T.textMuted, margin: '0 0 20px' } }, 'Acesse com e-mail e senha para ver todos os seus protocolos'),

      React.createElement('form', { onSubmit: fazerLogin },
        React.createElement('input', {
          type: 'email', value: emailLogin, onChange: (e) => setEmailLogin(e.target.value),
          placeholder: 'E-mail', autoComplete: 'email',
          style: { ...inputStyle(false), marginBottom: 10 },
        }),
        React.createElement('input', {
          type: 'password', value: senhaLogin, onChange: (e) => setSenhaLogin(e.target.value),
          placeholder: 'Senha', autoComplete: 'current-password',
          style: { ...inputStyle(false), marginBottom: erroLogin ? 8 : 16 },
        }),
        erroLogin && React.createElement('div', {
          style: { fontSize: 12.5, color: T.danger, background: T.dangerSoft, padding: '8px 12px', borderRadius: T.radiusSm, marginBottom: 12 },
        }, erroLogin),
        React.createElement('button', {
          type: 'submit', disabled: loadingLogin,
          style: {
            width: '100%', padding: '14px', borderRadius: T.radiusSm, border: 'none',
            background: loadingLogin ? T.surfaceMuted : T.success, color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: loadingLogin ? 'default' : 'pointer',
            marginBottom: 12,
          },
        }, loadingLogin ? 'Entrando...' : 'Entrar'),
        React.createElement('button', {
          type: 'button', onClick: () => navigate('criar-conta'),
          style: {
            width: '100%', padding: '12px', borderRadius: T.radiusSm,
            border: `1.5px solid ${T.primary}`, background: 'transparent',
            color: T.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          },
        }, 'Criar minha conta'),
      ),
    ),

    // Seção: Links rápidos
    React.createElement('div', {
      style: { background: T.surface, borderRadius: T.radiusLg, padding: 28, boxShadow: T.shadowMd, border: `1px solid ${T.border}` },
    },
      React.createElement('h2', { style: { fontSize: 18, fontWeight: 700, color: T.text, margin: '0 0 16px' } }, 'Acesso rápido'),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        React.createElement('button', {
          onClick: () => navigate('nova-solicitacao'),
          style: {
            width: '100%', padding: '12px 16px', borderRadius: T.radiusSm, border: 'none',
            background: T.primarySoft, color: T.primary, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', textAlign: 'left',
          },
        }, '+ Nova solicitação'),
        conta && React.createElement('button', {
          onClick: () => navigate('meus-protocolos'),
          style: {
            width: '100%', padding: '12px 16px', borderRadius: T.radiusSm, border: 'none',
            background: T.successSoft, color: T.success, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', textAlign: 'left',
          },
        }, 'Meus protocolos'),
        conta && React.createElement('button', {
          onClick: logout,
          style: {
            width: '100%', padding: '12px 16px', borderRadius: T.radiusSm, border: 'none',
            background: T.surfaceMuted, color: T.textSecondary, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', textAlign: 'left',
          },
        }, `Sair (${conta.nome})`),
      ),
    ),

    // Rodapé
    React.createElement('div', {
      style: { textAlign: 'center', fontSize: 12, color: T.textMuted, paddingTop: 8 },
    },
      React.createElement('p', { style: { margin: '0 0 4px' } }, 'Protocolo Digital — Portal do Cidadão'),
      React.createElement('p', { style: { margin: 0 } }, 'Política de Privacidade · Acessibilidade · Contato'),
    ),
  );
}
