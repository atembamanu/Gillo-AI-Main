import React from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { TextArea } from '../ui/TextArea';
import type { BucketField } from '../../api/buckets';

const removeFieldSvg = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-5">
    <path fillRule="evenodd" d="M2.515 10.674a1.875 1.875 0 0 0 0 2.652L8.89 19.7c.352.351.829.549 1.326.549H19.5a3 3 0 0 0 3-3V6.75a3 3 0 0 0-3-3h-9.284c-.497 0-.974.198-1.326.55l-6.375 6.374ZM12.53 9.22a.75.75 0 1 0-1.06 1.06L13.19 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L15.31 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" clipRule="evenodd" />
  </svg>
);

interface EditBucketModalProps {
  bucketName: string;
  onBucketNameChange: (name: string) => void;
  fields: BucketField[];
  onFieldChange: (index: number, part: keyof BucketField, value: string) => void;
  onRemoveField: (index: number) => void;
  onAddField: () => void;
  onGenerateAiDescription: (fieldIndex: number) => Promise<void>;
  generatingFieldIndex: number | null;
  onSave: () => void;
  onCancel: () => void;
}

export function EditBucketModal({
  bucketName,
  onBucketNameChange,
  fields,
  onFieldChange,
  onRemoveField,
  onAddField,
  onGenerateAiDescription,
  generatingFieldIndex,
  onSave,
  onCancel,
}: EditBucketModalProps) {
  return (
    <Modal
      zIndex={30}
      panelClassName="max-w-lg w-full flex max-h-[90vh] flex-col rounded-2xl bg-white shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-brand-dark/10 p-4">
        <h3 className="text-sm font-semibold text-brand-dark">Edit bucket</h3>
        <Button type="button" variant="ghost" size="sm" className="px-1 text-xs text-brand-dark/70" onClick={onCancel}>
          ✕
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <Input
          type="text"
          value={bucketName}
          onChange={(e) => onBucketNameChange(e.target.value)}
          placeholder="Bucket name"
          className="mb-4 w-full"
        />
        <ul className="mb-4 space-y-3">
          {fields.map((f, i) => (
            <li key={i} className="rounded border border-brand-dark/10 bg-white p-2">
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={f.name}
                  onChange={(e) => onFieldChange(i, 'name', e.target.value)}
                  placeholder="Field name"
                  className="min-w-0 flex-1 py-1 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 px-1 text-sm text-red-400 hover:underline"
                  onClick={() => onRemoveField(i)}
                >
                  {removeFieldSvg}
                </Button>
              </div>
              <TextArea
                value={f.ai_description ?? ''}
                onChange={(e) => onFieldChange(i, 'ai_description', e.target.value)}
                placeholder="Field description — type here or use the button below to generate or enhance with AI"
                rows={2}
                className="mt-1.5 w-full text-xs"
              />
              <div className="mt-1.5 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!f.name.trim() || generatingFieldIndex === i}
                  onClick={() => onGenerateAiDescription(i)}
                >
                  {generatingFieldIndex === i
                    ? 'Generating…'
                    : (f.ai_description ?? '').trim()
                      ? '✨ Enhance'
                      : '✨ Generate'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="px-1 text-brand-primary hover:underline" onClick={onAddField}>
            Add field
          </Button>
          <Button type="button" size="sm" onClick={onSave}>
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
