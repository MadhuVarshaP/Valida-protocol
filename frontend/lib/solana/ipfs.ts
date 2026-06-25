/**
 * BPMS patch storage — IPFS + SHA-256 integrity.
 *
 * The deployed Valida program stores only an `ipfs_cid` (String) and a
 * `file_hash` ([u8;32]) per patch. The actual patch binary lives off-chain on
 * IPFS; the device re-downloads it, recomputes SHA-256, and compares against the
 * on-chain `file_hash` before allowing installation. This module provides:
 *
 *   1. sha256OfBytes        — the integrity hash (raw bytes form for the program
 *                             arg + 0x-hex form for display / comparison).
 *   2. uploadFileToIPFS     — pins the file to IPFS via Pinata when a JWT is
 *                             configured; otherwise falls back to a content-
 *                             addressed local store so the demo runs end-to-end.
 *   3. fetchFileBytes       — retrieves the bytes a device needs to verify,
 *                             trying the local cache first (instant, no gateway
 *                             propagation lag) then an IPFS gateway.
 *
 * The on-chain hash commit is a real Solana devnet transaction regardless of the
 * storage backend — only the file-blob hosting differs.
 */

const PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const DEFAULT_GATEWAY = "https://gateway.pinata.cloud/ipfs";
const LOCAL_CID_PREFIX = "local-";
const IDB_NAME = "valida-bpms";
const IDB_STORE = "patch-files";

export type StorageBackend = "Pinata IPFS" | "Local content store";

function pinataJwt(): string | undefined {
  return process.env.NEXT_PUBLIC_PINATA_JWT;
}

export function pinataConfigured(): boolean {
  return Boolean(pinataJwt());
}

export function storageBackend(): StorageBackend {
  return pinataConfigured() ? "Pinata IPFS" : "Local content store";
}

export function ipfsGateway(): string {
  return process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? DEFAULT_GATEWAY;
}

export function isLocalCid(cid: string): boolean {
  return cid.startsWith(LOCAL_CID_PREFIX);
}

/** SHA-256 of file bytes — returns both the program arg form and a 0x-hex string. */
export async function sha256OfBytes(
  buffer: ArrayBuffer
): Promise<{ bytes: number[]; hex: string }> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = Array.from(new Uint8Array(digest));
  const hex = "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return { bytes, hex };
}

/** 0x-hex form of an on-chain [u8;32] file_hash, for comparison/display. */
export function fileHashHex(bytes: number[]): string {
  return "0x" + bytes.map((b) => (b & 0xff).toString(16).padStart(2, "0")).join("");
}

// ── Local content store (IndexedDB) ─────────────────────────────────────────────
// Keyed by CID so the device side can retrieve the exact bytes that were pinned,
// even before an IPFS gateway has propagated a fresh pin.

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function cacheBytes(cid: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(buffer, cid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

async function readCachedBytes(cid: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  if (!db) return null;
  const result = await new Promise<ArrayBuffer | null>((resolve) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(cid);
    req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null);
    req.onerror = () => resolve(null);
  });
  db.close();
  return result;
}

// ── Upload / download ───────────────────────────────────────────────────────────

export interface UploadResult {
  cid: string;
  size: number;
  backend: StorageBackend;
}

/**
 * Pin a patch file to IPFS. Uses Pinata when NEXT_PUBLIC_PINATA_JWT is set;
 * otherwise stores it in a content-addressed local cache and returns a
 * `local-<hash>` CID so the rest of the flow (on-chain commit + device verify)
 * works without external credentials.
 */
export async function uploadFileToIPFS(file: File): Promise<UploadResult> {
  const buffer = await file.arrayBuffer();
  const jwt = pinataJwt();

  if (jwt) {
    const form = new FormData();
    form.append("file", file);
    form.append("pinataMetadata", JSON.stringify({ name: file.name }));
    const res = await fetch(PINATA_PIN_FILE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`IPFS pin failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { IpfsHash: string };
    // Cache locally too, so the device can verify immediately without waiting
    // on gateway propagation.
    await cacheBytes(data.IpfsHash, buffer);
    return { cid: data.IpfsHash, size: file.size, backend: "Pinata IPFS" };
  }

  // No Pinata JWT: derive a deterministic content-addressed id and store bytes.
  const { hex } = await sha256OfBytes(buffer);
  const cid = `${LOCAL_CID_PREFIX}${hex.slice(2)}`;
  await cacheBytes(cid, buffer);
  return { cid, size: file.size, backend: "Local content store" };
}

/**
 * Retrieve the bytes for a patch CID so a device can recompute the hash.
 * Tries the local cache first, then an IPFS gateway. Throws if neither resolves
 * (the device UI then offers manual file re-selection as a fallback).
 */
export async function fetchFileBytes(cid: string): Promise<ArrayBuffer> {
  const cached = await readCachedBytes(cid);
  if (cached) return cached;

  if (isLocalCid(cid)) {
    throw new Error(
      "This patch was pinned to a local content store on another device/browser. Re-select the patch file to verify."
    );
  }

  const res = await fetch(`${ipfsGateway()}/${cid}`);
  if (!res.ok) throw new Error(`IPFS gateway fetch failed (${res.status}) for ${cid}`);
  const buffer = await res.arrayBuffer();
  void cacheBytes(cid, buffer);
  return buffer;
}
