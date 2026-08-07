import React, { useState, useEffect } from 'react';
import { T } from '../theme.js';
import { api } from '../api.js';

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 14,
  borderRadius: T.radiusSm, border: `1.5px solid ${T.borderStrong}`,
  background: T.surfaceAlt, color: T.text, outline: 'none', fontFamily: T.font,
  marginBottom: 12,
};

const btnPrimary = {
  width: '100%', padding: '14px', borderRadius: T.radiusSm, border: 'none',
  background: T.primary, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
};

export function NovaSolicitacao({ navigate, servicoId }) {
  const [passo, setPasso] = useState(1);
  const [servicos, setServicos] = useState([]);
  const [servico, setServico] = useState(null);
  const [campos, setCampos] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(null);

  useEffect(() => {
    api.servicos().then(s => {
      setServicos(Array.isArray(s) ? s : []);
      if (servicoId) {
        const found = s.find(x => x.id === servicoId);
        if (found) selecionarServico(found);
      }
    }).catch(() => {});
  }, []);

  const selecionarServico = async (s) => {
    setServico(s);
    setErro('');
    try {
      const detalhe = await api.detalhesServico(s.id);
      setCampos(Array.isArray(detalhe.campos) ? detalhe.campos : []);
      setForm({});
    } catch { setCampos([]); }
    setPasso(2);
  };

  const atualizarCampo = (campoId, valor) => {
    setForm(f => ({ ...f, [campoId]: valor }));
  };

  const enviar = async () => {
    setLoading(true); setErro('');
    try {
      const body = {
        nome: form._nome || '',
        cpf: form._cpf || '',
        telefone: form._telefone || '',
        email: form._email || '',
        servico_id: servico.id,
        assunto: servico.nome,
        descricao: Object.entries(form)
          .filter(([k]) => !k.startsWith('_'))
          .map(([k, v]) => {
            const campo = campos.find(c => c.id === k);
            return campo ? `${campo.rotulo}: ${v}` : `${k}: ${v}`;
          }).join('\n'),
        campos: Object.entries(form)
          .filter(([k]) => !k.startsWith('_'))
          .map(([k, v]) => ({ campo_id: k, valor: String(v) })),
      };

      const result = await api.criarSolicitacao(body);
      setSucesso(result);
      setPasso(3);
    } catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  };

  if (sucesso) {
    return React.createElement('div', { style: { maxWidth: T.maxWidth, margin: '0 auto', padding: 40 } },
      React.createElement('div', {
        style: { background: T.surface, borderRadius: T.radiusLg, padding: 32, textAlign: 'center', boxShadow: T.shadowMd },
      },
        React.createElement('div', { style: { fontSize: 48, marginBottom: 16 } }, '✓'),
        React.createElement('h2', { style: { fontSize: 20, fontWeight: 700, color: T.success, margin: '0 0 8px' } }, 'Solicitação registrada!'),
        React.createElement('p', { style: { fontSize: 18, fontWeight: 800, color: T.text, fontFamily: 'monospace', margin: '0 0 4px' } }, sucesso.numero),
        sucesso.senha_acesso && React.createElement(React.Fragment, null,
          React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, margin: '12px 0 4px' } }, 'Seu código de acesso:'),
          React.createElement('p', {
            style: { fontSize: 24, fontWeight: 800, color: T.text, fontFamily: 'monospace', letterSpacing: 4, margin: '0 0 20px',
              background: T.surfaceAlt, display: 'inline-block', padding: '8px 20px', borderRadius: T.radiusSm },
          }, sucesso.senha_acesso),
        ),
        React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, margin: '0 0 20px' } }, 'Guarde esses dados para acompanhar sua solicitação.'),
        React.createElement('button', {
          onClick: () => navigate(''),
          style: btnPrimary,
        }, 'Voltar ao início'),
      ),
    );
  }

  return React.createElement('div', { style: { maxWidth: T.maxWidth, margin: '0 auto', padding: '20px' } },
    React.createElement('div', { style: { textAlign: 'center', marginBottom: 20 } },
      React.createElement('button', {
        onClick: () => passo === 1 ? navigate('') : setPasso(1),
        style: { background: 'none', border: 'none', color: T.primary, fontSize: 14, cursor: 'pointer', fontWeight: 600, padding: '8px' },
      }, '← Voltar'),
      React.createElement('h1', { style: { fontSize: 22, fontWeight: 800, color: T.text, margin: '8px 0 4px' } },
        passo === 1 ? 'Nova solicitação' : servico?.nome),
    ),

    passo === 1 && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      servicos.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: 40, color: T.textMuted, fontSize: 14 } }, 'Nenhum serviço disponível no momento.')
        : servicos.map(s => React.createElement('button', {
            key: s.id,
            onClick: () => selecionarServico(s),
            style: {
              textAlign: 'left', width: '100%', padding: '16px', borderRadius: T.radius,
              border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer',
              boxShadow: T.shadowMd,
            },
          },
            React.createElement('div', { style: { fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 } }, s.nome),
            s.descricao && React.createElement('div', { style: { fontSize: 13, color: T.textSecondary, lineHeight: 1.4 } }, s.descricao),
            React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted, marginTop: 6 } },
              s.secretaria_nome ? `${s.secretaria_nome} · ` : '',
              s.prazo_estimado_dias ? `Prazo: ${s.prazo_estimado_dias} dias` : '',
            ),
          )),
    ),

    passo === 2 && React.createElement('div', {
      style: { background: T.surface, borderRadius: T.radiusLg, padding: 24, boxShadow: T.shadowMd, border: `1px solid ${T.border}` },
    },
      servico?.descricao && React.createElement('p', { style: { fontSize: 13, color: T.textSecondary, margin: '0 0 16px', lineHeight: 1.5 } }, servico.descricao),
      servico?.instrucoes && React.createElement('div', {
        style: { fontSize: 12.5, color: T.textSecondary, padding: '10px 14px', background: T.surfaceAlt, borderRadius: T.radiusSm, marginBottom: 16, lineHeight: 1.5 },
      }, servico.instrucoes),

      // Campos do cidadão
      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4 } }, 'Nome completo *'),
      React.createElement('input', {
        value: form._nome || '', onChange: (e) => { setForm(f => ({ ...f, _nome: e.target.value })); },
        placeholder: 'Seu nome completo', style: inputStyle,
      }),
      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4 } }, 'CPF'),
      React.createElement('input', {
        value: form._cpf || '', onChange: (e) => { setForm(f => ({ ...f, _cpf: e.target.value })); },
        placeholder: '000.000.000-00', style: inputStyle,
      }),
      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4 } }, 'Telefone'),
      React.createElement('input', {
        value: form._telefone || '', onChange: (e) => { setForm(f => ({ ...f, _telefone: e.target.value })); },
        placeholder: '(00) 00000-0000', style: { ...inputStyle, marginBottom: 16 },
      }),
      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4 } }, 'E-mail'),
      React.createElement('input', {
        type: 'email', value: form._email || '', onChange: (e) => { setForm(f => ({ ...f, _email: e.target.value })); },
        placeholder: 'seu@email.com', style: { ...inputStyle, marginBottom: 20 },
      }),

      // Campos dinâmicos do serviço
      campos.length > 0 && React.createElement(React.Fragment, null,
        React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12, borderTop: `1px solid ${T.border}`, paddingTop: 12 } }, 'Informações da solicitação'),
        campos.map(c => React.createElement('div', { key: c.id },
          React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 4 } },
            c.rotulo, c.obrigatorio ? ' *' : ''),
          c.tipo === 'texto_longo'
            ? React.createElement('textarea', {
                value: form[c.id] || '', onChange: (e) => atualizarCampo(c.id, e.target.value),
                placeholder: c.placeholder || '', rows: 3,
                style: { ...inputStyle, resize: 'vertical' },
              })
            : c.tipo === 'selecao' && c.opcoes
            ? React.createElement('select', {
                value: form[c.id] || '', onChange: (e) => atualizarCampo(c.id, e.target.value),
                style: inputStyle,
              },
                React.createElement('option', { value: '' }, 'Selecione...'),
                (Array.isArray(c.opcoes) ? c.opcoes : []).map(o => React.createElement('option', { key: o, value: o }, o)),
              )
            : React.createElement('input', {
                type: c.tipo === 'numero' ? 'number' : c.tipo === 'data' ? 'date' : c.tipo === 'email' ? 'email' : 'text',
                value: form[c.id] || '', onChange: (e) => atualizarCampo(c.id, e.target.value),
                placeholder: c.placeholder || '', style: inputStyle,
              }),
          c.ajuda && React.createElement('div', { style: { fontSize: 11, color: T.textMuted, marginTop: -8, marginBottom: 12 } }, c.ajuda),
        )),
      ),

      erro && React.createElement('div', {
        style: { fontSize: 12.5, color: T.danger, background: T.dangerSoft, padding: '10px 12px', borderRadius: T.radiusSm, marginBottom: 12 },
      }, erro),

      React.createElement('button', {
        onClick: enviar, disabled: loading || !form._nome,
        style: { ...btnPrimary, background: (loading || !form._nome) ? T.surfaceMuted : T.success, color: (loading || !form._nome) ? T.textMuted : '#fff', cursor: (loading || !form._nome) ? 'default' : 'pointer', marginTop: 8 },
      }, loading ? 'Enviando...' : 'Enviar solicitação'),
    ),
  );
}
