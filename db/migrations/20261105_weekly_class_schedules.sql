CREATE TABLE IF NOT EXISTS class_schedules (
  class_id UUID PRIMARY KEY REFERENCES classes(id),
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time IS NULL OR end_time > start_time)
);
