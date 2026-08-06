import React from 'react';
import { Pin } from 'lucide-react';
import { Avatar } from './Avatar';
import { DeptBadge } from './DeptBadge';
import { T } from '../theme';
import { formatarHoraRelativa } from '../utils/arquivo';
import { CONVERSA_STATUS_UI, conversationStatus } from '../domain/status';

function previewIcon(tipo) {
  switch (tipo) {
    case 'imagem': case 'image': return '\uD83D\uDDBC';
    case 'video': return '\uD83C\uDFAC';
    case 'audio': return '\uD83C\uDFB5';
    case 'documento': case 'document': return '\uD83D\uDCC4';
    case 'sticker': return '\uD83C\uDFA8';
    case 'contato': case 'contact': return '\uD83D\uDC64';
    case 'localizacao': case 'location': return '\uD83D\uDCCD';
    default: return null;
  }
}

function previewLabel(tipo) {
  switch (tipo) {
    case 'imagem': case 'image': return 'Imagem';
    case 'video': return 'V\u00eddeo';
    case 'audio': return '\u00c1udio';
    case 'documento': case 'document': return 'Documento';
    case 'contato': case 'contact': return 'Contato';
    case 'localizacao': case 'location': return 'Localiza\u00e7\u00e3o';
    default: return null;
  }
}

function formatarPreview(msg, direcao, tipo) {
  const isEntrada = direcao === 'entrada';
  const generoFeminino = { imagem: true, image: true, localizacao: true, location: true };

  if (tipo && tipo !== 'texto') {
    const icon = previewIcon(tipo);
    const label = previewLabel(tipo);
    const acao = isEntrada ? 'recebid' : 'enviad';
    const sufixo = generoFeminino[tipo] ? 'a' : 'o';
    return `${icon} ${label} ${acao}${sufixo}`;
  }

  if (!msg) return '';

  if (isEntrada) return `\uD83D\uDC64 ${msg}`;
  if (isSaida) return `\uD83D\uDCAC Voc\u00ea: ${msg}`;
  return msg;
}

export function ItemConversa({ conversa, ativa, opId, onClick, fixada, onFixar }) {
  const nome = conversa.contato_nome || conversa.contato_telefone || 'Desconhecido';
  const isNumber = !conversa.contato_nome;
  const minha = opId && conversa.operador_id === opId;
  const status = conversationStatus(conversa);
  const statusUi = CONVERSA_STATUS_UI[status];
  const naoLidas = conversa.nao_lidas || 0;

  const responsavel = conversa.operador_nome
    ? `Em atendimento por ${conversa.operador_nome}`
    : 'Sem atendente respons\u00e1vel';

  const preview = formatarPreview(
    conversa.ultima_mensagem,
    conversa.ultima_mensagem_direcao,
    conversa.ultima_mensagem_tipo
  );

  return React.createElement('div', {
    onClick,
    title: `${nome} \u2014 ${statusUi?.label || status}. ${responsavel}.`,
    className: 'cg-conv-item' + (ativa ? ' ativa' : ''),
    style: {
      display: 'flex',
      padding: '12px 12px',
      cursor: 'pointer',
      alignItems: 'center',
      gap: 12,
      borderRadius: T.radiusSm,
      marginBottom: 1,
      borderBottom: ativa ? 'none' : `1px solid ${T.border}`,
      borderLeft: minha ? `3px solid ${T.primary}` : '3px solid transparent',
      opacity: status === 'ARQUIVADA' ? 0.6 : 1,
      background: !ativa && naoLidas > 0 ? T.primarySoft : undefined,
      position: 'relative',
    },
  },
    React.createElement(Avatar, { nome, url: conversa.contato_avatar_url, tamanho: 46, isNumber }),
    React.createElement('div', {
      style: { flex: 1, minWidth: 0 },
    },
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
      },
        React.createElement('span', {
          style: { flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: naoLidas > 0 ? 700 : 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 },
        },
          fixada && React.createElement(Pin, { size: 12, color: T.primary, style: { flexShrink: 0 }, fill: T.primary }),
          React.createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, nome),
        ),
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 6 },
        },
          minha && React.createElement('span', {
            title: 'Atribu\u00edda a voc\u00ea',
            style: { fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: T.primarySoft, color: T.primary, textTransform: 'uppercase' },
          }, 'Minha'),
          statusUi && React.createElement('span', {
            title: `Status: ${statusUi.label}`,
            style: {
              fontSize: 9.5, fontWeight: 600, padding: '2px 6px', borderRadius: 5,
              background: statusUi.background, color: statusUi.color,
            },
          }, statusUi.label),
          conversa.departamento_nome && React.createElement(DeptBadge, { nome: conversa.departamento_nome, cor: conversa.departamento_cor }),
        ),
      ),
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
      },
        React.createElement('span', {
          style: {
            fontSize: 13,
            color: naoLidas > 0 ? T.text : T.textSecondary,
            fontWeight: naoLidas > 0 ? 600 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            marginRight: 8,
          },
        }, preview),
        React.createElement('span', {
          style: { fontSize: 11.5, color: T.textMuted, whiteSpace: 'nowrap', flexShrink: 0 },
        }, formatarHoraRelativa(conversa.ultima_mensagem_em)),
      ),
      naoLidas > 0 && React.createElement('div', {
        style: { display: 'flex', justifyContent: 'flex-end', marginTop: 1 },
      },
        React.createElement('span', {
          style: {
            background: T.whatsappGreen,
            color: '#fff',
            borderRadius: 12,
            minWidth: 20,
            height: 20,
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            padding: '0 5px',
          },
        }, conversa.nao_lidas > 99 ? '99+' : conversa.nao_lidas),
      ),
    ),
  );
}