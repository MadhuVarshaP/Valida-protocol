"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, Info, X } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastCounterRef = useRef(0);

    const showToast = useCallback((message: string, type: ToastType = "info") => {
        toastCounterRef.current += 1;
        const id = Date.now() * 1000 + toastCounterRef.current;
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const contextValue = useMemo(() => ({ showToast }), [showToast]);

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <div className="fixed bottom-6 right-6 z-200 flex flex-col gap-3 max-w-sm w-full">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={cn(
                            "border p-4 rounded-xl shadow-2xl animate-fade-in flex items-start gap-3 transition-all bg-white/95 backdrop-blur-md",
                            toast.type === "success" ? "border-emerald-500/30" :
                                toast.type === "error" ? "border-rose-500/30" :
                                    toast.type === "warning" ? "border-amber-500/30" : "border-blue-500/30"
                        )}
                    >
                        <div className={cn(
                            "p-2 rounded-lg",
                            toast.type === "success" ? "bg-emerald-500/10 text-emerald-500" :
                                toast.type === "error" ? "bg-rose-500/10 text-rose-500" :
                                    toast.type === "warning" ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-500"
                        )}>
                            {toast.type === "success" && <CheckCircle2 size={18} />}
                            {toast.type === "error" && <XCircle size={18} />}
                            {toast.type === "warning" && <AlertCircle size={18} />}
                            {toast.type === "info" && <Info size={18} />}
                        </div>
                        <div className="flex-1 pt-1">
                            <p className="text-sm font-bold text-slate-900 tracking-tight">{toast.message}</p>
                        </div>
                        <button onClick={() => removeToast(toast.id)} className="p-1 text-slate-500 hover:text-slate-900 transition-all">
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}
