CREATE TABLE nd_members (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  legacy_subject TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE nd_member_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL REFERENCES nd_members(id) ON DELETE CASCADE,
  platform_subject TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX nd_member_sessions_expiry_idx ON nd_member_sessions(expires_at);
--> statement-breakpoint
CREATE INDEX nd_member_sessions_member_idx ON nd_member_sessions(member_id);
