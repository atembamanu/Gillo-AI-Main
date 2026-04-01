import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginForm } from './components/main/LoginForm';
import type { StructuredData } from './components/main/DynamicStructuredForm';
import * as bucketsApi from './api/buckets';
import * as notesApi from './api/notes';
import type { Bucket, BucketField } from './api/buckets';
import type { Note } from './api/notes';
import { ApiError, resolveApiAssetUrl } from './api/client';
import { AppHeader } from './components/layout/AppHeader';
import { BottomNav, type NavTab } from './components/layout/BottomNav';
import { ConnectionsTab } from './components/tabs/ConnectionsTab';
import { ProfileTab } from './components/tabs/ProfileTab';
import { Button } from './components/ui/Button';
import { HomeTab } from './components/tabs/HomeTab';
import { InsightsTab } from './components/tabs/InsightsTab';
import { BucketsTab } from './components/tabs/BucketsTab';
import {
  ConfirmModal,
  ViewInsightModal,
  EditBucketModal,
  UpdateInsightModal,
  NewInsightModal,
  AddBucketModal,
  type EditField,
} from './components/modals';

const emptyField = (): BucketField => ({ name: '', description: '', ai_description: '' });

export function App() {
  const { user, loading: authLoading, logout, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedBucketId, setSelectedBucketId] = useState<string>('');
  const [text, setText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketFields, setNewBucketFields] = useState<BucketField[]>([emptyField()]);
  const [editingBucketId, setEditingBucketId] = useState<string | null>(null);
  const [editingBucketName, setEditingBucketName] = useState('');
  const [editingBucketFields, setEditingBucketFields] = useState<BucketField[]>([]);
  const [generatingEditFieldIndex, setGeneratingEditFieldIndex] = useState<number | null>(null);

  const fetchBuckets = useCallback(async () => {
    try {
      const { buckets: list } = await bucketsApi.listBuckets();
      setBuckets(list);
      if (list.length > 0 && !selectedBucketId) {
        setSelectedBucketId(list[0].id);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load buckets');
    }
  }, [selectedBucketId]);

  const fetchNotes = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const { notes: list } = await notesApi.listAllNotes();
      setNotes((prev) => {
        // Merge: keep any note already in state that's missing from the API response (e.g. newly created or from another bucket)
        const byId = new Map(list.map((n) => [n.id, n]));
        prev.forEach((n) => {
          if (!byId.has(n.id)) byId.set(n.id, n);
        });
        return [...byId.values()].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
    } catch (e) {
      if (!silent) {
        setError(e instanceof ApiError ? e.message : 'Failed to load notes');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchBuckets();
  }, [user, fetchBuckets]);

  useEffect(() => {
    if (!user) return;
    fetchNotes();
  }, [user, fetchNotes]);

  // After adding a note, the worker processes it in the background. Poll so we show structured output when ready.
  const hasPendingNotes = notes.some((n) => Object.keys(n.structured).length === 0);
  useEffect(() => {
    if (!user || !hasPendingNotes) return;
    const interval = setInterval(() => {
      fetchNotes({ silent: true });
    }, 2500);
    return () => clearInterval(interval);
  }, [user, hasPendingNotes, fetchNotes]);

  const [recordedAudioFile, setRecordedAudioFile] = useState<File | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);

  const handleAddNote = async () => {
    if (!newInsightBucketId) return;
    setError(null);
    try {
      if (newInsightMode === 'text') {
        if (!newInsightText.trim()) return;
        const { note } = await notesApi.createTextNote(
          newInsightBucketId,
          newInsightText.trim()
        );
        setNotes((prev) => [note, ...prev]);
        setNewInsightText('');
      } else {
        if (!recordedAudioFile) return;
        const { audioUrl, rawKey } =
          await notesApi.uploadAudio(newInsightBucketId, recordedAudioFile);
        const normalizedAudioUrl = resolveApiAssetUrl(audioUrl);
        const { note } = await notesApi.createAudioNote(
          newInsightBucketId,
          normalizedAudioUrl,
          undefined,
          undefined,
          undefined,
          rawKey
        );
        setNotes((prev) => [note, ...prev]);
        setRecordedAudioFile(null);
        if (recordedAudioUrl) {
          URL.revokeObjectURL(recordedAudioUrl);
          setRecordedAudioUrl(null);
        }
      }
      setShowNewInsightModal(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to add note');
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      setIsRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
      setRecordedAudioUrl(null);
      setRecordedAudioFile(null);
      setRecordSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const file = new File([blob], `note-${Date.now()}.webm`, { type: 'audio/webm' });
          setRecordedAudioFile(file);
          setRecordedAudioUrl(url);
        }
      };

      recorder.start();
      setIsRecording(true);

      const start = Date.now();
      const interval = setInterval(() => {
        if (!recorder || recorder.state === 'inactive') {
          clearInterval(interval);
          return;
        }
        const elapsedSec = Math.floor((Date.now() - start) / 1000);
        setRecordSeconds(elapsedSec);
        if (elapsedSec >= 5 * 60) {
          recorder.stop();
          setIsRecording(false);
          clearInterval(interval);
        }
      }, 1000);
    } catch (e) {
      setError('Failed to start audio recording.');
    }
  };

  const handleSaveStructured = async (noteId: string, value: StructuredData) => {
    setError(null);
    try {
      const { note } = await notesApi.updateStructured(noteId, value);
      setNotes((prev) => prev.map((n) => (n.id === noteId ? note : n)));
      setEditingNoteId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save');
    }
  };

  const handleRetryMapping = async (note: Note) => {
    setError(null);
    try {
      await notesApi.retryMapping(note.id);
      setNotes((prev) =>
        prev.map((n) => (n.id === note.id ? { ...n, structured: {} } : n))
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to retry mapping');
    }
  };

  const handleCreateBucket = async () => {
    if (!newBucketName.trim()) return;
    setError(null);
    const fields = newBucketFields
      .map((f) => ({
        name: f.name.trim(),
        ai_description: f.ai_description?.trim() || undefined,
      }))
      .filter((f) => f.name);
    try {
      const { bucket } = await bucketsApi.createBucket(newBucketName.trim(), fields);
      setBuckets((prev) => [...prev, bucket]);
      setNewBucketName('');
      setNewBucketFields([emptyField()]);
      if (showAddBucketModal) {
        setShowAddBucketModal(false);
        setNewInsightBucketId(bucket.id);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create bucket');
    }
  };

  const startEditBucket = (b: Bucket) => {
    setEditingBucketId(b.id);
    setEditingBucketName(b.name);
    setEditingBucketFields(
      (b.fields?.length ? b.fields : [emptyField()]).map((f) => ({
        name: f.name ?? '',
        description: f.description ?? '',
        ai_description: (f as BucketField).ai_description ?? '',
      }))
    );
  };

  const cancelEditBucket = () => {
    setEditingBucketId(null);
    setEditingBucketName('');
    setEditingBucketFields([]);
  };

  const handleUpdateBucket = async () => {
    if (!editingBucketId) return;
    setError(null);
    const fields = editingBucketFields
      .map((f) => ({
        name: f.name.trim(),
        ai_description: f.ai_description?.trim() || undefined,
      }))
      .filter((f) => f.name);
    try {
      const { bucket } = await bucketsApi.updateBucket(editingBucketId, {
        name: editingBucketName.trim(),
        fields
      });
      setBuckets((prev) => prev.map((x) => (x.id === bucket.id ? bucket : x)));
      cancelEditBucket();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to update bucket');
    }
  };

  const addNewBucketField = () => setNewBucketFields((prev) => [...prev, emptyField()]);
  const updateNewBucketField = (i: number, part: keyof BucketField, value: string) => {
    setNewBucketFields((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, [part]: value } : f))
    );
  };
  const removeNewBucketField = (i: number) => {
    setNewBucketFields((prev) => prev.filter((_, idx) => idx !== i));
  };
  const addEditingBucketField = () =>
    setEditingBucketFields((prev) => [...prev, emptyField()]);
  const updateEditingBucketField = (i: number, part: keyof BucketField, value: string) => {
    setEditingBucketFields((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, [part]: value } : f))
    );
  };
  const removeEditingBucketField = (i: number) => {
    setEditingBucketFields((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleGenerateAiDescriptionForEditField = async (fieldIndex: number) => {
    const f = editingBucketFields[fieldIndex];
    if (!f?.name.trim()) return;
    setError(null);
    setGeneratingEditFieldIndex(fieldIndex);
    try {
      const { ai_description } = await bucketsApi.generateBucketFieldAiDescription(
        f.name.trim(),
        (f.ai_description ?? '').trim() || undefined,
        editingBucketName.trim() || undefined
      );
      setEditingBucketFields((prev) =>
        prev.map((f2, j) => (j === fieldIndex ? { ...f2, ai_description } : f2))
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to generate AI description');
    } finally {
      setGeneratingEditFieldIndex(null);
    }
  };

  const [generatingNewFieldIndex, setGeneratingNewFieldIndex] = useState<number | null>(null);
  const handleGenerateAiDescriptionForNewField = async (fieldIndex: number) => {
    const f = newBucketFields[fieldIndex];
    if (!f?.name.trim()) return;
    setError(null);
    setGeneratingNewFieldIndex(fieldIndex);
    try {
      const { ai_description } = await bucketsApi.generateBucketFieldAiDescription(
        f.name.trim(),
        (f.ai_description ?? '').trim() || undefined,
        newBucketName.trim() || undefined
      );
      setNewBucketFields((prev) =>
        prev.map((f2, j) => (j === fieldIndex ? { ...f2, ai_description } : f2))
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to generate AI description');
    } finally {
      setGeneratingNewFieldIndex(null);
    }
  };

  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [noteToArchive, setNoteToArchive] = useState<Note | null>(null);
  const [bucketToDelete, setBucketToDelete] = useState<Bucket | null>(null);
  const [noteToView, setNoteToView] = useState<Note | null>(null);
  const [noteBeingEdited, setNoteBeingEdited] = useState<Note | null>(null);
  const [editFields, setEditFields] = useState<EditField[]>([]);
  const [showNewInsightModal, setShowNewInsightModal] = useState(false);
  const [showAddBucketModal, setShowAddBucketModal] = useState(false);
  const [newInsightBucketId, setNewInsightBucketId] = useState<string>('');
  const [newInsightText, setNewInsightText] = useState('');
  const [newInsightMode, setNewInsightMode] = useState<'text' | 'audio'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-brand-dark/60">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] px-4 py-10 sm:mx-auto">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-10 lg:flex-row">
          <div className="max-w-md text-center lg:text-left">
            <img src="/gillologo.webp" alt="Gillo" className="block h-auto w-auto lg:w-48" />
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-dark/60">
            Unlocking your data
            </p>
            <p className="mt-3 text-sm text-brand-dark/70">
              Capture voice or text, and let Gillo turn it into clean, structured notes you can trust.
            </p>
          </div>
          <div className="w-full max-w-md">
            <LoginForm />
          </div>
        </div>
      </div>
    );
  }

  const bucketName = (id: string) => buckets.find((b) => b.id === id)?.name ?? id;
  const nonArchivedNotes = notes.filter((n) => !n.archived);
  const latestNonArchived = nonArchivedNotes.slice(0, 10);

  const structuredToFields = (structured: StructuredData): EditField[] =>
    Object.entries(structured ?? {})
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([key, value]) => ({
        key,
        value: Array.isArray(value)
          ? value.map(String).join('\n')
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value),
      }));

  const fieldsToStructured = (fields: EditField[]): StructuredData => {
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
  };

  return (
    <div className="min-h-screen safe-area-pb bg-[#F9FAFB] pb-20">
      <AppHeader
          displayName={user?.display_name}
          onGoToProfile={() => setActiveTab('profile')}
        />

      <main className="mx-auto max-w-3xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
        {error && (
          <div
            className="mb-4 rounded-lg bg-brand-primary/10 px-4 py-3 text-sm text-brand-dark"
            role="alert"
          >
            {error}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2 underline px-0"
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {activeTab === 'home' && (
          <HomeTab
            loading={loading}
            latestNonArchived={latestNonArchived}
            buckets={buckets}
            bucketName={bucketName}
            onNewInsight={() => {
              setShowNewInsightModal(true);
              setNewInsightBucketId(selectedBucketId || (buckets[0]?.id ?? ''));
            }}
            onEditInsight={(note) => {
              setNoteBeingEdited(note);
              setEditFields(structuredToFields(note.structured));
            }}
            onViewInsight={(note) => setNoteToView(note)}
            onArchiveInsight={(note) => setNoteToArchive(note)}
            onDeleteInsight={(note) => setNoteToDelete(note)}
            onRetryMapping={handleRetryMapping}
          />
        )}

        {activeTab === 'connections' && <ConnectionsTab />}

        {activeTab === 'profile' && (
          <ProfileTab
            email={user.email}
            displayName={user.display_name}
            timezone={user.timezone || 'UTC'}
            onSaveProfile={({ display_name, timezone }) => updateProfile({ display_name, timezone })}
            onLogout={logout}
          />
        )}

        {activeTab === 'insights' && (
          <InsightsTab
            loading={loading}
            notes={notes}
            buckets={buckets}
            bucketName={bucketName}
            onEditInsight={(note) => {
              setNoteBeingEdited(note);
              setEditFields(structuredToFields(note.structured));
            }}
            onViewInsight={setNoteToView}
            onArchiveInsight={setNoteToArchive}
            onDeleteInsight={setNoteToDelete}
            onRetryMapping={handleRetryMapping}
          />
        )}

        {activeTab === 'buckets' && (
          <BucketsTab
            buckets={buckets}
            onNewBucket={() => {
              setShowAddBucketModal(true);
              setNewBucketName('');
              setNewBucketFields([emptyField()]);
            }}
            onStartEdit={startEditBucket}
            onDeleteBucket={setBucketToDelete}
          />
        )}
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      {noteToView && (
        <ViewInsightModal
          note={noteToView}
          bucketName={bucketName(noteToView.bucketId)}
          onClose={() => setNoteToView(null)}
          onRetryMapping={() => void handleRetryMapping(noteToView)}
          onArchive={() => {
            setNoteToArchive(noteToView);
            setNoteToView(null);
          }}
          onDelete={() => {
            setNoteToDelete(noteToView);
            setNoteToView(null);
          }}
        />
      )}

      {noteToDelete && (
        <ConfirmModal
          title="Delete note?"
          description="This will permanently delete this note and its insights. This action cannot be undone."
          confirmLabel="Delete"
          confirmVariant="danger"
          onCancel={() => setNoteToDelete(null)}
          onConfirm={async () => {
            try {
              await notesApi.deleteNote(noteToDelete.id);
              setNotes((prev) => prev.filter((n) => n.id !== noteToDelete.id));
            } catch (e) {
              setError(e instanceof ApiError ? e.message : 'Failed to delete note');
            } finally {
              setNoteToDelete(null);
            }
          }}
        />
      )}

      {noteToArchive && (
        <ConfirmModal
          title="Archive insight?"
          description="This insight will be removed from your active list but kept for later reference."
          confirmLabel="Archive"
          confirmVariant="primary"
          onCancel={() => setNoteToArchive(null)}
          onConfirm={async () => {
            try {
              const { note } = await notesApi.archiveNote(noteToArchive.id, true);
              setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
            } catch (e) {
              setError(e instanceof ApiError ? e.message : 'Failed to archive note');
            } finally {
              setNoteToArchive(null);
            }
          }}
        />
      )}

      {bucketToDelete && (
        <ConfirmModal
          title="Delete bucket?"
          description="Deleting this bucket will also delete all notes and insights inside it. This cannot be undone."
          confirmLabel="Delete bucket"
          confirmVariant="danger"
          onCancel={() => setBucketToDelete(null)}
          onConfirm={async () => {
            try {
              await bucketsApi.deleteBucket(bucketToDelete.id);
              setBuckets((prev) => prev.filter((b) => b.id !== bucketToDelete.id));
              if (selectedBucketId === bucketToDelete.id) setSelectedBucketId('');
            } catch (e) {
              setError(e instanceof ApiError ? e.message : 'Failed to delete bucket');
            } finally {
              setBucketToDelete(null);
            }
          }}
        />
      )}

      {editingBucketId && (
        <EditBucketModal
          bucketName={editingBucketName}
          onBucketNameChange={setEditingBucketName}
          fields={editingBucketFields}
          onFieldChange={updateEditingBucketField}
          onRemoveField={removeEditingBucketField}
          onAddField={addEditingBucketField}
          onGenerateAiDescription={handleGenerateAiDescriptionForEditField}
          generatingFieldIndex={generatingEditFieldIndex}
          onSave={handleUpdateBucket}
          onCancel={cancelEditBucket}
        />
      )}

      {noteBeingEdited && (
        <UpdateInsightModal
          subtitle={`${bucketName(noteBeingEdited.bucketId)} · ${new Date(noteBeingEdited.createdAt).toLocaleString()}`}
          originalText={noteBeingEdited.originalText || '—'}
          editFields={editFields}
          onEditFieldsChange={setEditFields}
          onSave={async () => {
            if (!noteBeingEdited) return;
            const next = fieldsToStructured(editFields);
            try {
              const { note } = await notesApi.updateStructured(noteBeingEdited.id, next);
              setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
              setNoteBeingEdited(null);
              setEditFields([]);
            } catch (e) {
              setError(e instanceof ApiError ? e.message : 'Failed to save');
            }
          }}
          onCancel={() => {
            setNoteBeingEdited(null);
            setEditFields([]);
          }}
        />
      )}

      {showNewInsightModal && (
        <NewInsightModal
          buckets={buckets}
          bucketId={newInsightBucketId}
          onBucketIdChange={setNewInsightBucketId}
          mode={newInsightMode}
          onModeChange={setNewInsightMode}
          text={newInsightText}
          onTextChange={setNewInsightText}
          isRecording={isRecording}
          recordSeconds={recordSeconds}
          onRecordToggle={toggleRecording}
          hasRecording={!!recordedAudioFile}
          audioPreviewUrl={recordedAudioUrl}
          onResetRecording={() => {
            if (recordedAudioUrl) {
              URL.revokeObjectURL(recordedAudioUrl);
            }
            setRecordedAudioFile(null);
            setRecordedAudioUrl(null);
            setRecordSeconds(0);
          }}
          onAudioFileSelected={(file) => {
            if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
            setRecordedAudioFile(file);
            setRecordedAudioUrl(URL.createObjectURL(file));
            setRecordSeconds(0);
          }}
          onAddBucket={() => {
            setShowAddBucketModal(true);
            setNewBucketName('');
            setNewBucketFields([emptyField()]);
          }}
          onCreate={handleAddNote}
          onCancel={() => setShowNewInsightModal(false)}
        />
      )}

      {showAddBucketModal && (
        <AddBucketModal
          bucketName={newBucketName}
          onBucketNameChange={setNewBucketName}
          fields={newBucketFields}
          onFieldChange={updateNewBucketField}
          onAddField={addNewBucketField}
          onRemoveField={removeNewBucketField}
          onGenerateAiDescription={handleGenerateAiDescriptionForNewField}
          generatingFieldIndex={generatingNewFieldIndex}
          onSave={handleCreateBucket}
          onCancel={() => setShowAddBucketModal(false)}
        />
      )}
    </div>
  );
}
