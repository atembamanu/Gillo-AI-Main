import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface ProfileTabProps {
  email: string;
  displayName: string | null | undefined;
  timezone?: string;
  onSaveProfile: (data: { display_name: string | null; timezone: string }) => Promise<void>;
  onLogout: () => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  email,
  displayName,
  timezone,
  onSaveProfile,
  onLogout,
}) => {
  const [name, setName] = useState(displayName ?? '');
  const [selectedTimezone, setSelectedTimezone] = useState(timezone || 'UTC');
  const [timezoneQuery, setTimezoneQuery] = useState(timezone || 'UTC');
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>(['UTC']);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    setName(displayName ?? '');
  }, [displayName]);

  useEffect(() => {
    setSelectedTimezone(timezone || 'UTC');
    setTimezoneQuery(timezone || 'UTC');
  }, [timezone]);

  useEffect(() => {
    const supportedValuesOf = (Intl as any).supportedValuesOf as ((k: string) => string[]) | undefined;
    const ianaZones = supportedValuesOf ? supportedValuesOf('timeZone') : [];
    const merged = Array.from(new Set(['UTC', ...ianaZones])).sort((a, b) => a.localeCompare(b));
    setTimezoneOptions(merged);
  }, []);

  const displayLabel = (displayName?.trim() || email).trim();
  const initial = displayLabel.charAt(0).toUpperCase();

  const handleSave = async () => {
    const resolvedTimezone = timezoneOptions.includes(timezoneQuery) ? timezoneQuery : 'UTC';
    setSaving(true);
    setSaveMessage('idle');
    try {
      await onSaveProfile({ display_name: name.trim() || null, timezone: resolvedTimezone });
      setSelectedTimezone(resolvedTimezone);
      setTimezoneQuery(resolvedTimezone);
      setSaveMessage('success');
    } catch {
      setSaveMessage('error');
    } finally {
      setSaving(false);
    }
  };

  const filteredTimezoneOptions = timezoneQuery
    ? timezoneOptions.filter((tz) => tz.toLowerCase().includes(timezoneQuery.toLowerCase()))
    : timezoneOptions;

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

        <div>
          <label
            htmlFor="profile-timezone"
            className="mb-1 block text-sm font-medium text-brand-dark"
          >
            Timezone
          </label>
          <Input
            id="profile-timezone"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="false"
            list="profile-timezone-options"
            value={timezoneQuery}
            onChange={(e) => {
              const val = e.target.value;
              setTimezoneQuery(val);
              if (timezoneOptions.includes(val)) {
                setSelectedTimezone(val);
              }
            }}
            placeholder="Search timezone (e.g. Africa/Nairobi)"
            className="w-full bg-brand-bg text-brand-dark"
          />
          <datalist id="profile-timezone-options">
            {filteredTimezoneOptions.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-brand-dark/60">
            Selected: {timezoneOptions.includes(timezoneQuery) ? timezoneQuery : selectedTimezone}
          </p>
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
