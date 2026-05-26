"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import {
    LayoutDashboard,
    ShieldCheck,
    Users,
    Settings,
    History,
    Package,
    PlusCircle,
    BarChart3,
    Cpu,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Menu,
    Wallet,
    Zap
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const Sidebar = ({ isMobileOpen, setIsMobileOpen }: { isMobileOpen: boolean, setIsMobileOpen: (v: boolean) => void }) => {
    const pathname = usePathname();
    const { role, disconnectWallet } = useWallet();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const getMenuItems = () => {
        switch (role) {
            case "admin":
                return [
                    { icon: LayoutDashboard, label: "Dashboard", href: "/admin/dashboard" },
                    { icon: History, label: "Requests", href: "/admin/requests" },
                    { icon: Cpu, label: "Devices", href: "/admin/devices" },
                    { icon: Users, label: "Publishers", href: "/admin/publishers" },
                    { icon: Package, label: "Patches", href: "/admin/patches" },
                    { icon: History, label: "Audit Logs", href: "/admin/logs" },
                    { icon: Settings, label: "Settings", href: "/admin/settings" },
                ];
            case "publisher":
                return [
                    { icon: LayoutDashboard, label: "Dashboard", href: "/publisher/dashboard" },
                    { icon: PlusCircle, label: "Publish Patch", href: "/publisher/publish" },
                    { icon: Package, label: "My Patches", href: "/publisher/patches" },
                    { icon: BarChart3, label: "Analytics", href: "/publisher/analytics" },
                ];
            case "device":
                return [
                    { icon: LayoutDashboard, label: "Dashboard", href: "/device/dashboard" },
                    { icon: Package, label: "Registry patches", href: "/device/patches" },
                    { icon: Zap, label: "Sync timeline", href: "/device/sync" },
                ];
            default:
                return [];
        }
    };

    const menuItems = getMenuItems();

    const handleLinkClick = () => {
        if (isMobileOpen) setIsMobileOpen(false);
    };

    return (
        <>
            {/* Mobile Backdrop */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Sidebar Container */}
            <aside
                className={cn(
                    "fixed top-0 left-0 bottom-0 bg-white border-r border-[#1A1A1A]/5 z-50 transition-all duration-300 group",
                    isMobileOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0",
                    !isMobileOpen && (isCollapsed ? "md:w-20" : "md:w-64")
                )}
            >
                {/* Logo Section */}
                <div className={cn("h-20 flex items-center px-6 border-b border-[#1A1A1A]/5 overflow-hidden transition-all", isCollapsed ? "gap-0" : "gap-2")}>
                    <img src="/logo.png" alt="Logo" className={cn("h-7 md:h-10 object-contain shrink-0 transition-transform", isCollapsed ? "h-6" : "")} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    <span className={cn(
                        "text-xl md:text-2xl font-black tracking-tight text-[#1A1A1A] transition-opacity duration-300",
                        isCollapsed && "w-0 opacity-0 overflow-hidden"
                    )}>
                        BPMS
                    </span>
                </div>

                {/* Navigation Section */}
                <nav className="flex-1 py-8 px-4 space-y-2 overflow-y-auto custom-scrollbar">
                    {menuItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={handleLinkClick}
                            className={cn(
                                "flex items-center rounded-xl p-3 text-[#1A1A1A]/70 font-medium transition-all group",
                                pathname === item.href
                                    ? "bg-[#A9FD5F] text-[#1A1A1A] ring-1 ring-emerald-500/20 shadow-lg shadow-emerald-500/5"
                                    : "hover:bg-[#EDEDED]/50 hover:text-[#1A1A1A]"
                            )}
                        >
                            <item.icon size={22} className={cn("shrink-0 transition-transform duration-300 group-hover:scale-110", pathname === item.href && "text-[#1A1A1A]")} />
                            <span className={cn(
                                "ml-3 transition-opacity duration-300 whitespace-nowrap overflow-hidden",
                                isCollapsed && !isMobileOpen && "md:w-0 md:opacity-0"
                            )}>
                                {item.label}
                            </span>
                        </Link>
                    ))}
                </nav>

                {/* Collapse Button (Desktop) */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="hidden md:flex absolute top-24 -right-3 w-6 h-6 bg-[#EDEDED] border border-[#1A1A1A]/10 rounded-full items-center justify-center text-[#1A1A1A]/70 hover:text-[#1A1A1A] z-50 transition-all"
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>

                {/* Footer Section */}
                <div className="p-4 border-t border-[#1A1A1A]/5 space-y-2">
                    <button
                        onClick={disconnectWallet}
                        className={cn(
                            "flex w-full items-center rounded-xl p-3 text-[#1A1A1A]/70 font-medium transition-all group hover:bg-rose-500/10 hover:text-rose-500",
                        )}
                    >
                        <LogOut size={22} className="shrink-0 group-hover:scale-110" />
                        <span className={cn(
                            "ml-3 transition-opacity duration-300 whitespace-nowrap overflow-hidden",
                            isCollapsed && !isMobileOpen && "md:w-0 md:opacity-0"
                        )}>
                            Logout
                        </span>
                    </button>
                </div>
            </aside>
        </>
    );
};

export const Navbar = ({ setIsMobileOpen }: { setIsMobileOpen: (v: boolean) => void }) => {
    const { address, role } = useWallet();

    const getRoleLabel = () => {
        switch (role) {
            case "admin": return { label: "Administrator", color: "bg-[#A9FD5F] text-[#1A1A1A]" };
            case "publisher": return { label: "Publisher", color: "bg-blue-500/10 text-blue-500" };
            case "device": return { label: "Device", color: "bg-amber-500/10 text-amber-500" };
            default: return { label: "Unauthorized", color: "bg-rose-500/10 text-rose-500" };
        }
    };

    const roleInfo = getRoleLabel();

    return (
        <header className="h-20 bg-[#EDEDED]/80 backdrop-blur-xl border-b border-[#1A1A1A]/5 fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 transition-all duration-300 md:pl-[64px] lg:pl-[64px]">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => setIsMobileOpen(true)}
                    className="p-2 -ml-2 text-[#1A1A1A]/70 hover:text-[#1A1A1A] md:hidden"
                >
                    <Menu size={24} />
                </button>
                {/* <div className="hidden md:block">
                    <p className="text-xs font-semibold text-[#1A1A1A]/50 uppercase tracking-widest">System Status</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <div className="h-2 w-2 rounded-full bg-[#A9FD5F] animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        <span className="text-sm font-medium text-[#1A1A1A]/90 whitespace-nowrap">Mainnet Linked</span>
                    </div>
                </div> */}
            </div>

            <div className="flex items-center gap-4">
                {/* Role Badge */}
                <div className={cn("px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider", roleInfo.color)}>
                    {roleInfo.label}
                </div>

                {/* Wallet Address Display */}
                <div className="glass px-4 py-2 rounded-xl flex items-center gap-2 border border-[#1A1A1A]/10 shadow-lg shadow-emerald-500/5">
                    <Wallet size={16} className="text-[#1A1A1A]" />
                    <span className="text-sm font-mono text-[#1A1A1A]/80 tracking-tight">
                        {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not Connected"}
                    </span>
                </div>
            </div>
        </header>
    );
};
