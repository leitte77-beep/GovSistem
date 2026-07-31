import React, { useState, useEffect } from 'react';
import { X, Send, Phone, User, Building2, MessageSquare } from 'lucide-react';
import { T } from '../theme';
import { iniciarConversa } from '../api';

export function ModalNovaConversa({ departamentos, onClose, onCriada }) {
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [departamentoId, setDepartamentoId] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const submeter = async () => {
    setErro('');
    if (telefone.replace(/\D/g, '').length < 10) { setErro('Informe um telefone válido com DDD.'); return; }
    setEnviando(true);
    try {
      const conv = await iniciarConversa({
        telefone, nome: nome.trim() || null,
        departamento_id: departamentoId || null, mensagem: mensagem.trim() || null,
      });
      onCriada(conv);
    } catch (e) {
      setErro(e.message || 'Erro ao iniciar conversa.');
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const inputComIcone = (icone, props) =>
    React.createElement('div', {
      style: { position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 14 },
    },
      React.createElement(icone, {
        size: 18,
        style: { position: 'absolute', left: 14, color: T.textMuted, pointerEvents: 'none', zIndex: 1 },
      }),
      React.createElement(props.tag || 'input', {
        ...props,
        style: {
          width: '100%', padding: '12px 14px 12px 44px',
          background: T.surfaceMuted, border: `1px solid ${T.border}`,
          borderRadius: T.radius, color: T.text, fontSize: 14, outline: 'none',
          fontFamily: 'inherit', boxSizing: 'border-box',
          transition: 'background 0.15s, box-shadow 0.15s',
          resize: props.tag === 'textarea' ? 'vertical' : 'none',
          ...(props.style || {}),
        },
      }),
    );

  return React.createElement('div', {
    onClick: (e) => { if (e.target === e.currentTarget) onClose(); },
    style: {
      position: 'fixed', inset: 0, background: 'rgba(25,28,29,0.4)', backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    },
  },
    React.createElement('div', {
      style: {
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: T.radiusLg, padding: 0, maxWidth: 500, width: '100%',
        boxShadow: '0 24px 80px rgba(0,0,0,0.18)', overflow: 'hidden',
        animation: 'modalnova-entrada 0.25s ease-out',
      },
    },
      // ── Cabeçalho ──
      React.createElement('div', {
        style: { padding: '24px 24px 16px', display: 'flex', alignItems: 'center', gap: 14 },
      },
        React.createElement('div', {
          style: {
            width: 48, height: 48, borderRadius: 12,
            background: T.primaryGradient,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 8px 24px ${T.primary}40`, flexShrink: 0,
          },
        }, React.createElement(MessageSquare, { size: 24, color: '#fff' })),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('h3', { style: { fontSize: 18, fontWeight: 700, color: T.text, margin: 0 } }, 'Nova conversa'),
          React.createElement('p', { style: { fontSize: 12, color: T.textMuted, margin: '2px 0 0', fontWeight: 500 } },
            'Inicie um novo atendimento via WhatsApp'),
        ),
        React.createElement('button', {
          onClick: onClose,
          style: { background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4, display: 'flex', borderRadius: '50%' },
        }, React.createElement(X, { size: 20 })),
      ),

      // ── Formulário ──
      React.createElement('div', { style: { padding: '8px 24px 0' } },
        React.createElement('label', {
          style: { fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
        }, 'Telefone (com DDD) *'),
        inputComIcone(Phone, {
          value: telefone, onChange: (e) => setTelefone(e.target.value),
          placeholder: '44 99999-9999', type: 'tel',
        }),

        React.createElement('label', {
          style: { fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
        }, 'Nome do contato'),
        inputComIcone(User, {
          value: nome, onChange: (e) => setNome(e.target.value),
          placeholder: 'Ex: João da Silva',
        }),

        React.createElement('label', {
          style: { fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
        }, 'Secretaria / Departamento'),
        inputComIcone(Building2, {
          tag: 'select', value: departamentoId, onChange: (e) => setDepartamentoId(e.target.value),
          style: { cursor: 'pointer', appearance: 'auto' },
          children: [
            React.createElement('option', { key: '', value: '' }, 'Sem encaminhamento'),
            ...departamentos.map((d) =>
              React.createElement('option', { key: d.id, value: d.id },
                d.secretaria_nome ? `${d.secretaria_nome} › ${d.nome}` : d.nome)),
          ],
        }),

        React.createElement('label', {
          style: { fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
        }, 'Primeira mensagem'),
        inputComIcone(Send, {
          tag: 'textarea', value: mensagem, onChange: (e) => setMensagem(e.target.value),
          placeholder: 'Opcional — enviada agora pelo WhatsApp', rows: 3,
          style: { minHeight: 60, paddingTop: 12 },
        }),

        erro && React.createElement('div', {
          style: { padding: '10px 14px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 13, marginBottom: 14 },
        }, erro),
      ),

      // ── Rodapé ──
      React.createElement('div', {
        style: {
          padding: '20px 24px', display: 'flex', justifyContent: 'flex-end', gap: 10,
          background: 'rgba(0,0,0,0.02)', borderTop: `1px solid ${T.border}`,
        },
      },
        React.createElement('button', {
          onClick: onClose,
          style: {
            padding: '11px 24px', borderRadius: T.radius, border: `1px solid ${T.borderStrong}`,
            background: 'transparent', color: T.textSecondary, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', transition: 'background 0.15s',
          },
        }, 'Cancelar'),
        React.createElement('button', {
          onClick: submeter, disabled: enviando,
          style: {
            padding: '11px 28px', borderRadius: T.radius, border: 'none',
            background: T.primaryGradient, color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: enviando ? 'not-allowed' : 'pointer', opacity: enviando ? 0.7 : 1,
            boxShadow: `0 4px 16px ${T.primary}40`, transition: 'all 0.15s',
          },
        }, enviando ? 'Iniciando...' : 'Iniciar conversa'),
      ),
    ),

    // Animação de entrada
    React.createElement('style', null, `
      @keyframes modalnova-entrada {
        from { opacity: 0; transform: translateY(24px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `),
  );
}
