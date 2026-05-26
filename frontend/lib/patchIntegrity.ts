/** SHA-256 of file bytes as lowercase 0x + 64 hex (matches backend / contract). */
export async function sha256OfBuffer(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(hash);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

export function normalizeHash(h: string): string {
  return String(h || "").trim().toLowerCase();
}
