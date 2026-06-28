"use client";

import { useMemo } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import type { Program } from "@coral-xyz/anchor";
import type { Zyra } from "@/lib/solana/idl/zyra-types";
import { getProgram, getReadonlyProgram } from "@/lib/solana/zyra";

/**
 * Returns an Anchor Program bound to the connected wallet (read-write) when a
 * wallet is connected, otherwise a read-only program for fetching accounts.
 * `canSign` indicates whether the program can send transactions.
 */
export function useZyraProgram(): {
  program: Program<Zyra>;
  canSign: boolean;
} {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  return useMemo(() => {
    if (anchorWallet) {
      return { program: getProgram(anchorWallet, connection), canSign: true };
    }
    return { program: getReadonlyProgram(connection), canSign: false };
  }, [anchorWallet, connection]);
}
