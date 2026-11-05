ALTER TABLE tutor_checkins
  ADD COLUMN IF NOT EXISTS location_label TEXT;

CREATE TABLE IF NOT EXISTS geocoding_rate_limit (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  next_request_at TIMESTAMPTZ NOT NULL
);
