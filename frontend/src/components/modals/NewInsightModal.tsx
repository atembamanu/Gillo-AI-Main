import React, { useRef } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { TextArea } from '../ui/TextArea';
import { Select } from '../ui/Select';
import type { Bucket } from '../../api/buckets';

interface NewInsightModalProps {
  buckets: Bucket[];
  bucketId: string;
  onBucketIdChange: (id: string) => void;
  mode: 'text' | 'audio';
  onModeChange: (mode: 'text' | 'audio') => void;
  text: string;
  onTextChange: (value: string) => void;
  isRecording: boolean;
  recordSeconds: number;
  onRecordToggle: () => void;
  hasRecording: boolean;
  audioPreviewUrl?: string | null;
  onResetRecording: () => void;
  onAudioFileSelected?: (file: File) => void;
  onAddBucket: () => void;
  onCreate: () => void | Promise<void>;
  onCancel: () => void;
}

const ACCEPT_AUDIO = 'audio/*,.webm,.mp3,.m4a,.wav,.ogg';

export function NewInsightModal({
  buckets,
  bucketId,
  onBucketIdChange,
  mode,
  onModeChange,
  text,
  onTextChange,
  isRecording,
  recordSeconds,
  onRecordToggle,
  hasRecording,
  audioPreviewUrl,
  onResetRecording,
  onAudioFileSelected,
  onAddBucket,
  onCreate,
  onCancel,
}: NewInsightModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Modal zIndex={30} panelClassName="max-w-lg w-full rounded-2xl bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-brand-dark">New insight</h3>
        <Button type="button" variant="ghost" size="sm" className="px-1 text-xs text-brand-dark/70" onClick={onCancel}>
          Close
        </Button>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-brand-dark/80">Bucket</label>
          <Select value={bucketId} onChange={(e) => onBucketIdChange(e.target.value)}>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-5 text-[11px]" onClick={onAddBucket}>
          + Add bucket
        </Button>
      </div>
      <div className="mb-3 flex gap-2 text-xs font-medium">
        <Button
          type="button"
          variant={mode === 'text' ? 'primary' : 'ghost'}
          size="sm"
          className={`flex-1 rounded-full ${mode === 'text' ? '' : 'bg-brand-bg text-brand-dark'}`}
          onClick={() => onModeChange('text')}
        >
          Text
        </Button>
        <Button
          type="button"
          variant={mode === 'audio' ? 'primary' : 'ghost'}
          size="sm"
          className={`flex-1 rounded-full ${mode === 'audio' ? '' : 'bg-brand-bg text-brand-dark'}`}
          onClick={() => onModeChange('audio')}
        >
          Audio
        </Button>
      </div>
      {mode === 'text' ? (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-brand-dark/80">Note text</label>
          <TextArea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Paste or type your note..."
            rows={4}
          />
        </div>
      ) : (
        <div className="mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_AUDIO}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && onAudioFileSelected) onAudioFileSelected(file);
              e.target.value = '';
            }}
          />
          <div className="mb-3 flex flex-col items-center">
            <div className="mb-2 flex h-32 w-32 items-center justify-center rounded-full bg-brand-primary/10">
              <Button
                type="button"
                size="sm"
                className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-primary text-white text-xs font-semibold px-0"
                onClick={() => onRecordToggle()}
              >
                {!hasRecording && !isRecording
                  ? 'Record'
                  : isRecording
                    ? 'Stop'
                    : 'Re-record'}
              </Button>
            </div>
            <p className="mb-1 text-xs font-medium text-brand-dark">
              {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
              {String(recordSeconds % 60).padStart(2, '0')}
            </p>
            {!hasRecording && !isRecording && onAudioFileSelected && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload a file
              </Button>
            )}
            {hasRecording && audioPreviewUrl && !isRecording && (
              <div className="mt-2 w-full">
                <audio
                  controls
                  className="w-full rounded-lg bg-brand-bg"
                  src={audioPreviewUrl}
                >
                  Your browser does not support the audio element.
                </audio>
                <div className="mt-2 flex justify-between text-[11px] text-brand-dark/70">
                  <span>Preview your recording.</span>
                  <button
                    type="button"
                    className="text-brand-danger underline"
                    onClick={onResetRecording}
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
            {!hasRecording && !isRecording && (
              <p className="mt-2 text-[11px] text-brand-dark/70 text-center">
                Record with the button above or upload an existing audio file.
              </p>
            )}
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={
            (mode === 'text' && (!text.trim() || !bucketId)) ||
            (mode === 'audio' && (!bucketId || !hasRecording))
          }
          onClick={onCreate}
        >
          Create insight
        </Button>
      </div>
    </Modal>
  );
}
