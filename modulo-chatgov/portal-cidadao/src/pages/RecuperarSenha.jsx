import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  KeyRound,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { PortalHeader, SecurityNote } from '../components/PortalChrome.jsx';
import { api } from '../api.js';

export function RecuperarSenha({ navigate }) {
  const [passo, setPasso] = useState(1); // 1=email, 2=codigo, 3=nova senha
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [loading, setLoading] = useState(false);

  const solicitarCodigo = async (e) => {
    e.preventDefault();
    setErro('');
    if (!email.trim()) { setErro('Informe o e-mail da sua conta.'); return; }
    setLoading(true);
    try {
      await api.forgotPassword(email.trim());
      setPasso(2);
    } catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  };

  const verificarCodigo = async (e) => {
    e.preventDefault();
    setErro('');
    if (!token.trim() || token.trim().length < 4) { setErro('Informe o código de 6 dígitos.'); return; }
    setPasso(3);
  };

  const redefinirSenha = async (e) => {
    e.preventDefault();
    setErro('');
    if (novaSenha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (novaSenha !== confirmarSenha) { setErro('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      await api.resetPassword(email.trim(), token.trim(), novaSenha);
      setSucesso(true);
    } catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  };

  return React.createElement('div', { className: 'pd-app' },
    React.createElement(PortalHeader, { navigate, back: true }),
    React.createElement('main', { className: 'pd-register' },
      React.createElement('div', { className: 'pd-register__main' },
        React.createElement('section', { className: 'pd-register-copy' },
          React.createElement('div', { className: 'pd-eyebrow' }, 'Recuperação de senha'),
          React.createElement('h1', null, 'Esqueceu', React.createElement('br'), 'sua senha?'),
          React.createElement('p', null, 'Não se preocupe. Enviaremos um código de recuperação para o e-mail cadastrado na sua conta.'),
          React.createElement('ul', { className: 'pd-benefits' },
            passo >= 2
              ? React.createElement('li', null, React.createElement('span', { className: 'pd-benefits__icon' }, React.createElement(CheckCircle, { size: 16 })), React.createElement('span', null, 'Código enviado para ', React.createElement('strong', null, email)))
              : React.createElement('li', null, React.createElement('span', { className: 'pd-benefits__icon', style: { background: '#eaf0ff', color: 'var(--pd-blue)' } }, React.createElement(Mail, { size: 16 })), React.createElement('span', null, 'Informe o e-mail da sua conta')),
            passo >= 3
              ? React.createElement('li', null, React.createElement('span', { className: 'pd-benefits__icon' }, React.createElement(CheckCircle, { size: 16 })), React.createElement('span', null, 'Código verificado'))
              : React.createElement('li', null, React.createElement('span', { className: 'pd-benefits__icon', style: { background: '#fef3e2', color: '#d97706' } }, React.createElement(KeyRound, { size: 16 })), React.createElement('span', null, 'Digite o código de 6 dígitos')),
            React.createElement('li', null, React.createElement('span', { className: 'pd-benefits__icon', style: { background: passo >= 3 ? '#dcf7e9' : '#f3f4f6', color: passo >= 3 ? 'var(--pd-success)' : '#9ca3af' } }, React.createElement(ShieldCheck, { size: 16 })), React.createElement('span', null, 'Crie uma nova senha')),
          ),
        ),

        React.createElement('section', { className: 'pd-register-card', 'aria-labelledby': 'rec-title' },

          // Step header
          React.createElement('div', { className: 'pd-register-card__head' },
            React.createElement('div', null,
              React.createElement('h2', { id: 'rec-title' },
                passo === 1 ? 'Recuperar senha' : passo === 2 ? 'Verificar código' : 'Nova senha'),
              React.createElement('p', null,
                passo === 1 ? 'Informe o e-mail cadastrado.' :
                passo === 2 ? 'Digite o código de 6 dígitos enviado ao seu e-mail.' :
                'Crie uma senha forte para sua conta.'),
            ),
            React.createElement('span', { className: 'pd-step-badge' }, 'Passo ' + passo + '/3'),
          ),

          // Form content
          React.createElement('div', { className: 'pd-register-form' },

            passo === 1 && React.createElement('form', { onSubmit: solicitarCodigo },
              React.createElement('div', { className: 'pd-form-section' },
                React.createElement('div', { className: 'pd-form-grid' },
                  React.createElement('label', { className: 'pd-field pd-field--full' },
                    React.createElement('span', { className: 'pd-field__label' }, 'E-mail da conta'),
                    React.createElement('span', { className: 'pd-input-wrap' },
                      React.createElement(Mail, { size: 18, 'aria-hidden': true }),
                      React.createElement('input', {
                        className: 'pd-input pd-input--icon', type: 'email',
                        value: email, onChange: (e) => setEmail(e.target.value),
                        placeholder: 'voce@email.com', autoComplete: 'email', required: true, autoFocus: true,
                      }),
                    ),
                  ),
                ),
              ),
              erro && React.createElement('div', { className: 'pd-alert', role: 'alert' }, React.createElement(AlertCircle, { size: 17 }), React.createElement('span', null, erro)),
              React.createElement('div', { className: 'pd-register-actions' },
                React.createElement('button', { className: 'pd-primary-btn', type: 'submit', disabled: loading || !email.trim() },
                  loading ? 'Enviando...' : React.createElement(React.Fragment, null, 'Enviar código de recuperação ', React.createElement(ArrowRight, { size: 17 }))),
                React.createElement('button', {
                  type: 'button', className: 'pd-secondary-btn',
                  style: { marginTop: 10 },
                  onClick: () => navigate('criar-conta'),
                }, 'Criar minha conta'),
              ),
            ),

            passo === 2 && React.createElement('form', { onSubmit: verificarCodigo },
              React.createElement('div', { className: 'pd-form-section' },
                React.createElement('div', { className: 'pd-form-grid' },
                  React.createElement('label', { className: 'pd-field pd-field--full' },
                    React.createElement('span', { className: 'pd-field__label' }, 'Código de verificação'),
                    React.createElement('span', { className: 'pd-input-wrap' },
                      React.createElement(KeyRound, { size: 18, 'aria-hidden': true }),
                      React.createElement('input', {
                        className: 'pd-input pd-input--icon', type: 'text',
                        value: token, onChange: (e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6)),
                        placeholder: '000000', inputMode: 'numeric', autoComplete: 'one-time-code', required: true, autoFocus: true,
                      }),
                    ),
                  ),
                ),
                React.createElement('p', { className: 'pd-form-help' },
                  'Não recebeu? Verifique sua caixa de spam ou ', React.createElement('button', { type: 'button', onClick: () => { setPasso(1); setErro(''); }, style: { color: 'var(--pd-blue)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' } }, 'solicite novo código'), '.'),
              ),
              erro && React.createElement('div', { className: 'pd-alert', role: 'alert' }, React.createElement(AlertCircle, { size: 17 }), React.createElement('span', null, erro)),
              React.createElement('div', { className: 'pd-register-actions' },
                React.createElement('button', { className: 'pd-primary-btn', type: 'submit', disabled: token.length < 4 },
                  'Verificar código ', React.createElement(ArrowRight, { size: 17 })),
              ),
            ),

            passo === 3 && !sucesso && React.createElement('form', { onSubmit: redefinirSenha },
              React.createElement('div', { className: 'pd-form-section' },
                React.createElement('div', { className: 'pd-form-grid' },
                  React.createElement('label', { className: 'pd-field pd-field--full' },
                    React.createElement('span', { className: 'pd-field__label' }, 'Nova senha'),
                    React.createElement('input', {
                      className: 'pd-input', type: 'password',
                      value: novaSenha, onChange: (e) => setNovaSenha(e.target.value),
                      placeholder: 'Mínimo de 6 caracteres', autoComplete: 'new-password', required: true, minLength: 6, autoFocus: true,
                    }),
                  ),
                  React.createElement('label', { className: 'pd-field pd-field--full' },
                    React.createElement('span', { className: 'pd-field__label' }, 'Confirmar nova senha'),
                    React.createElement('input', {
                      className: 'pd-input', type: 'password',
                      value: confirmarSenha, onChange: (e) => setConfirmarSenha(e.target.value),
                      placeholder: 'Repita a senha', autoComplete: 'new-password', required: true, minLength: 6,
                    }),
                  ),
                ),
                React.createElement('p', { className: 'pd-form-help' }, 'Escolha uma senha forte, com pelo menos 6 caracteres, combinando letras e números.'),
              ),
              erro && React.createElement('div', { className: 'pd-alert', role: 'alert' }, React.createElement(AlertCircle, { size: 17 }), React.createElement('span', null, erro)),
              React.createElement('div', { className: 'pd-register-actions' },
                React.createElement('button', { className: 'pd-primary-btn', type: 'submit', disabled: loading || novaSenha.length < 6 || !confirmarSenha },
                  loading ? 'Redefinindo...' : 'Redefinir senha'),
                React.createElement(SecurityNote, null, 'Sua senha é armazenada de forma segura e criptografada.'),
              ),
            ),

            sucesso && React.createElement('div', { style: { textAlign: 'center', padding: '10px 0' } },
              React.createElement('div', {
                style: { width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #d6f5e3, #a3ecc2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' },
              }, React.createElement(CheckCircle, { size: 34, style: { color: 'var(--pd-success)' } })),
              React.createElement('h3', { style: { margin: '0 0 8px', fontFamily: "'Sora', sans-serif", fontSize: 20, color: 'var(--pd-navy)' } }, 'Senha redefinida!'),
              React.createElement('p', { style: { margin: '0 0 24px', color: 'var(--pd-muted)', fontSize: 14 } }, 'Sua senha foi alterada com sucesso. Agora você pode entrar na sua conta.'),
              React.createElement('button', { className: 'pd-primary-btn', onClick: () => navigate('') },
                'Ir para o início ', React.createElement(ArrowRight, { size: 17 })),
            ),
          ),
        ),
      ),
    ),
  );
}
