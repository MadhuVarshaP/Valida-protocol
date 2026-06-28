import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import { http } from "viem";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo-project-id";

export const iopnTestnet = defineChain({
  id: 984,
  name: "IOPN Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc-testnet.iopn.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "IOPN Explorer",
      url: process.env.NEXT_PUBLIC_EXPLORER_BASE_URL || "https://explorer-testnet.iopn.io",
    },
  },
  testnet: true,
});

export const wagmiConfig = getDefaultConfig({
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Zyra Protocol",
  projectId,
  chains: [iopnTestnet],
  transports: {
    [iopnTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
  },
  ssr: true,
});
