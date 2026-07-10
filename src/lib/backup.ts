import { db } from "./db";
import type { Checkin, Entry } from "./types";
import { isValidCheckin, isValidEntry } from "./validate";
import type { Settings } from "./settings";

/*
 * Cloud backup to a PRIVATE GitHub repository in the user's own account —
 * no third-party server. A private repo (unlike a "secret" gist) has real
 * access control: only the account and its tokens can read it. On top of
 * that, an optional passphrase encrypts the payload with AES-GCM before it
 * leaves the device, so even GitHub only stores ciphertext.
 *
 * Secrets (API key, GitHub token, passphrase) are NEVER part of a backup.
 */

const API = "https://api.github.com";
const FILE_PATH = "backup.json";
const STATUS_KEY = "goodfood.backupStatus";

export interface BackupStatus {
  lastSuccessAt?: number;
  lastMessage?: string;
  lastError?: string;
}

export function loadBackupStatus(): BackupStatus {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStatus(patch: Partial<BackupStatus>) {
  localStorage.setItem(
    STATUS_KEY,
    JSON.stringify({ ...loadBackupStatus(), ...patch }),
  );
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function gh(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API}${path}`, { ...init, headers: { ...headers(token), ...init?.headers } });
}

async function getUsername(token: string): Promise<string> {
  const res = await gh(token, "/user");
  if (res.status === 401) throw new Error("GitHub token invalid or expired.");
  if (!res.ok) throw new Error(`GitHub /user failed (${res.status}).`);
  return (await res.json()).login as string;
}

/** Ensure the private backup repo exists; create it if the token allows. */
async function ensureRepo(token: string, owner: string, repo: string): Promise<void> {
  const res = await gh(token, `/repos/${owner}/${repo}`);
  if (res.ok) return;
  if (res.status !== 404) throw new Error(`GitHub repo check failed (${res.status}).`);
  const create = await gh(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: repo,
      private: true,
      auto_init: true,
      description: "GoodFood on-device data backup",
    }),
  });
  if (!create.ok) {
    throw new Error(
      `Couldn't create the private repo "${repo}" (${create.status}). Create it manually on GitHub (private!) or use a token with "repo" scope.`,
    );
  }
}

/* ---------- optional passphrase encryption (AES-GCM / PBKDF2) ---------- */

const te = new TextEncoder();
const td = new TextDecoder();

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 250_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptJson(obj: unknown, passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    te.encode(JSON.stringify(obj)),
  );
  return { alg: "AES-GCM+PBKDF2", salt: b64(salt), iv: b64(iv), data: b64(data) };
}

async function decryptJson(
  box: { salt: string; iv: string; data: string },
  passphrase: string,
): Promise<unknown> {
  const key = await deriveKey(passphrase, unb64(box.salt));
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(box.iv) as BufferSource },
      key,
      unb64(box.data) as BufferSource,
    );
    return JSON.parse(td.decode(plain));
  } catch {
    throw new Error("Wrong passphrase — couldn't decrypt the backup.");
  }
}

/* ---------- backup & restore ---------- */

interface BackupPayloadData {
  entries: Entry[];
  checkins: Checkin[];
}

function utf8ToBase64(s: string): string {
  return b64(te.encode(s));
}

function base64ToUtf8(s: string): string {
  return td.decode(unb64(s));
}

export async function runBackup(settings: Settings): Promise<string> {
  const token = settings.githubToken.trim();
  if (!token) throw new Error("Add a GitHub token first.");
  const repo = settings.backupRepo.trim() || "goodfood-backup";
  try {
    const [entries, checkins] = await Promise.all([db.allEntries(), db.allCheckins()]);
    const data: BackupPayloadData = { entries, checkins };
    const payload = settings.backupPassphrase
      ? {
          app: "goodfood",
          version: 1,
          encrypted: true,
          box: await encryptJson(data, settings.backupPassphrase),
        }
      : { app: "goodfood", version: 1, encrypted: false, data };

    const owner = await getUsername(token);
    await ensureRepo(token, owner, repo);

    // Need the current file's SHA to update it (GitHub Contents API).
    const existing = await gh(token, `/repos/${owner}/${repo}/contents/${FILE_PATH}`);
    const sha = existing.ok ? (await existing.json()).sha : undefined;

    const put = await gh(token, `/repos/${owner}/${repo}/contents/${FILE_PATH}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `GoodFood backup — ${entries.length} entries, ${checkins.length} check-ins`,
        content: utf8ToBase64(JSON.stringify(payload)),
        ...(sha ? { sha } : {}),
      }),
    });
    if (!put.ok) throw new Error(`Upload failed (${put.status}).`);

    const msg = `Backed up ${entries.length} entries & ${checkins.length} check-ins to ${owner}/${repo}${settings.backupPassphrase ? " (encrypted)" : ""}.`;
    saveStatus({ lastSuccessAt: Date.now(), lastMessage: msg, lastError: undefined });
    return msg;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backup failed.";
    saveStatus({ lastError: message });
    throw err;
  }
}

export interface RestoreResult {
  added: number;
  skipped: number;
}

/** Merge the cloud backup into the local DB (existing records win). */
export async function runRestore(settings: Settings): Promise<RestoreResult> {
  const token = settings.githubToken.trim();
  if (!token) throw new Error("Add a GitHub token first.");
  const repo = settings.backupRepo.trim() || "goodfood-backup";
  const owner = await getUsername(token);
  const res = await gh(token, `/repos/${owner}/${repo}/contents/${FILE_PATH}`);
  if (res.status === 404) throw new Error(`No backup found in ${owner}/${repo}.`);
  if (!res.ok) throw new Error(`Download failed (${res.status}).`);
  const file = await res.json();
  const payload = JSON.parse(base64ToUtf8((file.content as string).replace(/\n/g, "")));
  if (payload?.app !== "goodfood") throw new Error("That file is not a GoodFood backup.");

  let data: BackupPayloadData;
  if (payload.encrypted) {
    if (!settings.backupPassphrase) {
      throw new Error("This backup is encrypted — enter its passphrase first.");
    }
    data = (await decryptJson(payload.box, settings.backupPassphrase)) as BackupPayloadData;
  } else {
    data = payload.data as BackupPayloadData;
  }

  const [entries, checkins] = await Promise.all([db.allEntries(), db.allCheckins()]);
  const haveEntries = new Set(entries.map((e) => e.id));
  const haveCheckins = new Set(checkins.map((c) => c.id));
  let added = 0;
  let skipped = 0;
  for (const e of data.entries ?? []) {
    if (!isValidEntry(e)) {
      skipped++;
      continue;
    }
    if (haveEntries.has(e.id)) continue;
    await db.putEntry(e);
    added++;
  }
  for (const c of data.checkins ?? []) {
    if (!isValidCheckin(c)) {
      skipped++;
      continue;
    }
    if (haveCheckins.has(c.id)) continue;
    await db.putCheckin(c);
    added++;
  }
  return { added, skipped };
}
