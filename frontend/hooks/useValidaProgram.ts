"use client";

import { useMemo } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import type { Program } from "@coral-xyz/anchor";
import type { Valida } from "@/lib/solana/idl/valida-types";
import { getProgram, getReadonlyProgram } from "@/lib/solana/valida";

/**
 * Returns an Anchor Program bound to the connected wallet (read-write) when a
 * wallet is connected, otherwise a read-only program for fetching accounts.
 * `canSign` indicates whether the program can send transactions.
 */
export function useValidaProgram(): {
  program: Program<Valida>;
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
