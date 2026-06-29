"use client";

import "@/lib/solana/polyfill";
import React, { useCallback, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletAdapterProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  WalletError,
  WalletNotReadyError,
  type Adapter,
} from "@solana/wallet-adapter-base";
import { RPC_ENDPOINT } from "@/lib/solana/constants";
import { BurnerWalletAdapter } from "@/lib/solana/burnerWallet";

import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Solana replacement for the old wagmi/RainbowKit Web3Provider.
 * Provides a devnet connection + wallet-adapter context (Phantom, Solflare,
 * and — when NEXT_PUBLIC_ENABLE_BURNER=true — a local burner wallet used for
 * automated testing and headless demos).
 */
export function Web3Provider({ children }: { children: React.ReactNode }) {
  const endpoint = RPC_ENDPOINT;

  // Phantom and Solflare register themselves via the Wallet Standard, so
  // wallet-adapter auto-detects them — we must NOT also pass the legacy
  // PhantomWalletAdapter/SolflareWalletAdapter, or Phantom ends up registered
  // twice and autoConnect drives the standard adapter into a
  // "WalletConnectionError: Unexpected error". Only the burner (a non-standard
  // local-keypair wallet for tests/headless demos) is registered explicitly.
  const wallets = useMemo<Adapter[]>(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_BURNER === "true") {
      return [new BurnerWalletAdapter() as unknown as Adapter];
    }
    return [];
  }, []);

  // autoConnect is OFF (see below). Phantom's Wallet Standard adapter throws
  // "WalletConnectionError: Unexpected error" when wallet-adapter tries to
  // silently reconnect on mount (locked wallet / session not yet trusted), so
  // we connect only on an explicit user click. This onError handler still
  // swallows the benign cases (user dismissed the popup, wallet not ready) and
  // logs real failures with a clear prefix so a devnet RPC rejection stays
  // diagnosable in the console.
  const onError = useCallback((error: WalletError) => {
    if (
      error instanceof WalletNotReadyError ||
      error.name === "WalletNotSelectedError" ||
      error.name === "WalletConnectionError" ||
      /user reject|rejected|cancel/i.test(error.message || "")
    ) {
      // User dismissed the popup or the wallet wasn't ready — not fatal.
      console.warn("[wallet]", error.name, error.message);
      return;
    }
    console.error("[wallet] connection error:", error);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <SolanaWalletAdapterProvider
        wallets={wallets}
        autoConnect={false}
        onError={onError}
        localStorageKey="zyra_wallet"
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletAdapterProvider>
    </ConnectionProvider>
  );
}
