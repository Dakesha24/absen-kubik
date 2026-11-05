CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  encrypted_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  tutor_password_set BOOLEAN NOT NULL DEFAULT FALSE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'tutor')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS tutor_password_set BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_users ALTER COLUMN email DROP NOT NULL;

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  location_name TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_m INTEGER CHECK (radius_m IS NULL OR radius_m BETWEEN 25 AND 5000),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS class_schedules (
  class_id UUID PRIMARY KEY REFERENCES classes(id),
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time IS NULL OR end_time > start_time)
);

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_students (
  class_id UUID NOT NULL REFERENCES classes(id),
  student_id UUID NOT NULL REFERENCES students(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id),
  tutor_id UUID NOT NULL REFERENCES app_users(id),
  meeting_number INTEGER NOT NULL CHECK (meeting_number > 0),
  meeting_date DATE NOT NULL,
  starts_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  submitted_at TIMESTAMPTZ,
  drive_folder_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, meeting_number)
);

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tutor_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL UNIQUE REFERENCES meetings(id),
  tutor_id UUID NOT NULL REFERENCES app_users(id),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m DOUBLE PRECISION NOT NULL CHECK (accuracy_m >= 0),
  distance_m DOUBLE PRECISION,
  location_label TEXT,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT
);

CREATE TABLE IF NOT EXISTS geocoding_rate_limit (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  next_request_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE tutor_checkins ADD COLUMN IF NOT EXISTS location_label TEXT;

CREATE TABLE IF NOT EXISTS attendance_records (
  meeting_id UUID NOT NULL REFERENCES meetings(id),
  student_id UUID NOT NULL REFERENCES students(id),
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'sick', 'permission')),
  reason TEXT,
  marked_by UUID NOT NULL REFERENCES app_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meeting_id, student_id)
);

CREATE TABLE IF NOT EXISTS evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id),
  uploaded_by UUID NOT NULL REFERENCES app_users(id),
  drive_file_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  web_view_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_tutor_date ON meetings (tutor_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_class_date ON meetings (class_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_class_students_student ON class_students (student_id, active);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records (student_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_meeting ON evidence_files (meeting_id, created_at DESC);
