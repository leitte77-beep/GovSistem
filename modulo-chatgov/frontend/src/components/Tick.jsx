import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { T } from '../theme';

export function Tick({ status }) {
  if (status === 'lido') return React.createElement(CheckCheck, { size: 14, color: T.primary });
  if (status === 'entregue') return React.createElement(CheckCheck, { size: 14, color: T.textMuted });
  return React.createElement(Check, { size: 14, color: T.textMuted });
}
