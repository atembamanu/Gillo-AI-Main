import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const baseClasses =
  'rounded border border-brand-dark/20 px-2 py-1.5 text-sm text-brand-dark';

export const Input: React.FC<InputProps> = ({ className = '', ...props }) => {
  const classes = [baseClasses, className].filter(Boolean).join(' ');
  return <input className={classes} {...props} />;
};

