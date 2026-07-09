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
  primaryGradient: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',

  success: '#16A34A',
  successSoft: '#E7F6EC',
  warning: '#D97706',
  warningSoft: '#FEF3E2',
  danger: '#DC2626',
  dangerSoft: '#FDECEC',
  online: '#22C55E',
  offline: '#B6C0CE',

  bubbleIn: '#FFFFFF',
  bubbleOut: '#E8F0FE',

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

  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

var _DARK = {
  bg: '#0f1117',
  surface: '#1a1d27',
  surfaceAlt: '#1e2130',
  surfaceMuted: '#252838',

  border: '#2d3143',
  borderStrong: '#3f4355',

  text: '#e4e6eb',
  textSecondary: '#b0b3b8',
  textMuted: '#6b7280',

  primary: '#3b82f6',
  primaryHover: '#60a5fa',
  primarySoft: 'rgba(59, 130, 246, 0.15)',
  primaryGradient: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',

  success: '#22C55E',
  successSoft: 'rgba(34, 197, 94, 0.12)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.12)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.12)',
  online: '#22C55E',
  offline: '#4B5563',

  bubbleIn: '#1e2130',
  bubbleOut: '#1a2744',

  radius: 12,
  radiusSm: 8,
  radiusLg: 16,
  shadow: '0 1px 2px rgba(0,0,0,0.2)',
  shadowMd: '0 4px 16px rgba(0,0,0,0.3)',
  shadowLg: '0 12px 40px rgba(0,0,0,0.4)',

  railBg: '#161822',
  railText: '#b0b3b8',
  railActive: '#60a5fa',

  whatsappGreen: '#25d366',
  whatsappGreenSoft: 'rgba(37, 211, 102, 0.12)',

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
