import React from 'react';

interface ModalProps {
  children: React.ReactNode;
  zIndex?: number;
  panelClassName?: string;
}

export function Modal({
  children,
  zIndex = 20,
  panelClassName = 'max-w-md w-full rounded-2xl bg-white p-4 shadow-lg',
}: ModalProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-[#304050]/40 px-4 py-4"
      style={{ zIndex }}
    >
      <div className={panelClassName}>{children}</div>
    </div>
  );
}
