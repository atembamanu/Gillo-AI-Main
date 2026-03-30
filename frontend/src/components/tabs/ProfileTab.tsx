import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface ProfileTabProps {
  email: string;
  displayName: string | null | undefined;
  onSaveDisplayName: (displayName: string | null) => Promise<void>;
  onLogout: () => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  email,
  displayName,
  onSaveDisplayName,
  onLogout,
}) => {
  const [name, setName] = useState(displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    setName(displayName ?? '');
  }, [displayName]);

  const displayLabel = (displayName?.trim() || email).trim();
  const initial = displayLabel.charAt(0).toUpperCase();

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('idle');
    try {
      await onSaveDisplayName(name.trim() || null);
      setSaveMessage('success');
    } catch {
      setSaveMessage('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-brand-dark/10 bg-brand-bg p-4 shadow-sm sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-brand-dark">My Profile.</h2>
        <Button type="button" variant="outline" size="sm" onClick={onLogout}>
          Logout
        </Button>
      </div>

      <div className="mb-6 flex flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-lg font-semibold text-white">
          {initial}
        </div>
        <p className="mt-3 text-sm font-medium text-brand-dark">{displayLabel}</p>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="profile-user-name"
            className="mb-1 block text-sm font-medium text-brand-dark"
          >
            User Name
          </label>
          <Input
            id="profile-user-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full"
            maxLength={100}
          />
        </div>

        <div>
          <label
            htmlFor="profile-email"
            className="mb-1 block text-sm font-medium text-brand-dark"
          >
            Email Address
          </label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            readOnly
            className="w-full bg-brand-bg text-brand-dark/80"
            aria-readonly="true"
          />
        </div>
      </div>

      <div className="mt-6">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        {saveMessage === 'success' && (
          <p className="mt-2 text-xs text-brand-primary">Saved.</p>
        )}
        {saveMessage === 'error' && (
          <p className="mt-2 text-xs text-brand-danger">Failed to save. Try again.</p>
        )}
      </div>
    </section>
  );
};
