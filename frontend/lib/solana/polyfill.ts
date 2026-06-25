// Anchor / web3.js rely on a global Buffer, which Next's browser runtime does
// not provide by default. Import this once at the top of the client provider.
import { Buffer } from "buffer";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

export {};
