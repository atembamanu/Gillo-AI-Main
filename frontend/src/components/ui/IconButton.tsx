import React from 'react';

type IconButtonVariant = 'ghost' | 'danger';

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
}

const baseClasses =
  'inline-flex items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2';

const variantClasses: Record<IconButtonVariant, string> = {
  ghost: 'text-brand-dark hover:bg-brand-dark/5',
  danger: 'text-brand-danger hover:bg-brand-danger/10',
};

export const IconButton: React.FC<IconButtonProps> = ({
  variant = 'ghost',
  className = '',
  children,
  ...props
}) => {
  const classes = [baseClasses, variantClasses[variant], className]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={props.type ?? 'button'} className={classes} {...props}>
      {children}
    </button>
  );
};

