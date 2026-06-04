CREATE TABLE IF NOT EXISTS shift_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'NOT_YET',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_tasks_session_id_idx
  ON shift_tasks(session_id);
