"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { BrowserProvider, Contract } from "ethers";

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
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const [role, setRole] = useState<Role>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(false);

  const normalizedAddress = useMemo(
    () => (address ? address.toLowerCase() : null),
    [address]
  );

  const connectWallet = () => {
    // RainbowKit ConnectButton handles modal opening
  };

  const disconnectWallet = () => {
    disconnect();
    setRole(null);
    router.push("/");
  };

  useEffect(() => {
    let isCancelled = false;

    async function resolveRole() {
      if (!normalizedAddress) {
        setRole(null);
        return;
      }

      setIsRoleLoading(true);
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const response = await fetch(`${baseUrl}/api/user/role/${normalizedAddress}`, {
          cache: "no-store"
        });

        if (!response.ok) {
          if (!isCancelled) setRole("unauthorized");
          return;
        }

        const data = (await response.json()) as { role?: Role; status?: string };
        let detectedRole: Role =
          data.status === "active" &&
          (data.role === "admin" || data.role === "publisher" || data.role === "device" || data.role === "auditor")
            ? data.role
            : "unauthorized";

        // If backend doesn't know this wallet, check on-chain for auditor registration
        if (detectedRole === "unauthorized") {
          const vulnAddr = process.env.NEXT_PUBLIC_VULN_CONTRACT_ADDRESS;
          if (vulnAddr && typeof window !== "undefined") {
            try {
              const eth = (window as unknown as { ethereum?: object }).ethereum;
              if (eth) {
                const provider = new BrowserProvider(eth as Parameters<typeof BrowserProvider>[0]);
                const contract = new Contract(
                  vulnAddr,
                  ["function registeredAuditors(address) view returns (bool)"],
                  provider
                );
                const isAuditor = await contract.registeredAuditors(normalizedAddress) as boolean;
                if (isAuditor) detectedRole = "auditor";
              }
            } catch { /* on-chain check is best-effort */ }
          }
        }

        if (!isCancelled) setRole(detectedRole);
      } catch {
        if (!isCancelled) setRole("unauthorized");
      } finally {
        if (!isCancelled) setIsRoleLoading(false);
      }
    }

    void resolveRole();
    return () => { isCancelled = true; };
  }, [normalizedAddress]);

  useEffect(() => {
    if (!isConnected || isRoleLoading || !role) return;

    if (role === "admin") router.push("/admin/dashboard");
    else if (role === "publisher") router.push("/publisher/dashboard");
    else if (role === "device") router.push("/device/dashboard");
    else if (role === "auditor") router.push("/auditor/dashboard");
    else router.push("/unauthorized");
  }, [isConnected, isRoleLoading, role, router]);

  const isLoading = isConnecting || isReconnecting || isRoleLoading;

  return (
    <WalletContext.Provider
      value={{
        address: normalizedAddress,
        role,
        isLoading,
        connectWallet,
        disconnectWallet,
        isConnected
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
