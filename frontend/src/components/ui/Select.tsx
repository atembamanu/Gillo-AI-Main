import React from 'react';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const baseClasses =
  'w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-xs text-brand-dark';

export const Select: React.FC<SelectProps> = ({ className = '', ...props }) => {
  const classes = [baseClasses, className].filter(Boolean).join(' ');
  return <select className={classes} {...props} />;
};

