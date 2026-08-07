const LIGHT = {
  bg: '#F3F5F8',
  surface: '#ffffff',
  surfaceAlt: '#F3F5F8',
  surfaceMuted: '#e9edef',
  border: '#E7EAF0',
  borderStrong: '#D1D5DB',
  text: '#111827',
  textSecondary: '#667085',
  textMuted: '#8696a0',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primarySoft: '#dbeafe',
  success: '#16A34A',
  successSoft: '#E7F6EC',
  warning: '#D97706',
  warningSoft: '#FEF3E2',
  danger: '#DC2626',
  dangerSoft: '#FDECEC',
  radius: 12,
  radiusSm: 8,
  radiusLg: 16,
  shadow: '0 8px 30px rgba(15,23,42,0.08)',
  shadowMd: '0 4px 16px rgba(16,26,42,0.10)',
  shadowLg: '0 12px 40px rgba(16,26,42,0.16)',
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  maxWidth: '480px',
};

export const T = new Proxy({}, {
  get(_, prop) { return LIGHT[prop]; }
});
