// Encrypted device storage (CC-26 / CC-27).
//
// The care circle's data is saved in the browser encrypted with AES-256-GCM.
// The key is generated on this device as a non-extractable CryptoKey and kept
// in IndexedDB, so it can be used by this site but never read or exported —
// not even by the site's own JavaScript. Each save uses a fresh random IV.
// Production adds TLS in transit and server-side encryption at rest with
// managed, rotated keys.

const DB = "circle-care-keys";
const STORE = "keys";
const KEY_ID = "state-key-v1";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}

async function idbPut(key: string, value: unknown) {
  const db = await idb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string) {
  const db = await idb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const cryptoAvailable = () => typeof crypto !== "undefined" && !!crypto.subtle && typeof indexedDB !== "undefined";

let keyPromise: Promise<CryptoKey> | null = null;
export function deviceKey(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const existing = await idbGet<CryptoKey>(KEY_ID);
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await idbPut(KEY_ID, key);
    return key;
  })();
  return keyPromise;
}

function b64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptBytes(data: Uint8Array): Promise<{ iv: Uint8Array; ct: ArrayBuffer }> {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource);
  return { iv, ct };
}

export async function decryptBytes(iv: Uint8Array, ct: ArrayBuffer): Promise<ArrayBuffer> {
  const key = await deviceKey();
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct);
}

/** Saves a JSON value encrypted. Stored as "enc:v1:<iv>:<ciphertext>". */
export async function saveEncrypted(storageKey: string, value: unknown) {
  const { iv, ct } = await encryptBytes(new TextEncoder().encode(JSON.stringify(value)));
  localStorage.setItem(storageKey, `enc:v1:${b64(iv)}:${b64(ct)}`);
}

/** Loads a value saved with saveEncrypted. Plain JSON from older versions is read and re-encrypted on next save. */
export async function loadEncrypted<T>(storageKey: string): Promise<T | null> {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  if (!raw.startsWith("enc:v1:")) {
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  const [, , iv, ct] = raw.split(":");
  try {
    const plain = await decryptBytes(unb64(iv), unb64(ct).buffer);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null; // key was wiped or data altered — GCM authentication failed
  }
}

/** Removes stored data and destroys the device key, making any copies unreadable (CC-27, CC-33). */
export async function wipeDevice(storageKeys: string[]) {
  for (const k of storageKeys) localStorage.removeItem(k);
  keyPromise = null;
  await idbDelete(KEY_ID).catch(() => {});
  await clearFiles().catch(() => {});
}

/* ---------- Encrypted file store for care documents (CC-67) ---------- */

const FILES_DB = "circle-care-files";
function filesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILES_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putFile(id: string, bytes: Uint8Array) {
  const { iv, ct } = await encryptBytes(bytes);
  const db = await filesDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put({ iv, ct }, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFile(id: string): Promise<ArrayBuffer | null> {
  const db = await filesDb();
  const rec = await new Promise<{ iv: Uint8Array; ct: ArrayBuffer } | undefined>((resolve, reject) => {
    const r = db.transaction("files").objectStore("files").get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  if (!rec) return null;
  try { return await decryptBytes(rec.iv, rec.ct); } catch { return null; }
}

async function clearFiles() {
  const db = await filesDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- Upload checks (CC-67) ---------- */

/**
 * Verifies a file by its content signature, not its name, and enforces a size
 * limit. Production adds a malware scan on the server before storage.
 */
export function inspectUpload(bytes: Uint8Array, name: string): { ok: true; mime: string } | { ok: false; reason: string } {
  if (bytes.length > 10 * 1024 * 1024) return { ok: false, reason: "Files must be 10 MB or smaller." };
  const sig = (arr: number[]) => arr.every((b, i) => bytes[i] === b);
  if (sig([0x25, 0x50, 0x44, 0x46])) return { ok: true, mime: "application/pdf" };
  if (sig([0x89, 0x50, 0x4e, 0x47])) return { ok: true, mime: "image/png" };
  if (sig([0xff, 0xd8, 0xff])) return { ok: true, mime: "image/jpeg" };
  return { ok: false, reason: `“${name}” isn't a PDF, PNG or JPEG file. Only those types can be uploaded.` };
}

/* ---------- Passphrase-protected export (CC-32) ---------- */

export async function encryptWithPassphrase(text: string, passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return JSON.stringify({ format: "circle-care-export", v: 1, kdf: "PBKDF2-SHA256-250000", cipher: "AES-256-GCM", salt: b64(salt), iv: b64(iv), data: b64(ct) });
}

export async function decryptWithPassphrase(file: string, passphrase: string): Promise<string> {
  const o = JSON.parse(file) as { salt: string; iv: string; data: string };
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: unb64(o.salt), iterations: 250000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, key, unb64(o.data));
  return new TextDecoder().decode(plain);
}
