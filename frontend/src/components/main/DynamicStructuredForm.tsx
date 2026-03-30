import { useState, useMemo } from 'react';

export type StructuredData = Record<string, unknown>;

function structuredToFields(structured: StructuredData): { key: string; value: string }[] {
  const entries = Object.entries(structured ?? {}).filter(
    ([_, v]) => v !== null && v !== undefined
  );
  return entries.map(([key, value]) => ({
    key,
    value: Array.isArray(value)
      ? value.map(String).join('\n')
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value),
  }));
}

function fieldsToStructured(fields: { key: string; value: string }[]): StructuredData {
  const out: Record<string, string | string[]> = {};
  for (const { key, value } of fields) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    const trimmedValue = value.trim();
    if (trimmedValue.includes('\n')) {
      out[trimmedKey] = trimmedValue.split('\n').map((s) => s.trim()).filter(Boolean);
    } else {
      out[trimmedKey] = trimmedValue;
    }
  }
  return out;
}

interface DynamicStructuredFormProps {
  structured: StructuredData;
  onSave: (value: StructuredData) => void;
  onCancel?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
}

export function DynamicStructuredForm({
  structured,
  onSave,
  onCancel,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
}: DynamicStructuredFormProps) {
  const initialFields = useMemo(() => structuredToFields(structured), [structured]);
  const [fields, setFields] = useState<{ key: string; value: string }[]>(initialFields);

  const addField = () => {
    setFields((prev) => [...prev, { key: '', value: '' }]);
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const updateField = (index: number, part: 'key' | 'value', value: string) => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, [part]: value } : f))
    );
  };

  const handleSave = () => {
    const next = fieldsToStructured(fields);
    onSave(next);
  };

  return (
    <div className="dynamic-structured-form">
      <p className="mb-4 text-sm font-medium text-brand-dark">
        Edit the information below. Add or remove rows as needed.
      </p>
      <div className="space-y-4">
        {fields.map((field, index) => (
          <div
            key={index}
            className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-start"
          >
            <input
              type="text"
              placeholder="Field name"
              value={field.key}
              onChange={(e) => updateField(index, 'key', e.target.value)}
              aria-label="Field name"
              className="rounded-lg border border-brand-dark/20 px-3 py-2 text-brand-dark shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:text-sm"
            />
            <textarea
              placeholder="Value"
              value={field.value}
              onChange={(e) => updateField(index, 'value', e.target.value)}
              aria-label="Value"
              rows={field.value.includes('\n') ? 3 : 1}
              className="min-h-[40px] w-full resize-y rounded-lg border border-brand-dark/20 px-3 py-2 text-brand-dark shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary sm:text-sm"
            />
            <button
              type="button"
              onClick={() => removeField(index)}
              aria-label="Remove field"
              className="rounded-lg bg-brand-dark px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark/90 focus:outline-none focus:ring-2 focus:ring-brand-dark focus:ring-offset-2 sm:py-2.5"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addField}
          className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark/90 focus:outline-none focus:ring-2 focus:ring-brand-dark focus:ring-offset-2"
        >
          Add field
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
        >
          {saveLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-brand-dark/20 bg-brand-bg px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-bg/80 focus:outline-none focus:ring-2 focus:ring-brand-dark focus:ring-offset-2"
          >
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
}
