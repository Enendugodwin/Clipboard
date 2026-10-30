-- CLIPBOARD D1 schema (mirrors local server store)
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY, room_code TEXT UNIQUE NOT NULL, room_name TEXT NOT NULL DEFAULT 'Untitled room',
  password_hash TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, is_private INTEGER NOT NULL DEFAULT 0,
  encryption_enabled INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
  version INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL DEFAULT 'text',
  last_sync_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_expires ON rooms(expires_at);

CREATE TABLE IF NOT EXISTS clipboard_entries (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL DEFAULT 'text',
  version INTEGER NOT NULL DEFAULT 0, device_id TEXT NOT NULL DEFAULT 'unknown',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, is_pinned INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_entries_room ON clipboard_entries(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL, device_type TEXT NOT NULL DEFAULT 'desktop', browser TEXT NOT NULL DEFAULT '',
  connection_status TEXT NOT NULL DEFAULT 'connected', last_seen INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_room ON devices(room_id);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL, storage_key TEXT NOT NULL, mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL, uploaded_by TEXT NOT NULL DEFAULT 'unknown',
  uploaded_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_room ON files(room_id);

CREATE TABLE IF NOT EXISTS room_sessions (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT 'read,write',
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS clipboard_history (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL, content_snapshot TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_room ON clipboard_history(room_id, created_at DESC);
