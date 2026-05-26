"use client";

import React, { useState } from "react";
import { Sidebar, Navbar } from "./Layout";
import { useWallet } from "@/context/WalletContext";
import { usePathname, useRouter } from "next/navigation";

export const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const { address, role, isLoading } = useWallet();
    const router = useRouter();
    const pathname = usePathname();

    // Basic client-side auth guard (mock)
    React.useEffect(() => {
        if (!isLoading && !address) {
            router.push("/");
        }
    }, [address, isLoading, router]);

    React.useEffect(() => {
        if (isLoading || !address || !role || role === "unauthorized") return;

        const inAdminRoute = pathname.startsWith("/admin");
        const inPublisherRoute = pathname.startsWith("/publisher");
        const inDeviceRoute = pathname.startsWith("/device");

        if (inAdminRoute && role !== "admin") {
            if (role === "publisher") router.push("/publisher/dashboard");
            else if (role === "device") router.push("/device/dashboard");
            else router.push("/unauthorized");
        } else if (inPublisherRoute && role !== "publisher") {
            if (role === "admin") router.push("/admin/dashboard");
            else if (role === "device") router.push("/device/dashboard");
            else router.push("/unauthorized");
        } else if (inDeviceRoute && role !== "device") {
            if (role === "admin") router.push("/admin/dashboard");
            else if (role === "publisher") router.push("/publisher/dashboard");
            else router.push("/unauthorized");
        }
    }, [address, isLoading, pathname, role, router]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#EDEDED] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                    <p className="text-[#1A1A1A] font-medium tracking-widest uppercase text-xs">Initializing Secure Environment...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#EDEDED] text-[#1A1A1A]/90">
            <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />

            <div className="flex flex-col min-h-screen transition-all duration-300 md:pl-20 lg:pl-[260px]">
                <Navbar setIsMobileOpen={setIsMobileOpen} />

                <main className="flex-1 pt-24 px-6 pb-12 overflow-x-hidden md:pl-12 lg:pl-16">
                    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};
