export type ConnectionState = 'Connected' | 'Syncing' | 'Synced' | 'Reconnecting' | 'Disconnected' | 'Offline';
export interface Room { room_code: string; room_name: string; created_at: number; updated_at: number; expires_at: number; is_private: boolean; status: string; version: number; content: string; content_type: string; last_sync_at: number; has_password: boolean; }
export interface Entry { id: string; room_id: string; content: string; content_type: string; version: number; device_id: string; created_at: number; updated_at: number; is_pinned: boolean; }
export interface Device { id: string; room_id: string; device_name: string; device_type: string; browser: string; connection_status: string; last_seen: number; created_at: number; }
export interface FileMeta { id: string; room_id: string; original_filename: string; storage_key: string; mime_type: string; file_size: number; uploaded_by: string; uploaded_at: number; expires_at: number; }
export type ContentType = 'text' | 'url' | 'email' | 'json' | 'code' | 'image' | 'longtext';
