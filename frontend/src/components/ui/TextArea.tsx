import React from 'react';

export interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const baseClasses =
  'w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark';

export const TextArea: React.FC<TextAreaProps> = ({
  className = '',
  ...props
}) => {
  const classes = [baseClasses, className].filter(Boolean).join(' ');
  return <textarea className={classes} {...props} />;
};

