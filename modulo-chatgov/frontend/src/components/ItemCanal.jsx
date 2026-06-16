import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Avatar } from './Avatar';
import { T } from '../theme';
import { formatarHoraRelativa } from '../utils/arquivo';

function resumoUltima(msg) {
  if (!msg) return '';
  if (msg.tipo === 'imagem') return '\uD83D\uDCF7 Imagem';
  if (msg.tipo === 'video') return '\uD83C\uDFAC Video';
  if (msg.tipo === 'audio') return '\uD83C\uDFB5 Audio';
  if (msg.tipo === 'documento') return '\uD83D\uDCCE Documento';
  return msg.conteudo || '';
}

export function ItemCanal({ canal, ativo, opId, onClick, naoLidas, onDelete }) {
  const outroMembro = canal.tipo === 'dm' ? canal.membros?.find((m) => m.id !== opId) : null;
  const nome = canal.tipo === 'dm' ? (outroMembro?.nome || 'Conversa') : (canal.nome || 'Grupo');
  const naoLidasN = typeof naoLidas === 'number' ? naoLidas : (canal.nao_lidas || canal.naoLidas || 0);
  const ultima = canal.ultima_mensagem || canal.ultimaMensagem;
  const [showDelete, setShowDelete] = useState(false);

  let subtitulo;
  if (canal.tipo === 'grupo') {
    const total = canal.membros?.length || 0;
    const online = (canal.membros || []).filter((m) => m.online).length;
    subtitulo = online > 0 ? `${online} online, ${total} membros` : `${total} membros`;
  } else {
    subtitulo = outroMembro?.online ? 'online' : 'offline';
  }

  return React.createElement('div', {
    onClick,
    onMouseEnter: () => setShowDelete(true),
    onMouseLeave: () => setShowDelete(false),
    role: 'button', tabIndex: 0, 'aria-label': `${nome}, ${subtitulo}`,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } },
    style: {
      display: 'flex', padding: '12px 12px', cursor: 'pointer', alignItems: 'center', gap: 12,
      transition: 'background 0.12s', background: ativo ? T.primarySoft : 'transparent',
      borderRadius: T.radiusSm, marginBottom: 1, position: 'relative',
      borderBottom: ativo ? 'none' : `1px solid #f0f2f5`,
    },
  },
    React.createElement(Avatar, { nome, tamanho: 46, tipo: canal.tipo, online: outroMembro?.online }),
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement('div', { style: { fontSize: 15, fontWeight: naoLidasN > 0 ? 700 : 600, color: T.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, nome),
        ultima && React.createElement('span', { style: { fontSize: 11, color: T.textMuted, flexShrink: 0 } }, formatarHoraRelativa(ultima.criado_em || ultima.criadoEm)),
        naoLidasN > 0 && React.createElement('span', {
          'aria-label': `${naoLidasN} mensagens nao lidas`,
          style: { background: T.primary, color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 12, minWidth: 20, textAlign: 'center', flexShrink: 0 },
        }, naoLidasN > 99 ? '99+' : String(naoLidasN)),
      ),
      React.createElement('div', {
        title: ultima ? (ultima.conteudo || '') : '',
        style: { fontSize: 13, color: naoLidasN > 0 ? T.text : T.textSecondary, fontWeight: naoLidasN > 0 ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 },
      },
        ultima
          ? `${ultima.remetente_nome || ultima.remetenteNome ? ((ultima.remetente_nome || ultima.remetenteNome).split(' ')[0] + ': ') : ''}${resumoUltima(ultima)}`
          : subtitulo,
      ),
    ),
    onDelete && showDelete && React.createElement('button', {
      onClick: (e) => { e.stopPropagation(); onDelete(canal.id); },
      'aria-label': 'Excluir canal',
      style: {
        background: 'none', border: 'none', cursor: 'pointer', padding: 4,
        color: T.textMuted, borderRadius: 4, display: 'flex',
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
      },
      title: 'Excluir canal',
    }, React.createElement(Trash2, { size: 15 })),
  );
}
