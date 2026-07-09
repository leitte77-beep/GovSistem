import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { T, _setThemeMode, _getThemeMode } from '../theme';

var ThemeContext = createContext(null);

export function ThemeProvider(_ref) {
  var children = _ref.children;

  var _useState = useState(_getThemeMode);
  var isDark = _useState[0];
  var setIsDark = _useState[1];

  useEffect(function () {
    var html = document.documentElement;
    if (isDark) {
      html.classList.add('dark');
      html.classList.remove('light');
    } else {
      html.classList.add('light');
      html.classList.remove('dark');
    }
    _setThemeMode(isDark);
  }, [isDark]);

  var toggle = useCallback(function () {
    setIsDark(function (v) { return !v; });
  }, []);

  return React.createElement(ThemeContext.Provider, {
    value: { isDark: isDark, toggle: toggle, theme: T }
  }, children);
}

export function useTheme() {
  var ctx = useContext(ThemeContext);
  if (!ctx) return { isDark: false, toggle: function () {}, theme: T };
  return ctx;
}
