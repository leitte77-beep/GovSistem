var _LIGHT = {
  bg: '#f0f2f5',
  surface: '#ffffff',
  surfaceAlt: '#f0f2f5',
  surfaceMuted: '#e9edef',

  border: '#e9edef',
  borderStrong: '#d1d7db',

  text: '#191c1e',
  textSecondary: '#54656f',
  textMuted: '#8696a0',

  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primarySoft: '#dbeafe',
  chartBar: '#dbeafe',
  primaryGradient: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',

  success: '#16A34A',
  successSoft: '#E7F6EC',
  successDark: '#064E3B',
  successLight: '#DCFCE7',
  warning: '#D97706',
  warningSoft: '#FEF3E2',
  danger: '#DC2626',
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
  shadow: '0 1px 2px rgba(16,26,42,0.06)',
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
  bg: '#0D1117',
  surface: '#1A1D23',
  surfaceAlt: '#121212',
  surfaceMuted: '#2A2D35',

  border: '#2A2D35',
  borderStrong: '#3F4355',

  text: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',

  primary: '#2563EB',
  primaryHover: '#3B82F6',
  primarySoft: 'rgba(37, 99, 235, 0.15)',
  chartBar: '#3B5B8C',
  primaryGradient: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',

  success: '#10B981',
  successSoft: 'rgba(16, 185, 129, 0.12)',
  successDark: '#064E3B',
  successLight: '#6EE7B7',
  warning: '#D97706',
  warningSoft: 'rgba(217, 119, 6, 0.12)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.12)',
  online: '#22C55E',
  offline: '#4B5563',

  bubbleIn: '#1A1D23',
  bubbleOut: '#005C4B',
  bubbleOutMeta: '#8696A0',
  bubbleOutReplyBg: '#00473A',
  bubbleOutReplyBorder: '#2A9D8F',
  bubbleOutReplyText: '#C7D3CF',
  bubbleOutAuthor: '#7DD3FC',
  bubbleOutTagBg: 'rgba(0, 0, 0, 0.18)',
  bubbleMediaBg: '#00473A',
  bubbleMediaText: '#E9EDEF',
  bubbleMediaMeta: '#A7C7BE',

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
  shadow: '0 1px 2px rgba(0,0,0,0.2)',
  shadowMd: '0 4px 16px rgba(0,0,0,0.3)',
  shadowLg: '0 12px 40px rgba(0,0,0,0.4)',

  railBg: '#0D1117',
  railText: '#9CA3AF',
  railActive: '#60A5FA',

  whatsappGreen: '#25d366',
  whatsappGreenSoft: 'rgba(37, 211, 102, 0.12)',
  whatsappStatusBg: '#052E2B',
  whatsappStatusText: '#A7F3D0',
  whatsappStatusIcon: '#34D399',

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
