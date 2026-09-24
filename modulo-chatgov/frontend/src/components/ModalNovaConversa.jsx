import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Phone, User, MessageSquare, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { T } from '../theme';
import { iniciarConversa, precheckContato } from '../api';
import { SeletorDepartamento } from './SeletorDepartamento';

const CHAVE_ULTIMO_DEPTO = 'chatgov_ultimo_departamento';
// DDDs em uso no Brasil (Anatel). Serve para pegar erro de digitação antes de
// gastar uma tentativa de envio no WhatsApp.
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68,
  69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95,
  96, 97, 98, 99,
]);

// (44) 99999-9999 enquanto digita, sem atrapalhar o apagar.
function formatarTelefone(valor) {
  const d = (valor || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function validarTelefone(valor) {
  const d = (valor || '').replace(/\D/g, '');
  if (d.length < 10) return 'Informe o telefone completo com DDD.';
  if (d.length > 11) return 'Telefone com dígitos demais.';
  if (!DDDS_VALIDOS.has(Number(d.slice(0, 2)))) return `DDD ${d.slice(0, 2)} não existe.`;
  if (d.length === 11 && d[2] !== '9') return 'Celular com 11 dígitos deve começar com 9 após o DDD.';
  return '';
}

function haQuantoTempo(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

export function ModalNovaConversa({ departamentos, onClose, onCriada, onAbrirConversa }) {
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [departamentoId, setDepartamentoId] = useState(() => {
    try { return localStorage.getItem(CHAVE_ULTIMO_DEPTO) || ''; } catch { return ''; }
  });
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [checando, setChecando] = useState(false);
  const [precheck, setPrecheck] = useState(null);
  const nomePreenchidoAuto = useRef(false);

  // Só o setor válido é lembrado — se um departamento for desativado, o valor
  // guardado deixa de existir e o campo volta para "Sem encaminhamento".
  useEffect(() => {
    if (departamentoId && !departamentos.some((d) => d.id === departamentoId)) setDepartamentoId('');
  }, [departamentos, departamentoId]);

  // Ao completar o telefone, consulta contato e atendimento em aberto. Debounce
  // curto porque o operador digita o número inteiro de uma vez.
  useEffect(() => {
    const digitos = telefone.replace(/\D/g, '');
    if (digitos.length < 10 || validarTelefone(telefone)) { setPrecheck(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setChecando(true);
      try {
        const resultado = await precheckContato(digitos, controller.signal);
        setPrecheck(resultado);
        // Preenche o nome do cadastro, mas nunca sobrescreve o que o operador digitou.
        if (resultado?.contato?.nome && (!nome.trim() || nomePreenchidoAuto.current)) {
          setNome(resultado.contato.nome);
          nomePreenchidoAuto.current = true;
        }
      } catch {
        setPrecheck(null);
      } finally {
        setChecando(false);
      }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [telefone]); // eslint-disable-line react-hooks/exhaustive-deps

  const erroTelefone = telefone ? validarTelefone(telefone) : '';
  const conversaAberta = precheck?.conversa || null;

  const submeter = async () => {
    setErro('');
    const problema = validarTelefone(telefone);
    if (problema) { setErro(problema); return; }
    setEnviando(true);
    try {
      const conv = await iniciarConversa({
        telefone: telefone.replace(/\D/g, ''), nome: nome.trim() || null,
        departamento_id: departamentoId || null, mensagem: mensagem.trim() || null,
      });
      try { localStorage.setItem(CHAVE_ULTIMO_DEPTO, departamentoId || ''); } catch {}
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
          value: telefone, onChange: (e) => setTelefone(formatarTelefone(e.target.value)),
          placeholder: '(44) 99999-9999', type: 'tel',
          'aria-invalid': Boolean(erroTelefone),
          'aria-describedby': erroTelefone ? 'erro-telefone' : undefined,
          style: erroTelefone ? { borderColor: T.danger } : undefined,
        }),
        erroTelefone && React.createElement('div', {
          id: 'erro-telefone',
          style: { marginTop: -8, marginBottom: 12, fontSize: 12, color: T.danger, display: 'flex', alignItems: 'center', gap: 5 },
        }, React.createElement(AlertTriangle, { size: 13 }), erroTelefone),

        // Resultado da pré-checagem: contato conhecido e/ou atendimento em aberto.
        checando && React.createElement('div', {
          style: { marginTop: -8, marginBottom: 12, fontSize: 12, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 6 },
        },
          React.createElement(Loader2, { size: 13, style: { animation: 'girar 1s linear infinite' } }),
          'Verificando se já existe atendimento...'),

        conversaAberta && React.createElement('div', {
          role: 'alert',
          style: {
            marginTop: -6, marginBottom: 14, padding: '10px 12px', borderRadius: T.radiusSm,
            background: T.warningSoft, border: `1px solid ${T.warning}55`,
          },
        },
          React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-start' } },
            React.createElement(AlertTriangle, { size: 15, color: T.warning, style: { flexShrink: 0, marginTop: 1 } }),
            React.createElement('div', { style: { fontSize: 12.5, color: T.text, lineHeight: 1.45 } },
              'Já existe um atendimento ativo para este cidadão',
              conversaAberta.departamento_nome ? ` no setor de ${conversaAberta.departamento_nome}` : '',
              conversaAberta.operador_nome ? `, com ${conversaAberta.operador_nome}` : '',
              `, iniciado ${haQuantoTempo(conversaAberta.ultima_mensagem_em || conversaAberta.criado_em)}.`,
              conversaAberta.protocolo_numero && React.createElement('span', { style: { color: T.textMuted } }, ` Protocolo #${conversaAberta.protocolo_numero}.`),
            ),
          ),
          onAbrirConversa && React.createElement('button', {
            type: 'button',
            onClick: () => { onAbrirConversa(conversaAberta.id); onClose(); },
            style: {
              marginTop: 8, padding: '7px 14px', borderRadius: T.radiusSm, border: 'none',
              background: T.warning, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            },
          }, React.createElement(CheckCircle2, { size: 14 }), 'Abrir atendimento existente'),
        ),

        !conversaAberta && precheck?.contato && React.createElement('div', {
          style: { marginTop: -6, marginBottom: 14, fontSize: 12, color: T.success, display: 'flex', alignItems: 'center', gap: 6 },
        }, React.createElement(CheckCircle2, { size: 13 }), 'Contato já cadastrado — nome preenchido automaticamente.'),

        React.createElement('label', {
          style: { fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
        }, 'Nome do contato'),
        inputComIcone(User, {
          value: nome,
          onChange: (e) => { nomePreenchidoAuto.current = false; setNome(e.target.value); },
          placeholder: 'Ex: João da Silva',
        }),

        React.createElement('label', {
          style: { fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
        }, 'Secretaria / Departamento'),
        React.createElement(SeletorDepartamento, {
          departamentos, valor: departamentoId, onChange: setDepartamentoId,
          placeholder: 'Sem encaminhamento — busque por secretaria ou setor',
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
      @keyframes girar { to { transform: rotate(360deg); } }
    `),
  );
}
