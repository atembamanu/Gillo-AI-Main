-- Add user-defined fields per bucket for structured extraction
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS fields JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN buckets.fields IS 'Array of { "name": "fieldKey", "description": "optional AI hint" } for extraction';
