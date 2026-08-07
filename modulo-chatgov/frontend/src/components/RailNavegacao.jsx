import React from 'react';
import { ShieldCheck, LogOut, Sun, Moon, PanelLeftClose, PanelLeftOpen, ChevronRight } from 'lucide-react';
import { T } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const NAV_ICONS = {
  atendimento:   { icon: 'chat',           lucide: null },
  dashboard:     { icon: 'dashboard',      lucide: null },
  compromissos:  { icon: 'calendar_today', lucide: null },
  contatos:      { icon: 'contacts',       lucide: null },
  interno:       { icon: 'groups',         lucide: null },
  protocolos:    { icon: 'description',    lucide: null },
  'config-protocolos': { icon: 'settings', lucide: null },
  relatorios:    { icon: 'monitoring',     lucide: null },
  notificacoes:  { icon: 'notifications',  lucide: null },
  configuracoes: { icon: 'settings',       lucide: null },
  mais:          { icon: 'more_horiz',     lucide: null },
};

const NAV_LABELS = {
  atendimento:   'Atendimento',
  dashboard:     'Dashboard',
  compromissos:  'Agenda',
  contatos:      'Contatos',
  interno:       'Equipe',
  protocolos:    'Protocolos',
  'config-protocolos': 'Config. Protocolos',
  relatorios:    'Relatórios',
  notificacoes:  'Notificações',
  configuracoes: 'Configurações',
  mais:          'Mais',
};

const SECOES = [
  {
    titulo: 'Atendimento',
    itens: ['atendimento', 'compromissos', 'contatos', 'interno'],
  },
  {
    titulo: 'Gestão',
    itens: ['protocolos', 'config-protocolos', 'dashboard', 'relatorios'],
  },
  {
    titulo: 'Sistema',
    itens: ['notificacoes', 'configuracoes'],
  },
];

const ROTULO_PAPEL = {
  admin:      'Administrador',
  supervisor: 'Supervisor',
  operador:   'Atendente',
};

function BotaoRail({ view, ativo, onClick, badge, somenteIcone }) {
  const iconName = NAV_ICONS[view]?.icon;
  const label = NAV_LABELS[view];
  const filled = ativo;

  return React.createElement('button', {
    onClick: () => onClick(view),
    title: `${label}${badge > 0 ? ` (${badge})` : ''}`,
    style: {
      width: '100%', height: 40,
      display: 'flex', alignItems: 'center', justifyContent: somenteIcone ? 'center' : 'flex-start',
      gap: 10, padding: somenteIcone ? '0' : '0 10px',
      borderRadius: 8,
      background: filled ? T.primarySoft : 'transparent',
      color: filled ? T.primary : T.railText,
      border: 'none',
      borderLeft: filled && !somenteIcone ? `4px solid ${T.primary}` : `4px solid transparent`,
      cursor: 'pointer',
      position: 'relative',
      transition: 'all 0.15s',
      fontWeight: filled ? 600 : 500,
      fontSize: 13.5,
      boxSizing: 'border-box',
    },
    onMouseEnter: (e) => {
      if (!filled) {
        e.currentTarget.style.background = T.hover || T.primarySoft;
        e.currentTarget.style.color = T.text;
      }
    },
    onMouseLeave: (e) => {
      if (!filled) {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = T.railText;
      }
    },
  },
    React.createElement('span', {
      className: 'material-symbols-outlined',
      style: {
        fontSize: 22, flexShrink: 0,
        fontVariationSettings: filled ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
      },
    }, iconName),
    !somenteIcone && React.createElement('span', {
      style: {
        fontSize: 13.5,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        flex: 1, textAlign: 'left',
      },
    }, label),
    badge > 0 && React.createElement('span', {
      style: {
        flexShrink: 0,
        background: filled ? T.primary : T.surfaceMuted,
        color: filled ? '#fff' : T.textSecondary,
        borderRadius: 9999, minWidth: 20, height: 20,
        fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 6px',
        boxSizing: 'border-box',
      },
    }, badge > 99 ? '99+' : badge),
  );
}

