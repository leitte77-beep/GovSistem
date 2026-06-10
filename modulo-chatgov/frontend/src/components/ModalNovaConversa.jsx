import React, { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { T } from '../theme';
import { iniciarConversa } from '../api';

const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,26,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const card = { background: T.surface, borderRadius: T.radiusLg, padding: 24, maxWidth: 460, width: '90%', boxShadow: T.shadowLg };
const label = { fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 5, display: 'block' };
const input = { width: '100%', padding: '11px 13px', background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 14 };

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

  return React.createElement('div', { style: overlay },
    React.createElement('div', { style: card },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 } },
        React.createElement('div', { style: { width: 38, height: 38, borderRadius: 10, background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          React.createElement(MessageSquarePlus, { size: 20, color: T.primary })),
        React.createElement('h3', { style: { fontSize: 18, fontWeight: 700, color: T.text } }, 'Nova conversa'),
      ),

      React.createElement('label', { style: label }, 'Telefone (com DDD) *'),
      React.createElement('input', {
        value: telefone, onChange: (e) => setTelefone(e.target.value),
        placeholder: '44 99999-9999', style: input,
      }),

      React.createElement('label', { style: label }, 'Nome do contato'),
      React.createElement('input', { value: nome, onChange: (e) => setNome(e.target.value), placeholder: 'Opcional', style: input }),

      React.createElement('label', { style: label }, 'Secretaria / Departamento'),
      React.createElement('select', {
        value: departamentoId, onChange: (e) => setDepartamentoId(e.target.value), style: input,
      },
        React.createElement('option', { value: '' }, 'Sem encaminhamento'),
        departamentos.map((d) => React.createElement('option', { key: d.id, value: d.id },
          d.secretaria_nome ? `${d.secretaria_nome} › ${d.nome}` : d.nome)),
      ),

      React.createElement('label', { style: label }, 'Primeira mensagem'),
      React.createElement('textarea', {
        value: mensagem, onChange: (e) => setMensagem(e.target.value),
        placeholder: 'Opcional — enviada agora pelo WhatsApp', rows: 3,
        style: { ...input, resize: 'vertical', fontFamily: T.font },
      }),

      erro && React.createElement('div', { style: { color: T.danger, fontSize: 13, marginBottom: 10 } }, erro),

      React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        React.createElement('button', {
          onClick: onClose,
          style: { background: 'transparent', border: `1px solid ${T.borderStrong}`, color: T.textSecondary, padding: '10px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
        }, 'Cancelar'),
        React.createElement('button', {
          onClick: submeter, disabled: enviando,
          style: { background: T.primary, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: enviando ? 0.6 : 1 },
        }, enviando ? 'Iniciando...' : 'Iniciar conversa'),
      ),
    ),
  );
}
