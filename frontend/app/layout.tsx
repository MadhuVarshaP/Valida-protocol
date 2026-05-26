import type { Metadata } from "next";
import { Inter, Outfit, DM_Sans } from "next/font/google";
import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { WalletProvider } from "@/context/WalletContext";
import { ToastProvider } from "@/context/ToastContext";
import { Web3Provider } from "@/context/Web3Provider";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BPMS | Blockchain-Based Patch Management System",
  description: "Secure, decentralized patch management for enterprise-grade software distribution.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="">
      <body className={`${outfit.variable} ${inter.variable} ${dmSans.variable} font-dm-sans antialiased selection:bg-[#1A1A1A] selection:text-[#A9FD5F]`}>
        <Web3Provider>
          <ToastProvider>
            <WalletProvider>
              {children}
            </WalletProvider>
          </ToastProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
