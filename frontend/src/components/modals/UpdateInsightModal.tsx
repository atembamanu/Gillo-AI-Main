import React from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { TextArea } from '../ui/TextArea';
import { IconButton } from '../ui/IconButton';

const trashSvg = (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
  </svg>
);

export type EditField = { key: string; value: string };

interface UpdateInsightModalProps {
  subtitle: string;
  originalText: string;
  editFields: EditField[];
  onEditFieldsChange: React.Dispatch<React.SetStateAction<EditField[]>>;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
}

export function UpdateInsightModal({
  subtitle,
  originalText,
  editFields,
  onEditFieldsChange,
  onSave,
  onCancel,
}: UpdateInsightModalProps) {
  return (
    <Modal zIndex={30} panelClassName="max-w-lg w-full rounded-2xl bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-brand-dark">Update insight</h3>
        <Button type="button" variant="ghost" size="sm" className="px-1 text-xs text-brand-dark/70" onClick={onCancel}>
          X
        </Button>
      </div>
      <p className="mb-1.5 text-xs text-brand-dark/70">{subtitle}</p>
      <div className="mb-3 rounded-lg border border-brand-dark/10 bg-brand-dark/[0.02] px-3 py-2">
        <p className="text-xs text-brand-dark/80 whitespace-pre-wrap break-words">{originalText || '—'}</p>
      </div>
      <div className="mb-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-1 text-xs font-medium text-brand-primary"
          onClick={() => onEditFieldsChange((prev) => [...prev, { key: '', value: '' }])}
        >
          + Add field
        </Button>
      </div>
      <div className="max-h-72 space-y-0 overflow-auto pr-1">
        {editFields.map((field, index) => (
          <div key={index} className="py-2 pr-2">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={field.key}
                onChange={(e) =>
                  onEditFieldsChange((prev) =>
                    prev.map((f, i) => (i === index ? { ...f, key: e.target.value } : f))
                  )
                }
                placeholder="Field label"
                className="min-w-0 flex-1 px-2 py-1 text-xs"
              />
              <IconButton
                type="button"
                variant="danger"
                className="h-8 w-8 shrink-0"
                aria-label="Delete field"
                onClick={() => onEditFieldsChange((prev) => prev.filter((_, i) => i !== index))}
              >
                {trashSvg}
              </IconButton>
            </div>
            <TextArea
              value={field.value}
              onChange={(e) =>
                onEditFieldsChange((prev) =>
                  prev.map((f, i) => (i === index ? { ...f, value: e.target.value } : f))
                )
              }
              placeholder="Value"
              rows={field.value.includes('\n') ? 3 : 1}
              className="mt-1.5 min-h-[32px] w-full px-2 py-1 text-xs"
            />
            {index < editFields.length - 1 && (
              <hr className="mt-3 border-t border-dotted border-brand-dark/20" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={onSave}>
          Save changes
        </Button>
      </div>
    </Modal>
  );
}
