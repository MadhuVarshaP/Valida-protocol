"use client";

import "@/lib/solana/polyfill";
import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletAdapterProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import type { Adapter } from "@solana/wallet-adapter-base";
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

  const wallets = useMemo<Adapter[]>(() => {
    const list: Adapter[] = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ];
    if (process.env.NEXT_PUBLIC_ENABLE_BURNER === "true") {
      list.unshift(new BurnerWalletAdapter() as unknown as Adapter);
    }
    return list;
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletAdapterProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletAdapterProvider>
    </ConnectionProvider>
  );
}
