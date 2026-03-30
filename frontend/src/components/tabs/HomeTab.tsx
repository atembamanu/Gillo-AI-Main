import React, { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import type { Note } from '../../api/notes';
import type { Bucket } from '../../api/buckets';
import { resolveMediaUrl } from '../../api/client';

interface HomeTabProps {
    loading: boolean;
    latestNonArchived: Note[];
    buckets: Bucket[];
    bucketName: (id: string) => string;
    onNewInsight: () => void;
    onEditInsight: (note: Note) => void;
    onViewInsight: (note: Note) => void;
    onArchiveInsight: (note: Note) => void;
    onDeleteInsight: (note: Note) => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({
  loading,
  latestNonArchived,
  buckets,
  bucketName,
  onNewInsight,
  onEditInsight,
  onViewInsight,
  onArchiveInsight,
  onDeleteInsight,
}) => {
  const [bucketFilterId, setBucketFilterId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [viewMode, setViewMode] = useState<'text' | 'audio'>('text');

  const filteredNotes = useMemo(() => {
    let list = latestNonArchived;
    if (bucketFilterId) {
      list = list.filter((n) => n.bucketId === bucketFilterId);
    }
    if (dateFrom) {
      const fromStart = new Date(dateFrom);
      fromStart.setHours(0, 0, 0, 0);
      list = list.filter((n) => new Date(n.createdAt) >= fromStart);
    }
    if (dateTo) {
      const toEnd = new Date(dateTo);
      toEnd.setHours(23, 59, 59, 999);
      list = list.filter((n) => new Date(n.createdAt) <= toEnd);
    }
    // Category filter: default to 'text' when category is missing.
    return list.filter((n) => (n.category ?? 'text') === viewMode);
  }, [latestNonArchived, bucketFilterId, dateFrom, dateTo, viewMode]);

  return (
    <>
      <section className="min-w-0 rounded-2xl border border-brand-dark/10 bg-brand-bg p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-4">
          <div className="w-4/5">
            <p className="text-sm font-medium text-brand-dark">Create new insight</p>
            <p className="text-xs text-brand-dark/70">
              You have messy data or a lot of notes? Let Gillo help you structure them.
            </p>
          </div>
          <div className="flex w-1/5 justify-end">
            <Button
              type="button"
              size="sm"
              className="rounded-full shadow-sm"
              onClick={onNewInsight}
            >
              + Add
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-6 min-w-0 sm:mt-8">
        <div className="mb-3 flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-brand-dark">Recent insights</h2>
          <div className="flex gap-2 text-xs font-medium">
            <Button
              type="button"
              variant={viewMode === 'text' ? 'primary' : 'ghost'}
              size="sm"
              className={`flex-1 rounded-full ${
                viewMode === 'text' ? '' : 'bg-brand-bg text-brand-dark'
              }`}
              onClick={() => setViewMode('text')}
            >
              Text
            </Button>
            <Button
              type="button"
              variant={viewMode === 'audio' ? 'primary' : 'ghost'}
              size="sm"
              className={`flex-1 rounded-full ${
                viewMode === 'audio' ? '' : 'bg-brand-bg text-brand-dark'
              }`}
              onClick={() => setViewMode('audio')}
            >
              Audio
            </Button>
          </div>
          <div className="flex min-w-0 flex-wrap items-end gap-3 sm:grid sm:grid-cols-3 sm:gap-3">
            {buckets.length > 0 && (
              <div className="flex w-full min-w-0 flex-col gap-1">
                <label
                  htmlFor="home-bucket-filter"
                  className="text-xs font-medium text-brand-dark/70"
                >
                  Bucket
                </label>
                <Select
                  id="home-bucket-filter"
                  value={bucketFilterId}
                  onChange={(e) => setBucketFilterId(e.target.value)}
                  className="w-full min-w-0"
                >
                  <option value="">All buckets</option>
                  {buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="flex w-full min-w-0 flex-nowrap items-end gap-3 sm:col-span-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label
                  htmlFor="home-date-from"
                  className="text-xs font-medium text-brand-dark/70"
                >
                  From date
                </label>
                <Input
                  id="home-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full min-w-0"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor="home-date-to" className="text-xs font-medium text-brand-dark/70">
                  To date
                </label>
                <Input
                  id="home-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full min-w-0"
                />
              </div>
            </div>
          </div>
        </div>
        {loading ? (
          <p className="text-brand-dark/60">Loading notes…</p>
        ) : filteredNotes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-brand-dark/20 bg-brand-bg/70 py-8 text-center text-brand-dark/60">
            {latestNonArchived.length === 0
              ? 'No insights yet. Add a note above.'
              : 'No insights match the current filters.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {filteredNotes.map((note) => {
              const hasError = Boolean(
                (note.structured as Record<string, unknown>)?._error
              );
              const isMapping = !hasError && Object.keys(note.structured).length === 0;

              const insightsContent = hasError ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-red-600">
                    {(note.structured as Record<string, unknown>)._error as string}
                  </span>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => onDeleteInsight(note)}
                  >
                    Delete
                  </Button>
                </div>
              ) : isMapping ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-brand-primary">Mapping...</span>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => onDeleteInsight(note)}
                  >
                    Delete
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-sm font-medium text-brand-dark">Insights</span>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-brand-dark sm:list-outside">
                    {Object.entries(note.structured)
                      .filter(([k]) => k !== '_error')
                      .map(([k, v]) => (
                        <li key={k}>
                          <span className="font-medium text-brand-dark">{k}:</span>{' '}
                          {Array.isArray(v) ? v.join(', ') : String(v)}
                        </li>
                      ))}
                  </ul>
                </>
              );

              return (
                <li
                  key={note.id}
                  className="rounded-2xl border border-brand-dark/10 bg-brand-bg p-4 shadow-sm sm:p-5"
                >
                  <div className="mb-2 text-xs font-medium text-brand-dark/60 sm:text-sm">
                    {bucketName(note.bucketId)} ·{' '}
                    {new Date(note.createdAt).toLocaleString()}
                  </div>

                  {viewMode === 'audio' ? (
                    <>
                      <div className="mb-3">
                        <span className="text-sm font-medium text-brand-dark">Audio</span>
                        {note.audioUrl ? (
                          <audio
                            controls
                            className="mt-1 w-full rounded-lg bg-white"
                            src={resolveMediaUrl(note.audioUrl)}
                          >
                            Your browser does not support the audio element.
                          </audio>
                        ) : (
                          <p className="mt-1 text-xs text-brand-dark/60">
                            Audio file not available yet.
                          </p>
                        )}
                      </div>
                      <div className="mb-3">
                        <span className="text-sm font-medium text-brand-dark">
                          Transcribed text
                        </span>
                        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-brand-dark">
                          {note.originalText}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <div className="mb-3">
                      <span className="text-sm font-medium text-brand-dark">Original</span>
                      <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-brand-dark">
                        {note.originalText}
                      </pre>
                    </div>
                  )}

                  <div className="mb-4">{insightsContent}</div>

                  <div className="flex flex-wrap gap-2">
                    {Object.keys(note.structured).length > 0 &&
                      !(note.structured as Record<string, unknown>)?._error && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1"
                            onClick={() => onEditInsight(note)}
                          >
                            Update
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onViewInsight(note)}
                          >
                            View
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onArchiveInsight(note)}
                          >
                            Archive
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => onDeleteInsight(note)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
};