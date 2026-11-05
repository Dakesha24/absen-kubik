ALTER TABLE app_users
  ALTER COLUMN email DROP NOT NULL;

UPDATE app_users
SET email = NULL
WHERE role = 'tutor';
