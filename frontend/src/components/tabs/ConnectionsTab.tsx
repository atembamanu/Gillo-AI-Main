import React from 'react';
import { Button } from '../ui/Button';

export const ConnectionsTab: React.FC = () => {
  return (
    <section className="rounded-2xl border border-brand-dark/10 bg-brand-bg p-4 shadow-sm sm:p-6">
      <h2 className="mb-2 text-lg font-semibold text-brand-dark">Connections</h2>
      <p className="mb-4 text-sm text-brand-dark/70">
        Connect Gillo to the tools you already use. Synchronization features are coming soon.
      </p>
      <ul className="space-y-3">
        <li className="flex items-center justify-between rounded-xl border border-brand-dark/15 bg-brand-bg px-3 py-2">
          <div>
            <p className="text-sm font-medium text-brand-dark">Google Calendar</p>
            <p className="text-xs text-brand-dark/70">Turn structured notes into calendar events.</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-full">
            Coming soon
          </Button>
        </li>
        <li className="flex items-center justify-between rounded-xl border border-brand-dark/15 bg-brand-bg px-3 py-2">
          <div>
            <p className="text-sm font-medium text-brand-dark">Tasks &amp; reminders</p>
            <p className="text-xs text-brand-dark/70">Push action items into your task system.</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-full">
            Coming soon
          </Button>
        </li>
      </ul>
    </section>
  );
};

