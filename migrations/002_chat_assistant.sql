ALTER TABLE attendance_sessions
  ADD COLUMN IF NOT EXISTS channel_id text,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS source_message_ts text;

CREATE TABLE IF NOT EXISTS bot_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_discord_user_id text NOT NULL,
  feature text NOT NULL,
  credit_cost integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_usage_events_created_feature_idx
  ON bot_usage_events(created_at, feature);
