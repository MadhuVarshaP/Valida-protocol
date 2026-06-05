/**
 * IPFS & Encryption service for Zeno Phase 3 — vulnerability detail reveals.
 *
 * Encryption: AES-GCM with a key derived from NEXT_PUBLIC_REVEAL_ENCRYPTION_KEY.
 * MVP NOTE: Symmetric key in env is for development. In production, replace with
 *           asymmetric encryption (e.g. encrypt with admin's RSA/EC public key)
 *           so only the admin can decrypt revealed vulnerability details.
 *
 * IPFS: Uploads encrypted JSON to Pinata via NEXT_PUBLIC_PINATA_JWT.
 *       In production, route uploads through the backend to keep Pinata JWT server-side.
 */

const PBKDF2_ITERATIONS = 100_000;
const PINATA_PIN_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

async function deriveKey(): Promise<CryptoKey> {
	const rawKey = process.env.NEXT_PUBLIC_REVEAL_ENCRYPTION_KEY ?? "zeno-default-key-change-in-production";
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(rawKey),
		"PBKDF2",
		false,
		["deriveKey"]
	);
	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: new TextEncoder().encode("zeno-vuln-salt-v1"),
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"]
	);
}

export async function encryptDetails(plaintext: string): Promise<{ iv: string; ciphertext: string }> {
	const key = await deriveKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		new TextEncoder().encode(plaintext)
	);
	return {
		iv: Buffer.from(iv).toString("base64"),
		ciphertext: Buffer.from(encrypted).toString("base64"),
	};
}

export async function decryptDetails(payload: { iv: string; ciphertext: string }): Promise<string> {
	const key = await deriveKey();
	const iv = Buffer.from(payload.iv, "base64");
	const ciphertext = Buffer.from(payload.ciphertext, "base64");
	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv },
		key,
		ciphertext
	);
	return new TextDecoder().decode(decrypted);
}

export async function uploadToIPFS(content: object, name: string): Promise<string> {
	const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;
	if (!jwt) throw new Error("NEXT_PUBLIC_PINATA_JWT not configured — cannot upload to IPFS");

	const res = await fetch(PINATA_PIN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${jwt}`,
		},
		body: JSON.stringify({
			pinataContent: content,
			pinataMetadata: { name },
		}),
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`IPFS upload failed (${res.status}): ${err}`);
	}

	const data = (await res.json()) as { IpfsHash: string };
	return data.IpfsHash;
}

/**
 * Encrypts vulnerability details and uploads the encrypted blob to IPFS.
 * @returns IPFS CID (e.g. "Qm...")
 */
export async function encryptAndUploadVulnerability(
	details: string,
	submissionId: number
): Promise<string> {
	const encrypted = await encryptDetails(details);
	const cid = await uploadToIPFS(
		{ ...encrypted, submissionId, uploadedAt: Date.now() },
		`zeno-vuln-${submissionId}`
	);
	return cid;
}

/**
 * Fetches and decrypts vulnerability details from IPFS.
 */
export async function fetchAndDecrypt(cid: string): Promise<string> {
	const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";
	const res = await fetch(`${gateway}/${cid}`);
	if (!res.ok) throw new Error(`IPFS fetch failed for CID ${cid}`);
	const payload = await res.json() as { iv: string; ciphertext: string };
	return decryptDetails(payload);
}
