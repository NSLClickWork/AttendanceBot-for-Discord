CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  team text NOT NULL,
  manager_discord_user_id text NOT NULL,
  role text NOT NULL DEFAULT 'EMPLOYEE',
  status text NOT NULL DEFAULT 'PENDING_APPROVAL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  checkin_at timestamptz NOT NULL,
  checkout_at timestamptz,
  duration_minutes integer,
  status text NOT NULL DEFAULT 'OPEN',
  channel_id text,
  topic text,
  source_message_ts text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_sessions_employee_time_idx
  ON attendance_sessions(employee_id, checkin_at);

CREATE TABLE IF NOT EXISTS ot_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  session_id uuid REFERENCES attendance_sessions(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text NOT NULL,
  manager_status text NOT NULL DEFAULT 'PENDING',
  boss_status text NOT NULL DEFAULT 'PENDING',
  status text NOT NULL DEFAULT 'PENDING_MANAGER',
  manager_approved_by text,
  boss_approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weekly_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  week_start date NOT NULL,
  available_slots jsonb NOT NULL DEFAULT '[]',
  unavailable_slots jsonb NOT NULL DEFAULT '[]',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, week_start)
);

CREATE TABLE IF NOT EXISTS schedule_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  ai_output jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'DRAFT',
  approved_by text,
  google_calendar_event_ids jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_discord_user_id text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  old_status text,
  new_status text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

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