function BotaoRailMobile({ view, ativo, onClick, badge }) {
  const iconName = NAV_ICONS[view]?.icon;
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
        fontVariationSettings: filled ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
      },
    }, iconName),
    React.createElement('span', {
      className: 'bnav-label-full',
      style: { fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },
    }, label),
    React.createElement('span', {
      className: 'bnav-label-short',
      style: { fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },
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

export function RailNavegacao({ view, onChange, isAdmin, verRelatorios, notifCount, breakpoint, waStatus }) {
  const { auth, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const op = auth?.operador;
  const inicial = (op?.nome || '?').trim().charAt(0).toUpperCase();
  const papel = ROTULO_PAPEL[op?.papel] || 'Usuário';

  const [recolhida, setRecolhida] = React.useState(() => {
    try { return localStorage.getItem('chatgov_rail_recolhida') === 'true'; } catch { return false; }
  });
  React.useEffect(() => {
    try { localStorage.setItem('chatgov_rail_recolhida', String(recolhida)); } catch {}
  }, [recolhida]);
  const somenteIcone = breakpoint === 'tablet' || (breakpoint === 'desktop' && recolhida);

  const [menuMobileAberto, setMenuMobileAberto] = React.useState(false);
  const [menuUsuarioAberto, setMenuUsuarioAberto] = React.useState(false);

  const viewsMenuMobile = [
    isAdmin && 'dashboard',
    'contatos',
    'protocolos',
    verRelatorios && 'relatorios',
    isAdmin && 'configuracoes',
  ].filter(Boolean);
  const maisAtivo = viewsMenuMobile.includes(view);

  const itemVisivelDesktop = (key) => {
    if (key === 'dashboard') return isAdmin;
    if (key === 'relatorios') return verRelatorios;
    if (key === 'configuracoes') return isAdmin;
    return true;
  };

  const badgeDe = (key) => {
    if (key === 'notificacoes') return notifCount || 0;
    return 0;
  };

  const waConectado = waStatus?.status === 'conectado';
  const waDesconectado = waStatus?.status === 'desconectado';

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
      React.createElement(BotaoRailMobile, { view: 'compromissos', ativo: view === 'compromissos', onClick: onChange }),
      React.createElement(BotaoRailMobile, { view: 'interno', ativo: view === 'interno', onClick: onChange }),
      React.createElement(BotaoRailMobile, { view: 'notificacoes', ativo: view === 'notificacoes', onClick: onChange, badge: notifCount || 0 }),
      viewsMenuMobile.length > 0 && React.createElement(React.Fragment, null,
        React.createElement(BotaoRailMobile, {
          view: 'mais', ativo: maisAtivo || menuMobileAberto, onClick: () => setMenuMobileAberto((v) => !v),
        }),
        menuMobileAberto && React.createElement(React.Fragment, null,
          React.createElement('button', {
            type: 'button', onClick: () => setMenuMobileAberto(false),
            'aria-label': 'Fechar menu',
            style: { position: 'fixed', inset: 0, background: 'transparent', border: 'none', zIndex: 98 },
          }),
          React.createElement('div', {
            style: {
              position: 'fixed', right: 10,
              bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
              width: 'min(220px, calc(100vw - 20px))',
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 12, boxShadow: T.shadowMd, padding: 6, zIndex: 101,
            },
          },
            viewsMenuMobile.map((item) => React.createElement('button', {
              key: item, type: 'button',
              onClick: () => { setMenuMobileAberto(false); onChange(item); },
              style: {
                width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 12px', border: 'none', borderRadius: 8,
                background: view === item ? T.primarySoft : 'transparent',
                color: view === item ? T.primary : T.railText,
                cursor: 'pointer', fontSize: 14, fontWeight: view === item ? 700 : 600, textAlign: 'left',
              },
            },
              React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 21 } }, NAV_ICONS[item]?.icon),
              NAV_LABELS[item],
            )),
          ),
        ),
      ),
    );
  }

  const SecaoTitulo = ({ titulo }) =>
    !somenteIcone && React.createElement('div', {
      style: {
        fontSize: 10, fontWeight: 800, letterSpacing: 1.2,
        color: T.textMuted, textTransform: 'uppercase',
        padding: '12px 10px 4px',
        marginTop: 4,
      },
    }, titulo);

  const SecaoSeparador = () =>
    !somenteIcone && React.createElement('div', {
      style: { height: 1, margin: '2px 10px', background: T.border },
    });

  return React.createElement('aside', {
    style: {
      width: somenteIcone ? 68 : 220, minWidth: somenteIcone ? 68 : 220,
      height: '100%',
      background: T.railBg,
      display: 'flex', flexDirection: 'column', alignItems: 'stretch',
      padding: somenteIcone ? '14px 8px' : '14px 8px',
      borderRight: `1px solid ${T.border}`,
      zIndex: 50, flexShrink: 0,
    },
  },
    /* ── Logo / marca ── */
    !somenteIcone && React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 6px 14px', marginBottom: 4,
      },
    },
      React.createElement('div', {
        style: {
          width: 36, height: 36, flexShrink: 0,
          borderRadius: 10, background: T.primaryGradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
        },
      },
        React.createElement('span', {
          className: 'material-symbols-outlined',
          style: { color: '#fff', fontSize: 22, fontVariationSettings: "'FILL' 1" },
        }, 'shield'),
      ),
      React.createElement('div', null,
        React.createElement('div', { style: { fontWeight: 700, fontSize: 15, color: T.text, lineHeight: '20px' } }, 'ChatGov'),
        React.createElement('div', { style: { fontSize: 10, color: T.textMuted, fontWeight: 500 } }, 'Central de Atendimento'),
      ),
    ),

    somenteIcone && React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16, height: 36,
      },
    },
      React.createElement('div', {
        style: {
          width: 32, height: 32, flexShrink: 0,
          borderRadius: 8, background: T.primaryGradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
        },
      },
        React.createElement('span', {
          className: 'material-symbols-outlined',
          style: { color: '#fff', fontSize: 18, fontVariationSettings: "'FILL' 1" },
        }, 'shield'),
      ),
    ),

    /* ── Navegação por seções ── */
    React.createElement('nav', {
      style: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' },
    },
      ...SECOES.map((secao, idx) => {
        const itensVisiveis = secao.itens.filter(itemVisivelDesktop);
        if (itensVisiveis.length === 0) return null;

        return React.createElement(React.Fragment, { key: secao.titulo },
          idx > 0 && SecaoSeparador(),
          React.createElement(SecaoTitulo, { titulo: secao.titulo }),
          ...itensVisiveis.map((key) =>
            React.createElement(BotaoRail, {
              key,
              view: key,
              ativo: view === key,
              onClick: onChange,
              badge: badgeDe(key),
              somenteIcone,
            }),
          ),
        );
      }),
    ),

    /* ── WhatsApp status ── */
    !somenteIcone && React.createElement('div', {
      style: {
        padding: '6px 10px', marginTop: 8,
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11, color: T.textMuted,
      },
    },
      React.createElement('span', {
        style: {
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: waConectado ? T.whatsappStatusIcon : waDesconectado ? T.danger : T.offline,
          boxShadow: waConectado ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
        },
      }),
      React.createElement('span', null, waConectado ? 'WhatsApp conectado' : waDesconectado ? 'WhatsApp offline' : 'WhatsApp'),
    ),

    /* ── Rodapé: recolher + tema + usuário ── */
    React.createElement('div', { style: { marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 2 } },

      /* recolher */
      breakpoint === 'desktop' && React.createElement('button', {
        type: 'button',
        onClick: () => setRecolhida((v) => !v),
        title: recolhida ? 'Expandir menu' : 'Recolher menu',
        'aria-label': recolhida ? 'Expandir menu' : 'Recolher menu',
        style: {
          width: '100%', minHeight: 36,
          display: 'flex', alignItems: 'center',
          justifyContent: somenteIcone ? 'center' : 'flex-start', gap: 10,
          padding: somenteIcone ? 0 : '0 10px',
          border: 'none', borderRadius: 8,
          background: 'transparent', color: T.railText, cursor: 'pointer',
          fontSize: 12.5,
        },
        onMouseEnter: (e) => { e.target.style.background = T.surfaceAlt; },
        onMouseLeave: (e) => { e.target.style.background = 'transparent'; },
      },
        recolhida ? React.createElement(PanelLeftOpen, { size: 17 }) : React.createElement(PanelLeftClose, { size: 17 }),
        !somenteIcone && React.createElement('span', { style: { fontSize: 12.5, fontWeight: 500 } }, 'Recolher'),
      ),

      /* tema */
      !somenteIcone && React.createElement('button', {
        onClick: toggle,
        title: isDark ? 'Modo claro' : 'Modo escuro',
        style: {
          width: '100%', height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: 0,
          border: 'none', borderRadius: 8,
          cursor: 'pointer', background: 'transparent',
        },
        onMouseEnter: (e) => { e.target.style.background = T.surfaceAlt; },
        onMouseLeave: (e) => { e.target.style.background = 'transparent'; },
      },
        React.createElement(Sun, { size: 14, color: isDark ? T.textMuted : T.warning }),
        React.createElement('div', {
          style: {
            width: 32, height: 18, borderRadius: 9,
            background: isDark ? T.primary : '#D1D5DB',
            position: 'relative', transition: 'background 0.25s', flexShrink: 0,
          },
        },
          React.createElement('div', {
            style: {
              width: 14, height: 14, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 2,
              left: isDark ? 16 : 2,
              transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            },
          }),
        ),
        React.createElement(Moon, { size: 14, color: isDark ? T.primary : T.textMuted }),
      ),

      somenteIcone && React.createElement('button', {
        onClick: toggle,
        title: isDark ? 'Modo claro' : 'Modo escuro',
        style: {
          width: '100%', height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', borderRadius: 8, cursor: 'pointer',
          background: 'transparent', color: T.railText,
        },
        onMouseEnter: (e) => { e.target.style.background = T.surfaceAlt; },
        onMouseLeave: (e) => { e.target.style.background = 'transparent'; },
      },
        isDark ? React.createElement(Sun, { size: 18 }) : React.createElement(Moon, { size: 18 }),
      ),

      /* ── usuário ── */
      !somenteIcone && React.createElement('div', { style: { position: 'relative', marginTop: 4 } },
        React.createElement('button', {
          onClick: () => setMenuUsuarioAberto((v) => !v),
          style: {
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px',
            border: 'none', borderRadius: 8,
            cursor: 'pointer', background: 'transparent',
            textAlign: 'left',
          },
          onMouseEnter: (e) => { if (!menuUsuarioAberto) e.target.style.background = T.surfaceAlt; },
          onMouseLeave: (e) => { if (!menuUsuarioAberto) e.target.style.background = 'transparent'; },
        },
          React.createElement('div', {
            style: {
              width: 32, height: 32, flexShrink: 0,
              borderRadius: '50%',
              background: T.primarySoft,
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
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('div', {
              style: { fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
            }, op?.nome || 'Usuário'),
            React.createElement('div', { style: { fontSize: 11, color: T.textMuted, fontWeight: 500 } }, papel),
          ),
        ),

        menuUsuarioAberto && React.createElement(React.Fragment, null,
          React.createElement('button', {
            type: 'button', onClick: () => setMenuUsuarioAberto(false),
            style: { position: 'fixed', inset: 0, background: 'transparent', border: 'none', zIndex: 98 },
          }),
          React.createElement('div', {
            style: {
              position: 'absolute', bottom: '100%', left: 0, right: 0,
              marginBottom: 6,
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 10, boxShadow: T.shadowMd, padding: 4, zIndex: 101,
            },
          },
            React.createElement('button', {
              onClick: () => { setMenuUsuarioAberto(false); logout(); },
              style: {
                width: '100%', minHeight: 38,
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 12px', border: 'none', borderRadius: 6,
                background: 'transparent', color: '#DC2626',
                cursor: 'pointer', fontSize: 13, fontWeight: 500, textAlign: 'left',
              },
              onMouseEnter: (e) => { e.target.style.background = T.dangerSoft; },
              onMouseLeave: (e) => { e.target.style.background = 'transparent'; },
            },
              React.createElement(LogOut, { size: 16 }),
              'Sair',
            ),
          ),
        ),
      ),

      somenteIcone && React.createElement('button', {
        onClick: logout,
        title: 'Sair (' + (op?.nome || '') + ')',
        style: {
          width: '100%', height: 40, marginTop: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'transparent', color: T.railText,
        },
        onMouseEnter: (e) => { e.target.style.background = T.dangerSoft; e.target.style.color = '#DC2626'; },
        onMouseLeave: (e) => { e.target.style.background = 'transparent'; e.target.style.color = T.railText; },
      },
        React.createElement(LogOut, { size: 18 }),
      ),

      /* versão */
      !somenteIcone && React.createElement('div', {
        style: { textAlign: 'center', fontSize: 10, color: T.textMuted, padding: '8px 0 2px', fontWeight: 400 },
      }, 'v4.2.1'),
    ),
  );
}
