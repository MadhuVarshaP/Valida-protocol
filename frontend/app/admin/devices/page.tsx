"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Badge, Button } from "@/components/UI";
import { Modal, FormInput } from "@/components/Forms";
import {
    Plus,
    Monitor,
    History,
    CheckCircle2,
    Ban
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { bpmsContractAbi } from "@/lib/contractAbi";
import { getContractWithSigner, getFrontendContractAddress } from "@/lib/ethers";

type Device = {
    walletAddress: string;
    deviceId: string;
    deviceType: string;
    location?: string;
    status: "registered" | "revoked" | "disabled";
    lastSeen: string;
};

export default function AdminDevices() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [walletAddress, setWalletAddress] = useState("");
    const [deviceId, setDeviceId] = useState("");
    const [deviceType, setDeviceType] = useState("other");
    const [location, setLocation] = useState("");
    const [devices, setDevices] = useState<Device[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [revokingWallet, setRevokingWallet] = useState<string | null>(null);
    const { address } = useWallet();
    const { showToast } = useToast();

    const fetchDevices = useCallback(async () => {
        if (!address) return;
        setIsLoading(true);
        try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
            const response = await fetch(`${baseUrl}/api/admin/devices`, {
                headers: {
                    "x-wallet-address": address,
                },
                cache: "no-store",
            });
            const data = (await response.json()) as { devices?: Device[]; error?: string };
            if (!response.ok) {
                throw new Error(data.error || "Failed to fetch devices");
            }
            setDevices(data.devices || []);
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Failed to fetch devices", "error");
        } finally {
            setIsLoading(false);
        }
    }, [address, showToast]);

    useEffect(() => {
        void fetchDevices();
    }, [fetchDevices]);

    async function handleRegisterDevice() {
        if (!address || !walletAddress || !deviceId || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const allowedTypes = new Set(["server", "drone", "radar", "sensor", "other"]);
            const normalizedType = allowedTypes.has(deviceType.toLowerCase())
                ? deviceType.toLowerCase()
                : "other";

            const contractAddress = getFrontendContractAddress();
            const contract = await getContractWithSigner(contractAddress, bpmsContractAbi);
            const tx = await contract.registerDevice(walletAddress.trim());
            await tx.wait();

            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
            const response = await fetch(`${baseUrl}/api/admin/register-device`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet-address": address,
                },
                body: JSON.stringify({
                    walletAddress: walletAddress.trim(),
                    deviceId: deviceId.trim(),
                    deviceType: normalizedType,
                    location: location.trim() || undefined,
                }),
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) {
                throw new Error(payload.error || "Failed to sync registered device");
            }

            showToast("Device registered successfully", "success");
            setWalletAddress("");
            setDeviceId("");
            setDeviceType("other");
            setLocation("");
            setIsModalOpen(false);
            await fetchDevices();
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Device registration failed", "error");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleRevokeDevice(device: Device) {
        if (!address || revokingWallet) return;
        setRevokingWallet(device.walletAddress);
        try {
            const contractAddress = getFrontendContractAddress();
            const contract = await getContractWithSigner(contractAddress, bpmsContractAbi);
            const tx = await contract.revokeDevice(device.walletAddress);
            await tx.wait();

            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
            const response = await fetch(`${baseUrl}/api/admin/revoke-device`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet-address": address,
                },
                body: JSON.stringify({
                    walletAddress: device.walletAddress,
                }),
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) {
                throw new Error(payload.error || "Failed to sync revoked device");
            }

            showToast("Device revoked on chain and synced", "success");
            await fetchDevices();
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Device revoke failed", "error");
        } finally {
            setRevokingWallet(null);
        }
    }

    const dashboardStats = [
        { label: "Total Registered", value: devices.filter(d => d.status === "registered").length, icon: CheckCircle2, color: "text-[#1A1A1A]" },
        { label: "Revoked", value: devices.filter(d => d.status === "revoked").length, icon: History, color: "text-[#1A1A1A]/50" },
        { label: "Total Devices", value: devices.length, icon: Monitor, color: "text-blue-500" },
    ];

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tight">System Devices</h1>
                        <p className="text-[#1A1A1A]/70 font-medium">Manage and authorize endpoint hardware in the secure network.</p>
                    </div>
                    <div className="flex gap-4">
                        <Button onClick={() => setIsModalOpen(true)} className="px-6 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-emerald-500/10">
                            <Plus size={18} />
                            Register Device
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {dashboardStats.map((stat, idx) => (
                        <div key={idx} className="glass p-5 rounded-2xl border border-[#1A1A1A]/5 flex items-center gap-6">
                            <div className={`p-4 rounded-xl bg-white ${stat.color}`}>
                                <stat.icon size={24} />
                            </div>
                            <div>
                                <p className="text-xs uppercase font-bold text-[#1A1A1A]/50 tracking-wider font-inter">{stat.label}</p>
                                <p className="text-2xl font-black text-[#1A1A1A] mt-1">{stat.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Devices Table */}
                <Card>
                    <div className="table-container">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th>Device Address</th>
                                    <th>Device ID</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th>Last Seen</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={6} className="text-[#1A1A1A]/70">Loading devices...</td>
                                    </tr>
                                ) : devices.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-[#1A1A1A]/70">No devices found.</td>
                                    </tr>
                                ) : devices.map((device) => (
                                    <tr key={device.walletAddress} className="group hover:bg-white/1">
                                        <td className="font-mono text-[#1A1A1A]/80 text-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-[#EDEDED] flex items-center justify-center text-[#1A1A1A]/50 group-hover:bg-[#A9FD5F] group-hover:text-[#1A1A1A] transition-all">
                                                    <Monitor size={18} />
                                                </div>
                                                <span className="font-semibold tracking-tight">
                                                    {device.walletAddress.slice(0, 10)}...{device.walletAddress.slice(-8)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="text-sm text-[#1A1A1A]/80">{device.deviceId}</td>
                                        <td className="text-sm text-[#1A1A1A]/80 uppercase">{device.deviceType}</td>
                                        <td>
                                            <Badge variant={device.status === "registered" ? "success" : "error"}>
                                                {device.status}
                                            </Badge>
                                        </td>
                                        <td className="text-sm text-[#1A1A1A]/70 font-medium">
                                            {new Date(device.lastSeen).toLocaleString()}
                                        </td>
                                        <td className="text-right">
                                            <Button
                                                variant="danger"
                                                className="min-w-24"
                                                isLoading={revokingWallet === device.walletAddress}
                                                disabled={device.status !== "registered" || (Boolean(revokingWallet) && revokingWallet !== device.walletAddress)}
                                                onClick={() => void handleRevokeDevice(device)}
                                            >
                                                <Ban size={14} className="mr-1" />
                                                Revoke
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* Register Device Modal */}
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title="Register Device Credentials"
                    footer={
                        <>
                            <Button onClick={() => setIsModalOpen(false)} variant="ghost" className="rounded-xl px-8">Cancel</Button>
                            <Button
                                onClick={() => void handleRegisterDevice()}
                                isLoading={isSubmitting}
                                className="rounded-xl px-12"
                            >
                                Submit Authorization
                            </Button>
                        </>
                    }
                >
                    <div className="space-y-6">
                        <p className="text-[#1A1A1A]/70 text-sm leading-relaxed">
                            Register a new hardware endpoint. The device will be issued a unique system token for cryptographical patch verification.
                        </p>
                        <FormInput
                            label="Hardware Wallet Address"
                            placeholder="0x..."
                            value={walletAddress}
                            onChange={(e) => setWalletAddress(e.target.value)}
                        />
                        <FormInput
                            label="Device ID"
                            placeholder="server-01"
                            value={deviceId}
                            onChange={(e) => setDeviceId(e.target.value)}
                        />
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">Device Type</label>
                            <select
                                value={deviceType}
                                onChange={(e) => setDeviceType(e.target.value)}
                                className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/30 transition-all"
                            >
                                <option value="server">Server</option>
                                <option value="drone">Drone</option>
                                <option value="radar">Radar</option>
                                <option value="sensor">Sensor</option>
                                <option value="other">Other (unclassified / miscellaneous)</option>
                            </select>
                            <p className="text-xs text-[#1A1A1A]/60 ml-1">
                                Choose <span className="font-semibold">Other</span> for anything that doesn’t fit the standard categories.
                            </p>
                        </div>
                        <FormInput
                            label="Location (optional)"
                            placeholder="Data center - rack A"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                        />
                        <div className="p-4 bg-[#A9FD5F]/30 border border-emerald-500/10 rounded-2xl flex items-start gap-4">
                            <History size={20} className="text-[#1A1A1A] mt-1" />
                            <p className="text-xs text-[#1A1A1A]/80 leading-relaxed font-medium">
                                The system will automatically perform a zero-trust compliance check once the device initiates its first sync heartbeat.
                            </p>
                        </div>
                    </div>
                </Modal>
            </div>
        </DashboardLayout>
    );
}
