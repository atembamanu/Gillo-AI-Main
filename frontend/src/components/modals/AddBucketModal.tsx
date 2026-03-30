import React from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { TextArea } from '../ui/TextArea';
import type { BucketField } from '../../api/buckets';

interface AddBucketModalProps {
  bucketName: string;
  onBucketNameChange: (name: string) => void;
  fields: BucketField[];
  onFieldChange: (index: number, part: keyof BucketField, value: string) => void;
  onAddField: () => void;
  onRemoveField: (index: number) => void;
  onGenerateAiDescription: (fieldIndex: number) => Promise<void>;
  generatingFieldIndex: number | null;
  onSave: () => void;
  onCancel: () => void;
}

export function AddBucketModal({
  bucketName,
  onBucketNameChange,
  fields,
  onFieldChange,
  onAddField,
  onRemoveField,
  onGenerateAiDescription,
  generatingFieldIndex,
  onSave,
  onCancel,
}: AddBucketModalProps) {
  return (
    <Modal zIndex={40} panelClassName="max-w-md w-full rounded-2xl bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-brand-dark">Add bucket</h3>
        <Button type="button" variant="ghost" size="sm" className="px-1 text-xs text-brand-dark/70" onClick={onCancel}>
          X
        </Button>
      </div>
      <Input
        type="text"
        value={bucketName}
        onChange={(e) => onBucketNameChange(e.target.value)}
        placeholder="Bucket name"
        className="mb-3 w-full px-3 py-2 text-sm"
      />
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-medium text-brand-dark/70">Fields (AI will extract only these keys)</p>
        <Button type="button" variant="ghost" size="sm" className="text-[11px] px-1 text-brand-primary" onClick={onAddField}>
          + Add field
        </Button>
      </div>
      <ul className="mb-3 space-y-3">
        {fields.map((f, i) => (
          <li key={i} className="rounded border border-brand-dark/10 bg-white p-2">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={f.name}
                onChange={(e) => onFieldChange(i, 'name', e.target.value)}
                placeholder="Field name (e.g. Driver)"
                className="min-w-0 flex-1 px-2 py-1.5 text-xs"
              />
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-[11px] px-1 text-brand-danger"
                  aria-label="Remove field"
                  onClick={() => onRemoveField(i)}
                >
                  ✕
                </Button>
              )}
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
                className="text-xs"
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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={!bucketName.trim()} onClick={onSave}>
          Save bucket
        </Button>
      </div>
    </Modal>
  );
}
