CREATE TABLE nd_accounts (
  subject TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE nd_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  subject TEXT NOT NULL REFERENCES nd_accounts(subject) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX nd_sessions_subject_idx ON nd_sessions(subject);
--> statement-breakpoint
CREATE INDEX nd_sessions_expiry_idx ON nd_sessions(expires_at);
--> statement-breakpoint
CREATE TABLE nd_auth_attempts (
  subject TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
