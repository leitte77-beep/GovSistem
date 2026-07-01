import React from 'react';
import { ShieldCheck, LogOut } from 'lucide-react';
import { T } from '../theme';
import { useAuth } from '../context/AuthContext';

const NAV_ICONS = {
  atendimento: 'chat',
  agenda: 'calendar_today',
  interno: 'groups',
  relatorios: 'monitoring',
  notificacoes: 'notifications',
  configuracoes: 'settings',
};

const NAV_LABELS = {
  atendimento: 'Atendimento',
  agenda: 'Agenda',
  interno: 'Equipe',
  relatorios: 'Relatórios',
  notificacoes: 'Notificações',
  configuracoes: 'Configurações',
};

function BotaoRail({ view, ativo, onClick, badge }) {
  const iconName = NAV_ICONS[view];
  const label = NAV_LABELS[view];
  const filled = ativo;

  return React.createElement('button', {
    onClick: () => onClick(view),
    title: label,
    style: {
      width: '100%', height: 44,
      display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
      gap: 12, padding: '0 12px',
      borderRadius: T.radius,
      background: filled ? T.primarySoft : 'transparent',
      color: filled ? T.primary : T.railText,
      border: 'none',
      cursor: 'pointer',
      position: 'relative',
      transition: 'all 0.15s',
      fontWeight: filled ? 600 : 500,
    },
  },
    React.createElement('span', {
      className: 'material-symbols-outlined',
      style: {
        fontSize: 24, flexShrink: 0,
        fontVariationSettings: filled ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
      },
    }, iconName),
    React.createElement('span', {
      style: {
        fontSize: 14,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        flex: 1, textAlign: 'left',
      },
    }, label),
    badge > 0 && React.createElement('span', {
      style: {
        flexShrink: 0,
        background: '#EF4444', color: '#fff',
        borderRadius: '50%', minWidth: 18, height: 18,
        fontSize: 10, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 5px',
      },
    }, badge > 99 ? '99+' : badge),
  );
}

export function RailNavegacao({ view, onChange, isAdmin, verRelatorios, notifCount }) {
  const { auth, logout } = useAuth();
  const op = auth?.operador;
  const inicial = (op?.nome || '?').trim().charAt(0).toUpperCase();

  return React.createElement('aside', {
    style: {
      width: 220, minWidth: 220, height: '100%',
      background: T.railBg,
      display: 'flex', flexDirection: 'column', alignItems: 'stretch',
      padding: '16px 12px',
      borderRight: `1px solid #d1d7db`,
      zIndex: 50, flexShrink: 0,
    },
  },
    React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 4px', marginBottom: 20,
      },
    },
      React.createElement('div', {
        style: {
          width: 40, height: 40, flexShrink: 0,
          borderRadius: '0.75rem', background: T.primaryGradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
        },
      },
        React.createElement('span', {
          className: 'material-symbols-outlined',
          style: { color: '#fff', fontSize: 24, fontVariationSettings: "'FILL' 1" },
        }, 'shield'),
      ),
      React.createElement('span', {
        style: {
          fontWeight: 700, fontSize: 16, color: T.railText,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        },
      }, 'GovSistem'),
    ),

    React.createElement('nav', {
      style: {
        display: 'flex', flexDirection: 'column', gap: 4,
        flex: 1,
      },
    },
      React.createElement(BotaoRail, { view: 'atendimento', ativo: view === 'atendimento', onClick: onChange }),
      React.createElement(BotaoRail, { view: 'agenda', ativo: view === 'agenda', onClick: onChange }),
      React.createElement(BotaoRail, { view: 'interno', ativo: view === 'interno', onClick: onChange }),
      verRelatorios && React.createElement(BotaoRail, { view: 'relatorios', ativo: view === 'relatorios', onClick: onChange }),
      React.createElement(BotaoRail, { view: 'notificacoes', ativo: view === 'notificacoes', onClick: onChange, badge: notifCount || 0 }),
      isAdmin && React.createElement(BotaoRail, { view: 'configuracoes', ativo: view === 'configuracoes', onClick: onChange }),
    ),

    React.createElement('div', {
      style: {
        display: 'flex', flexDirection: 'column', gap: 4, marginTop: 'auto',
        alignItems: 'stretch',
      },
    },
      React.createElement('div', {
        title: op?.nome,
        style: {
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 12px',
        },
      },
        React.createElement('div', {
          style: {
            width: 32, height: 32, flexShrink: 0,
            borderRadius: '50%',
            background: '#dbeafe',
            color: T.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13,
            border: '1px solid #d1d7db',
            overflow: 'hidden',
          },
        },
          React.createElement('img', {
            src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDWXpi2JDvKBEkcu7_YfO6_w12It6i7eG2uBHgM80iLJyJNapgyZ9FvryhZKZOvkZ0HfQ8UOffLJKikKUMdWkPkMojzlgM--yfsZHegUzukatQ9FOsP6cXhLR1dmNbb5LlN3xv7C0b8I-U0e4hPdRGZANuz1g5hjmKRs4Cq4Ts6Tf2K8Akc7dA8lXwDO35OcuejTMjz--ZWBfQvnDWq3xg2OOHLkId55ZA8kdQxdQTSmUNrWMYHPGsk0ikJAYAAaO9HxW1jGrfFBWsp',
            alt: op?.nome || 'User',
            style: { width: '100%', height: '100%', objectFit: 'cover' },
            onError: function(e) { e.target.style.display = 'none'; e.target.parentElement.textContent = inicial; },
          }),
        ),
        React.createElement('span', {
          style: {
            fontSize: 13, fontWeight: 600, color: T.railText,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          },
        }, op?.nome || ''),
      ),

      React.createElement('button', {
        onClick: logout,
        title: 'Sair',
        style: {
          width: '100%', height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          gap: 12, padding: '0 12px',
          borderRadius: T.radius,
          border: 'none',
          cursor: 'pointer',
          background: 'transparent',
          color: T.railText,
          fontWeight: 500,
        },
      },
        React.createElement(LogOut, { size: 20, style: { flexShrink: 0 } }),
        React.createElement('span', { style: { fontSize: 14 } }, 'Sair'),
      ),
    ),
  );
}
