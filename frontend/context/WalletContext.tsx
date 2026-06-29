"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  useAnchorWallet,
  useConnection,
  useWallet as useSolanaWallet,
} from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { getProgram, getReadonlyProgram, fetchConfig } from "@/lib/solana/zyra";

type Role = "admin" | "publisher" | "device" | "auditor" | "unauthorized" | null;

interface WalletContextType {
  address: string | null;
  role: Role;
  isLoading: boolean;
  connectWallet: () => void;
  disconnectWallet: () => void;
  isConnected: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { connected, connecting, disconnect, connect, wallet } =
    useSolanaWallet();
  const { setVisible } = useWalletModal();
  // Bumped on every explicit "Connect" click. autoConnect is OFF (so the
  // wallet-adapter never does a silent reconnect-on-mount, which is what made
  // Phantom throw "WalletConnectionError: Unexpected error"). Instead we drive
  // the connect ourselves, but ONLY in response to this user intent.
  const [connectIntent, setConnectIntent] = useState(0);

  const [role, setRole] = useState<Role>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(false);
  // Grace window so an in-flight connect can settle before any "not connected"
  // route guard fires (prevents a flash-redirect to home right after a click).
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAuthChecked(true), 2000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (connected) setAuthChecked(true);
  }, [connected]);

  const address = useMemo(
    () => anchorWallet?.publicKey.toBase58() ?? null,
    [anchorWallet]
  );

  // If a wallet is already selected (e.g. picked earlier this session), just
  // (re)connect it; otherwise open the modal so the user can choose one. Either
  // way bump the intent so the effect below performs the actual connect.
  const connectWallet = () => {
    setConnectIntent((n) => n + 1);
    if (!wallet) setVisible(true);
  };

  // Perform the explicit connect once the user has shown intent AND a wallet is
  // selected (either it was already selected, or they just picked one in the
  // modal — which sets `wallet` and re-runs this effect). connect() is a real
  // user-gesture-backed call, so Phantom opens its approval popup normally;
  // errors (rejected/locked) are handled by the provider's onError.
  useEffect(() => {
    if (connectIntent === 0 || !wallet || connected || connecting) return;
    void connect().catch(() => {
      /* surfaced via Web3Provider onError */
    });
  }, [connectIntent, wallet, connected, connecting, connect]);

  const disconnectWallet = () => {
    void disconnect();
    setRole(null);
    router.push("/");
  };

  // Resolve role from on-chain config: config.admin → admin, otherwise auditor.
  useEffect(() => {
    let cancelled = false;

    async function resolveRole() {
      if (!address) {
        setRole(null);
        return;
      }
      setIsRoleLoading(true);
      try {
        const program = anchorWallet
          ? getProgram(anchorWallet, connection)
          : getReadonlyProgram(connection);

        // Retry: a transient RPC failure must not downgrade an admin to auditor
        // (which would bounce them off /admin/* via the route guard).
        let config = null;
        let lastErr: unknown = null;
        for (let i = 0; i < 5; i++) {
          try {
            config = await fetchConfig(program);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            await new Promise((r) => setTimeout(r, 800 * (i + 1)));
          }
        }
        if (lastErr) throw lastErr;

        let detected: Role = "auditor";
        if (config && config.admin.toBase58() === address) detected = "admin";
        // If config doesn't exist yet, the first connector is treated as the
        // prospective admin so they can initialize the program.
        if (!config) detected = "admin";

        if (!cancelled) setRole(detected);
      } catch {
        // Could not read config after retries — keep the wallet unrouted rather
        // than forcing a role that would trigger a wrong-page redirect.
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setIsRoleLoading(false);
      }
    }

    void resolveRole();
    return () => {
      cancelled = true;
    };
  }, [address, anchorWallet, connection]);

  // Route to the role dashboard once connected — but only from the landing
  // page, so navigating directly to a role route (or between role pages) is
  // not hijacked back to the dashboard.
  useEffect(() => {
    if (!connected || isRoleLoading || !role) return;
    if (pathname !== "/") return;
    if (role === "admin") router.push("/admin/dashboard");
    else if (role === "auditor") router.push("/auditor/dashboard");
    else router.push("/unauthorized");
  }, [connected, isRoleLoading, role, router, pathname]);

  const isLoading = !authChecked || connecting || isRoleLoading;

  return (
    <WalletContext.Provider
      value={{
        address,
        role,
        isLoading,
        connectWallet,
        disconnectWallet,
        isConnected: connected,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
