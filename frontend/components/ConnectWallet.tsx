"use client";

import React from "react";
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/UI";
import { useWallet } from "@/context/WalletContext";

/**
 * Solana connect button, drop-in replacement for the RainbowKit ConnectButton.
 * Opens the wallet-adapter modal (Phantom / Solflare / Burner) when disconnected;
 * shows the truncated address when connected.
 */
export function ConnectWallet({ className }: { className?: string }) {
  const { setVisible } = useWalletModal();
  const { publicKey, connected, disconnect } = useSolanaWallet();
  const { isLoading } = useWallet();

  if (!connected || !publicKey) {
    return (
      <Button
        onClick={() => setVisible(true)}
        isLoading={isLoading}
        data-testid="connect-wallet"
        className={
          className ??
          "text-[14px] font-bold px-8 py-5 rounded-full border border-[#1A1A1A] bg-white text-[#1A1A1A] hover:bg-[#A9FD5F] hover:scale-[1.03] transition-all flex items-center shadow-none hover:shadow-none"
        }
      >
        Connect Wallet
      </Button>
    );
  }

  const addr = publicKey.toBase58();
  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => void disconnect()}
        data-testid="wallet-address"
        className="text-[13px] font-bold px-6 py-4 rounded-full bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/90 transition-colors shadow-lg"
      >
        {addr.slice(0, 4)}…{addr.slice(-4)}
      </Button>
    </div>
  );
}
