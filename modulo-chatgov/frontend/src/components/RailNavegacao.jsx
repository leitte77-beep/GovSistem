import React from 'react';
import { ShieldCheck, LogOut, Sun, Moon } from 'lucide-react';
import { T } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const NAV_ICONS = {
  atendimento: 'chat',
  agenda: 'calendar_today',
  interno: 'groups',
  protocolos: 'description',
  relatorios: 'monitoring',
  notificacoes: 'notifications',
  configuracoes: 'settings',
  mais: 'more_horiz',
};

const NAV_LABELS = {
  atendimento: 'Atendimento',
  agenda: 'Agenda',
  interno: 'Equipe',
  protocolos: 'Protocolos',
  relatorios: 'Relatórios',
  notificacoes: 'Notificações',
  configuracoes: 'Configurações',
  mais: 'Mais',
};

function BotaoRail({ view, ativo, onClick, badge, somenteIcone }) {
  const iconName = NAV_ICONS[view];
  const label = NAV_LABELS[view];
  const filled = ativo;

  return React.createElement('button', {
    onClick: () => onClick(view),
    title: label,
    style: {
      width: '100%', height: 44,
      display: 'flex', alignItems: 'center', justifyContent: somenteIcone ? 'center' : 'flex-start',
      gap: 12, padding: somenteIcone ? '0' : '0 12px',
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
    !somenteIcone && React.createElement('span', {
      style: {
        fontSize: 14,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        flex: 1, textAlign: 'left',
      },
    }, label),
    badge > 0 && React.createElement('span', {
      style: {
        position: 'absolute', top: somenteIcone ? 0 : 4, right: somenteIcone ? 0 : 8,
        flexShrink: 0,
        background: '#EF4444', color: '#fff',
        borderRadius: '50%', minWidth: 18, height: 18,
        fontSize: 10, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 5px',
        zIndex: 1,
      },
    }, badge > 99 ? '99+' : badge),
  );
}

function BotaoRailMobile({ view, ativo, onClick, badge }) {
  const iconName = NAV_ICONS[view];
  const label = NAV_LABELS[view];
  const shortLabel = label === 'Atendimento' ? 'Atend.' : label;
  const filled = ativo;

  return React.createElement('button', {
    onClick: () => onClick(view),
    title: label,
    className: 'bnav-item',
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 1, padding: '4px 2px 2px', minWidth: 0, flex: 1,
      borderRadius: 10,
      background: 'transparent',
      color: filled ? T.primary : T.railText,
      border: 'none',
      cursor: 'pointer',
      position: 'relative',
      transition: 'all 0.15s',
      fontWeight: filled ? 600 : 500,
      maxWidth: 80,
    },
  },
    React.createElement('span', {
      className: 'material-symbols-outlined',
      style: {
        fontSize: 22, flexShrink: 0,
        fontVariationSettings: filled ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
      },
    }, iconName),
    React.createElement('span', {
      className: 'bnav-label-full',
      style: {
        fontSize: 9,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        maxWidth: '100%',
      },
    }, label),
    React.createElement('span', {
      className: 'bnav-label-short',
      style: {
        fontSize: 9,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        maxWidth: '100%',
      },
    }, shortLabel),
    badge > 0 && React.createElement('span', {
      style: {
        position: 'absolute', top: 0, right: 4,
        background: '#EF4444', color: '#fff',
        borderRadius: '50%', minWidth: 16, height: 16,
        fontSize: 9, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 4px',
      },
    }, badge > 99 ? '99+' : badge),
  );
}

export function RailNavegacao({ view, onChange, isAdmin, verRelatorios, notifCount, breakpoint }) {
  const { auth, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const op = auth?.operador;
  const inicial = (op?.nome || '?').trim().charAt(0).toUpperCase();
  const somenteIcone = breakpoint === 'tablet';
  const [menuMobileAberto, setMenuMobileAberto] = React.useState(false);
  const viewsMenuMobile = [
    'protocolos',
    verRelatorios && 'relatorios',
    isAdmin && 'configuracoes',
  ].filter(Boolean);
  const maisAtivo = viewsMenuMobile.includes(view);

  if (breakpoint === 'mobile') {
    return React.createElement('nav', {
      style: {
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        minHeight: 62,
        background: T.railBg,
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        borderTop: `1px solid ${T.border}`,
        padding: '4px 8px calc(4px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
      },
    },
      React.createElement(BotaoRailMobile, { view: 'atendimento', ativo: view === 'atendimento', onClick: onChange }),
      React.createElement(BotaoRailMobile, { view: 'agenda', ativo: view === 'agenda', onClick: onChange }),
      React.createElement(BotaoRailMobile, { view: 'interno', ativo: view === 'interno', onClick: onChange }),
      React.createElement(BotaoRailMobile, { view: 'notificacoes', ativo: view === 'notificacoes', onClick: onChange, badge: notifCount || 0 }),
      viewsMenuMobile.length > 0 && React.createElement(React.Fragment, null,
        React.createElement(BotaoRailMobile, {
          view: 'mais',
          ativo: maisAtivo || menuMobileAberto,
          onClick: () => setMenuMobileAberto((v) => !v),
        }),
        menuMobileAberto && React.createElement(React.Fragment, null,
          React.createElement('button', {
            type: 'button',
            onClick: () => setMenuMobileAberto(false),
            'aria-label': 'Fechar menu',
            style: { position: 'fixed', inset: 0, background: 'transparent', border: 'none', zIndex: 98 },
          }),
          React.createElement('div', {
            style: {
              position: 'fixed',
              right: 10,
              bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
              width: 'min(220px, calc(100vw - 20px))',
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              boxShadow: T.shadowMd,
              padding: 6,
              zIndex: 101,
            },
          },
            viewsMenuMobile.map((item) => React.createElement('button', {
              key: item,
              type: 'button',
              onClick: () => { setMenuMobileAberto(false); onChange(item); },
              style: {
                width: '100%',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0 12px',
                border: 'none',
                borderRadius: 8,
                background: view === item ? T.primarySoft : 'transparent',
                color: view === item ? T.primary : T.railText,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: view === item ? 700 : 600,
                textAlign: 'left',
              },
            },
              React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 21 } }, NAV_ICONS[item]),
              NAV_LABELS[item],
            )),
          ),
        ),
      ),
    );
  }

  return React.createElement('aside', {
    style: {
      width: somenteIcone ? 56 : 220, minWidth: somenteIcone ? 56 : 220, height: '100%',
      background: T.railBg,
      display: 'flex', flexDirection: 'column', alignItems: 'stretch',
      padding: somenteIcone ? '16px 8px' : '16px 12px',
      borderRight: `1px solid ${T.border}`,
      zIndex: 50, flexShrink: 0,
    },
  },
    !somenteIcone && React.createElement('div', {
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
    somenteIcone && React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, height: 40,
      },
    },
      React.createElement('div', {
        style: {
          width: 36, height: 36, flexShrink: 0,
          borderRadius: '0.75rem', background: T.primaryGradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
        },
      },
        React.createElement('span', {
          className: 'material-symbols-outlined',
          style: { color: '#fff', fontSize: 20, fontVariationSettings: "'FILL' 1" },
        }, 'shield'),
      ),
    ),

    React.createElement('nav', {
      style: {
        display: 'flex', flexDirection: 'column', gap: 4,
        flex: 1,
      },
    },
      React.createElement(BotaoRail, { view: 'atendimento', ativo: view === 'atendimento', onClick: onChange, somenteIcone }),
      React.createElement(BotaoRail, { view: 'agenda', ativo: view === 'agenda', onClick: onChange, somenteIcone }),
      React.createElement(BotaoRail, { view: 'interno', ativo: view === 'interno', onClick: onChange, somenteIcone }),
      React.createElement(BotaoRail, { view: 'protocolos', ativo: view === 'protocolos', onClick: onChange, somenteIcone }),
      verRelatorios && React.createElement(BotaoRail, { view: 'relatorios', ativo: view === 'relatorios', onClick: onChange, somenteIcone }),
      React.createElement(BotaoRail, { view: 'notificacoes', ativo: view === 'notificacoes', onClick: onChange, badge: notifCount || 0, somenteIcone }),
      isAdmin && React.createElement(BotaoRail, { view: 'configuracoes', ativo: view === 'configuracoes', onClick: onChange, somenteIcone }),
    ),

    !somenteIcone && React.createElement('div', {
      style: { padding: '4px 12px', marginBottom: 4 },
    },
      React.createElement('button', {
        onClick: toggle,
        title: isDark ? 'Modo claro' : 'Modo escuro',
        style: {
          width: '100%', height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: 0,
          border: '1px solid ' + T.borderStrong,
          borderRadius: T.radius,
          cursor: 'pointer',
          background: 'transparent',
          transition: 'border-color 0.2s',
        },
      },
        React.createElement(Sun, { size: 14, color: isDark ? T.textMuted : T.primary }),
        React.createElement('div', {
          style: {
            width: 32, height: 18,
            borderRadius: 9,
            background: isDark ? T.primary : T.borderStrong,
            position: 'relative',
            transition: 'background 0.25s',
            flexShrink: 0,
          },
        },
          React.createElement('div', {
            style: {
              width: 14, height: 14,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 2,
              left: isDark ? 16 : 2,
              transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            },
          }),
        ),
        React.createElement(Moon, { size: 14, color: isDark ? T.primary : T.textMuted }),
      ),
    ),

    !somenteIcone && React.createElement('div', {
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
            border: `1px solid ${T.borderStrong}`,
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

    somenteIcone && React.createElement('button', {
      onClick: toggle,
      title: isDark ? 'Modo claro' : 'Modo escuro',
      style: {
        width: '100%', height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', borderRadius: T.radiusSm,
        cursor: 'pointer',
        background: 'transparent',
        color: T.railText,
        marginBottom: 4,
      },
    },
      isDark
        ? React.createElement(Sun, { size: 18, color: T.railText })
        : React.createElement(Moon, { size: 18, color: T.railText }),
    ),

    somenteIcone && React.createElement('button', {
      onClick: logout,
      title: 'Sair (' + (op?.nome || '') + ')',
      style: {
        width: '100%', height: 44,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: T.radius,
        border: 'none',
        cursor: 'pointer',
        background: 'transparent',
        color: T.railText,
        fontWeight: 500,
        marginTop: 'auto',
      },
    },
      React.createElement(LogOut, { size: 20, style: { flexShrink: 0 } }),
    ),
  );
}
