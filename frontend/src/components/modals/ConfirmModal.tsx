import React from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';

type ConfirmVariant = 'danger' | 'primary';

interface ConfirmModalProps {
  title: string;
  description: React.ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  confirmVariant?: ConfirmVariant;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  zIndex?: number;
}

export function ConfirmModal({
  title,
  description,
  cancelLabel = 'Cancel',
  confirmLabel,
  confirmVariant = 'primary',
  onCancel,
  onConfirm,
  zIndex = 20,
}: ConfirmModalProps) {
  const handleConfirm = () => {
    const result = onConfirm();
    if (result instanceof Promise) {
      result.catch(() => {});
    }
  };

  return (
    <Modal zIndex={zIndex} panelClassName="max-w-md rounded-2xl bg-white p-4 shadow-lg">
      <h3 className="mb-2 text-sm font-semibold text-brand-dark">{title}</h3>
      <div className="mb-3 text-xs text-brand-dark/70">{description}</div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={confirmVariant}
          size="sm"
          onClick={handleConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
