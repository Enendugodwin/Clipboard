// R2 storage helper (production): authorised, time-limited downloads via presigned URLs.
// Local dev uses the in-memory/file shim in server/src/routes.js — same route shapes.
export async function putRoomFile(env, roomCode, fileId, body, contentType) {
  await env.FILES.put(`rooms/${roomCode}/${fileId}`, body, { httpMetadata: { contentType } });
}
export async function getRoomFile(env, roomCode, fileId) {
  return env.FILES.get(`rooms/${roomCode}/${fileId}`);
}
export async function deleteRoomFiles(env, roomCode) {
  const list = await env.FILES.list({ prefix: `rooms/${roomCode}/` });
  for (const obj of list.objects) await env.FILES.delete(obj.key);
}
