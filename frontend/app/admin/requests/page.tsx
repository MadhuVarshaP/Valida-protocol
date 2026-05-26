"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Badge, Button } from "@/components/UI";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { bpmsContractAbi } from "@/lib/contractAbi";
import { getContractWithSigner, getFrontendContractAddress } from "@/lib/ethers";

type AccessRequest = {
  _id: string;
  walletAddress: string;
  requestedRole: "publisher" | "device";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  updatedAt?: string;
};

function formatWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminRequestsPage() {
  const { address, role } = useWallet();
  const { showToast } = useToast();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /** Mongo _id for approve/reject, or `revoke:${_id}` for revoke */
  const [actionId, setActionId] = useState<string | null>(null);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests]
  );
  const approvedRequests = useMemo(
    () => requests.filter((request) => request.status === "approved"),
    [requests]
  );
  const rejectedRequests = useMemo(
    () => requests.filter((request) => request.status === "rejected"),
    [requests]
  );

  const fetchRequests = useCallback(async () => {
    if (!address || role !== "admin") return;
    setIsLoading(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${baseUrl}/api/admin/requests?role=all`, {
        headers: {
          "x-wallet-address": address
        },
        cache: "no-store"
      });
      const data = (await response.json()) as {
        requests?: AccessRequest[];
        error?: string;
      };
      if (!response.ok) {
        if (response.status === 403) {
          setRequests([]);
          return;
        }
        throw new Error(data.error || "Failed to fetch access requests");
      }
      setRequests(data.requests || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to fetch requests", "error");
    } finally {
      setIsLoading(false);
    }
  }, [address, role, showToast]);

  useEffect(() => {
    if (!address || role !== "admin") {
      setRequests([]);
      setIsLoading(false);
      return;
    }
    void fetchRequests();
  }, [address, role, fetchRequests]);

  async function syncAuthorizedPublisher(walletAddress: string, requestId?: string) {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    let lastError = "Failed to sync publisher approval";

    for (let attempt = 1; attempt <= 4; attempt++) {
      const response = await fetch(`${baseUrl}/api/admin/authorize-publisher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address || ""
        },
        body: JSON.stringify({
          walletAddress,
          requestId
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (response.ok) return;

      lastError = payload.error || lastError;
      const waitingOnChain =
        response.status === 400 &&
        typeof payload.error === "string" &&
        payload.error.toLowerCase().includes("not authorized on-chain yet");
      if (!waitingOnChain || attempt === 4) {
        throw new Error(lastError);
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  async function approveRequest(request: AccessRequest) {
    if (!address || actionId) return;
    setActionId(request._id);
    try {
      const contractAddress = getFrontendContractAddress();
      const contract = await getContractWithSigner(contractAddress, bpmsContractAbi);
      if (request.requestedRole === "publisher") {
        const tx = await contract.authorizePublisher(request.walletAddress);
        await tx.wait();
        await syncAuthorizedPublisher(request.walletAddress, request._id);
      } else {
        const tx = await contract.registerDevice(request.walletAddress);
        await tx.wait();

        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const response = await fetch(`${baseUrl}/api/admin/register-device`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": address
          },
          body: JSON.stringify({
            walletAddress: request.walletAddress,
            deviceId: `device-${request.walletAddress.slice(2, 10)}`,
            deviceType: "other",
            requestId: request._id
          })
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Failed to sync device registration");
        }
      }

      showToast(
        request.requestedRole === "publisher"
          ? "Publisher approved successfully"
          : "Device approved successfully",
        "success"
      );
      await fetchRequests();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Approval failed", "error");
    } finally {
      setActionId(null);
    }
  }

  async function rejectRequest(requestId: string) {
    if (!address || actionId) return;
    setActionId(requestId);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${baseUrl}/api/admin/requests/publisher/${requestId}/reject`, {
        method: "POST",
        headers: {
          "x-wallet-address": address
        }
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to reject request");
      }
      showToast("Publisher request rejected", "info");
      await fetchRequests();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Rejection failed", "error");
    } finally {
      setActionId(null);
    }
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tight">
            Access Requests
          </h1>
          <p className="text-[#1A1A1A]/70 font-medium">
            Review publisher and device requests, approve on-chain first, then sync. History below is loaded from the
            database.
          </p>
        </div>

        <Card title="Pending" subtitle="Awaiting admin decision">
          {isLoading ? (
            <p className="text-[#1A1A1A]/70">Loading requests…</p>
          ) : pendingRequests.length === 0 ? (
            <div className="flex items-center gap-3 text-[#1A1A1A]/70">
              <CheckCircle2 size={18} className="text-[#1A1A1A]" />
              <span>No pending access requests.</span>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <div
                  key={request._id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-[#1A1A1A]/5 bg-white/40"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="warning">
                        <Clock3 size={12} className="inline mr-1" />
                        Pending
                      </Badge>
                      <Badge variant={request.requestedRole === "publisher" ? "info" : "warning"}>
                        {request.requestedRole === "publisher" ? "Publisher" : "Device"}
                      </Badge>
                      <span className="text-xs text-[#1A1A1A]/50">
                        Requested {formatWhen(request.createdAt)}
                      </span>
                    </div>
                    <p className="text-[#1A1A1A]/90 font-mono break-all">{request.walletAddress}</p>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => void approveRequest(request)}
                      isLoading={actionId === request._id}
                      className="min-w-28"
                    >
                      {request.requestedRole === "publisher" ? "Approve Publisher" : "Approve Device"}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => void rejectRequest(request._id)}
                      disabled={actionId === request._id}
                      className="min-w-28"
                    >
                      <XCircle size={16} className="mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Approved" subtitle="On-chain authorization recorded (history)">
          <div className="space-y-3">
            {isLoading ? (
              <p className="text-[#1A1A1A]/50 text-sm">Loading…</p>
            ) : approvedRequests.length === 0 ? (
              <p className="text-[#1A1A1A]/50 text-sm">No approved requests in history yet.</p>
            ) : (
              approvedRequests.map((request) => (
                <div
                  key={request._id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-[#1A1A1A]/10 bg-[#A9FD5F]/30"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="success">Approved</Badge>
                      <Badge variant={request.requestedRole === "publisher" ? "info" : "warning"}>
                        {request.requestedRole === "publisher" ? "Publisher" : "Device"}
                      </Badge>
                      <span className="text-xs text-[#1A1A1A]/50">
                        {formatWhen(request.reviewedAt || request.updatedAt)}
                      </span>
                    </div>
                    <p className="text-green-900 font-mono break-all">{request.walletAddress}</p>
                    {request.reviewedBy ? (
                      <p className="text-xs text-[#1A1A1A]/50 font-mono">
                        Reviewer: {request.reviewedBy}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Rejected" subtitle="Declined requests (audit trail)">
          <div className="space-y-3">
            {isLoading ? (
              <p className="text-[#1A1A1A]/50 text-sm">Loading…</p>
            ) : rejectedRequests.length === 0 ? (
              <p className="text-[#1A1A1A]/50 text-sm">No rejected requests in history yet.</p>
            ) : (
              rejectedRequests.map((request) => (
                <div
                  key={request._id}
                  className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="error">Rejected</Badge>
                    <Badge variant={request.requestedRole === "publisher" ? "info" : "warning"}>
                      {request.requestedRole === "publisher" ? "Publisher" : "Device"}
                    </Badge>
                    <span className="text-xs text-[#1A1A1A]/50">
                      {formatWhen(request.reviewedAt || request.updatedAt)}
                    </span>
                  </div>
                  <p className="text-red-900 font-mono break-all">{request.walletAddress}</p>
                  {request.reviewedBy ? (
                    <p className="text-xs text-[#1A1A1A]/50 font-mono">Reviewer: {request.reviewedBy}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
