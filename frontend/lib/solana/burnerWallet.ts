import {
  BaseSignerWalletAdapter,
  WalletName,
  WalletReadyState,
  WalletNotConnectedError,
} from "@solana/wallet-adapter-base";
import {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

/**
 * Burner / local-keypair wallet adapter.
 *
 * Only registered when NEXT_PUBLIC_ENABLE_BURNER=true. It signs with an
 * in-memory keypair so the full on-chain flow can be driven by automated
 * tests (Playwright) without a browser extension, and so a devnet demo can
 * run without manual wallet popups.
 *
 * Key resolution order:
 *   1. localStorage["zyra_burner_sk"]  — JSON array of 64 bytes (tests set this)
 *   2. NEXT_PUBLIC_BURNER_SECRET_KEY     — JSON array of 64 bytes
 *   3. freshly generated + persisted to localStorage
 */

export const BurnerWalletName = "Burner (Devnet)" as WalletName<"Burner (Devnet)">;

const STORAGE_KEY = "zyra_burner_sk";

// A tiny green shield icon (data URI) so the wallet modal renders something.
const ICON =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
  ).toString("base64");

function parseSecret(json: string): Keypair {
  const arr = JSON.parse(json) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export function loadBurnerKeypair(): Keypair {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return parseSecret(stored);
      } catch {
        /* fall through to regenerate */
      }
    }
  }

  const envKey = process.env.NEXT_PUBLIC_BURNER_SECRET_KEY;
  if (envKey) {
    try {
      const kp = parseSecret(envKey);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(kp.secretKey)));
      }
      return kp;
    } catch {
      /* ignore malformed env key */
    }
  }

  const fresh = Keypair.generate();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Array.from(fresh.secretKey))
    );
  }
  return fresh;
}

export class BurnerWalletAdapter extends BaseSignerWalletAdapter {
  name = BurnerWalletName;
  url = "https://solana.com";
  icon = ICON;
  readonly supportedTransactionVersions = new Set(["legacy", 0] as const);

  private _keypair: Keypair | null = null;
  private _publicKey: PublicKey | null = null;
  private _connecting = false;

  get connecting(): boolean {
    return this._connecting;
  }

  get publicKey(): PublicKey | null {
    return this._publicKey;
  }

  get readyState(): WalletReadyState {
    return WalletReadyState.Loadable;
  }

  async connect(): Promise<void> {
    try {
      this._connecting = true;
      const kp = loadBurnerKeypair();
      this._keypair = kp;
      this._publicKey = kp.publicKey;
      this.emit("connect", kp.publicKey);
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._keypair = null;
    this._publicKey = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T> {
    if (!this._keypair) throw new WalletNotConnectedError();
    if (transaction instanceof VersionedTransaction) {
      transaction.sign([this._keypair]);
    } else {
      transaction.partialSign(this._keypair);
    }
    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]> {
    return Promise.all(transactions.map((tx) => this.signTransaction(tx)));
  }
}
