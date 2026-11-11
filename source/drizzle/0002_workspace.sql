ALTER TABLE nd_members ADD COLUMN email_verified_at INTEGER;
--> statement-breakpoint
CREATE TABLE nd_profiles (
  member_id TEXT PRIMARY KEY NOT NULL REFERENCES nd_members(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'student',
  requested_role TEXT, university TEXT NOT NULL DEFAULT '', faculty TEXT NOT NULL DEFAULT '',
  course INTEGER, group_name TEXT NOT NULL DEFAULT '', avatar_key TEXT,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE nd_tasks (
  id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL, group_name TEXT NOT NULL, faculty TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL REFERENCES nd_members(id), due_at TEXT NOT NULL, created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE nd_submissions (
  task_id TEXT NOT NULL REFERENCES nd_tasks(id), student_id TEXT NOT NULL REFERENCES nd_members(id),
  answer TEXT NOT NULL, submitted_at INTEGER NOT NULL, PRIMARY KEY(task_id,student_id)
);
--> statement-breakpoint
CREATE TABLE nd_grades (
  id TEXT PRIMARY KEY NOT NULL, student_id TEXT NOT NULL REFERENCES nd_members(id),
  teacher_id TEXT NOT NULL REFERENCES nd_members(id), subject TEXT NOT NULL,
  task_id TEXT REFERENCES nd_tasks(id), score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
  feedback TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE nd_lessons (
  id TEXT PRIMARY KEY NOT NULL, subject TEXT NOT NULL, group_name TEXT NOT NULL,
  faculty TEXT NOT NULL DEFAULT '', teacher_id TEXT NOT NULL REFERENCES nd_members(id),
  room TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE nd_announcements (
  id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES nd_members(id), group_name TEXT NOT NULL DEFAULT '',
  faculty TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE nd_notifications (
  id TEXT PRIMARY KEY NOT NULL, recipient_id TEXT NOT NULL REFERENCES nd_members(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT NOT NULL, target TEXT NOT NULL DEFAULT 'home',
  is_read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX nd_notifications_recipient_idx ON nd_notifications(recipient_id,created_at);
--> statement-breakpoint
CREATE TABLE nd_email_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL, member_id TEXT NOT NULL REFERENCES nd_members(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER
);
