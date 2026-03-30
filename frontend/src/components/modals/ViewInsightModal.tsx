import React from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import type { Note } from '../../api/notes';

interface ViewInsightModalProps {
  note: Note;
  bucketName: string;
  onClose: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function ViewInsightModal({
  note,
  bucketName,
  onClose,
  onArchive,
  onDelete,
}: ViewInsightModalProps) {
  return (
    <Modal zIndex={20} panelClassName="max-w-lg rounded-2xl bg-white p-4 shadow-lg">
      <h3 className="mb-2 text-sm font-semibold text-brand-dark">
        {bucketName} · {new Date(note.createdAt).toLocaleString()}
      </h3>
      <p className="mb-1 text-xs font-medium text-brand-dark">Original text</p>
      <pre className="mb-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-brand-bg p-3 text-xs text-brand-dark">
        {note.originalText}
      </pre>
      <p className="mb-1 text-xs font-medium text-brand-dark">Insights</p>
      {Object.keys(note.structured).length === 0 ? (
        <p className="text-xs text-brand-primary">Processing…</p>
      ) : (
        <ul className="mb-3 list-disc pl-5 text-xs text-brand-dark">
          {Object.entries(note.structured).map(([k, v]) => (
            <li key={k}>
              <span className="font-medium text-brand-dark">{k}:</span>{' '}
              {Array.isArray(v) ? v.join(', ') : String(v)}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onArchive}>
          Archive
        </Button>
        <Button type="button" variant="danger" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Modal>
  );
}
