import React from 'react';
import { Button } from '../ui/Button';
import type { Bucket } from '../../api/buckets';

interface BucketsTabProps {
  buckets: Bucket[];
  onNewBucket: () => void;
  onStartEdit: (b: Bucket) => void;
  onDeleteBucket: (b: Bucket) => void;
}

export const BucketsTab: React.FC<BucketsTabProps> = ({
  buckets,
  onNewBucket,
  onStartEdit,
  onDeleteBucket,
}) => {
  return (
    <section className="rounded-2xl border border-brand-dark/10 bg-brand-bg p-4 shadow-sm sm:p-6">
      <h2 className="mb-2 text-lg font-semibold text-brand-dark">Buckets</h2>
      <p className="mb-4 text-brand-dark/70">
        Create buckets and define fields for AI extraction. Notes in a bucket will be structured
        using only these fields.
      </p>

      <div className="mb-6 flex justify-end">
        <Button
          type="button"
          size="sm"
          className="rounded-full shadow-sm"
          onClick={onNewBucket}
        >
          New bucket
        </Button>
      </div>

      {buckets.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-medium text-brand-dark">Your buckets</h3>
          <ul className="space-y-3">
            {buckets.map((b) => (
              <li key={b.id} className="rounded-lg border border-brand-dark/10 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium text-brand-dark">{b.name}</span>
                    {(b.fields?.length ?? 0) > 0 && (
                      <p className="mt-0.5 text-xs text-brand-dark/70">
                        Fields: {(b.fields ?? []).map((f) => f.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onStartEdit(b)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => onDeleteBucket(b)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};
