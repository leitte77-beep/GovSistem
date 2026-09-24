var _LIGHT = {
  bg: '#F3F5F8',
  surface: '#ffffff',
  surfaceAlt: '#F3F5F8',
  surfaceMuted: '#e9edef',

  border: '#E7EAF0',
  borderStrong: '#D1D5DB',

  text: '#111827',
  textSecondary: '#3F4A5A',
  textMuted: '#5B6573',

  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primarySoft: '#dbeafe',
  chartBar: '#dbeafe',
  primaryGradient: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',

  link: '#2563eb',
  linkHover: '#1d4ed8',

  success: '#16A34A',
  successSoft: '#E7F6EC',
  successDark: '#064E3B',
  successLight: '#DCFCE7',
  warning: '#D97706',
  warningSoft: '#FEF3E2',
  danger: '#DC2626',
  dangerDark: '#991B1B',
  dangerSoft: '#FDECEC',
  online: '#22C55E',
  offline: '#B6C0CE',

  bubbleIn: '#FFFFFF',
  bubbleOut: '#E8F0FE',
  bubbleOutMeta: '#667781',
  bubbleOutReplyBg: 'rgba(0,0,0,0.05)',
  bubbleOutReplyBorder: '#2563EB',
  bubbleOutReplyText: '#54656f',
  bubbleOutAuthor: '#2563EB',
  bubbleOutTagBg: 'transparent',
  bubbleMediaBg: 'rgba(255,255,255,0.6)',
  bubbleMediaText: '#191c1e',
  bubbleMediaMeta: '#54656f',

  radius: 12,
  radiusSm: 8,
  radiusLg: 16,
  shadow: '0 8px 30px rgba(15, 23, 42, 0.08)',
  shadowMd: '0 4px 16px rgba(16,26,42,0.10)',
  shadowLg: '0 12px 40px rgba(16,26,42,0.16)',

  railBg: '#ffffff',
  railText: '#54656f',
  railActive: '#2563eb',

  whatsappGreen: '#25d366',
  whatsappGreenSoft: 'rgba(37, 211, 102, 0.12)',
  whatsappStatusBg: '#E7F6EC',
  whatsappStatusText: '#004a1c',
  whatsappStatusIcon: '#25d366',

  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

var _DARK = {
  // Fundo principal — o mais profundo
  bg: '#0A1120',

  // Cards "flutuam" acima do fundo com luminância claramente maior
  surface: '#24344D',
  surfaceAlt: '#18263C',
  surfaceMuted: '#1E2D44',

  // Hover — tom intermediário bem visível
  hover: '#365276',

  // Bordas — sutis, com transparência para definição sem peso
  border: 'rgba(255,255,255,0.08)',
  borderStrong: '#3E5370',

  // Texto — 4 níveis de hierarquia com contraste AA+
  text: '#FFFFFF',
  textSecondary: '#E8EDF7',
  textMuted: '#C8D1DF',

  primary: '#3B82F6',
  primaryHover: '#60A5FA',
  primarySoft: 'rgba(59, 130, 246, 0.18)',
  chartBar: '#3B82F6',
  primaryGradient: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',

  link: '#60A5FA',
  linkHover: '#93C5FD',

  success: '#22C55E',
  successSoft: 'rgba(34, 197, 94, 0.15)',
  successDark: '#064E3B',
  successLight: '#86EFAC',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.15)',
  danger: '#EF4444',
  dangerDark: '#FCA5A5',
  dangerSoft: 'rgba(239, 68, 68, 0.15)',
  online: '#22C55E',
  offline: '#4B5563',

  // Bolhas do WhatsApp
  bubbleIn: '#24344D',
  bubbleOut: '#005C4B',
  bubbleOutMeta: '#94A3B8',
  bubbleOutReplyBg: '#00473A',
  bubbleOutReplyBorder: '#2A9D8F',
  bubbleOutReplyText: '#C7D3CF',
  bubbleOutAuthor: '#7DD3FC',
  bubbleOutTagBg: 'rgba(0, 0, 0, 0.18)',
  bubbleMediaBg: '#2E4464',
  bubbleMediaText: '#E8EDF7',
  bubbleMediaMeta: '#C8D1DF',

  // Tags / departamentos
  accentBlueLight: '#60A5FA',
  tagTributacao: '#4C1D95',
  tagTributacaoText: '#E9D5FF',
  tagNotificacoes: '#1E3A5F',
  tagNotificacoesText: '#93C5FD',
  tagLicitacao: '#7F1D1D',
  tagLicitacaoText: '#FCA5A5',
  tagCompras: '#831843',
  tagComprasText: '#F9A8D4',

  radius: 12,
  radiusSm: 8,
  radiusLg: 16,
  shadow: '0 8px 24px rgba(0,0,0,0.30)',
  shadowMd: '0 12px 32px rgba(0,0,0,0.35)',
  shadowLg: '0 20px 60px rgba(0,0,0,0.50)',

  railBg: '#111C2F',
  railText: '#C8D1DF',
  railActive: '#60A5FA',

  // WhatsApp
  whatsappGreen: '#22C55E',
  whatsappGreenSoft: 'rgba(34, 197, 94, 0.12)',
  whatsappStatusBg: '#0A2E1F',
  whatsappStatusText: '#86EFAC',
  whatsappStatusIcon: '#22C55E',

  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

var _isDark = false;

try {
  _isDark = localStorage.getItem('chatgov_theme') === 'dark';
} catch (e) {
  _isDark = false;
}

export var T = new Proxy({}, {
  get: function (_, prop) {
    var source = _isDark ? _DARK : _LIGHT;
    return source[prop];
  }
});

export function _setThemeMode(isDark) {
  _isDark = isDark;
  try { localStorage.setItem('chatgov_theme', isDark ? 'dark' : 'light'); } catch (e) {}
}

export function _getThemeMode() {
  return _isDark;
}

export var TDark = _DARK;

export var CORES_DEPT = [
  '#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#EA580C',
  '#D97706', '#16A34A', '#0891B2', '#4F46E5', '#0D9488',
];
