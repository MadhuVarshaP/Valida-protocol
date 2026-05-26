import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
}: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}) => {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
    }, [isOpen]);

    if (!isOpen || typeof document === "undefined") return null;

    /* Portal + fixed inset-0 ensures full viewport coverage above app shell layers.
       The dialog wrapper uses explicit top/bottom padding so the title/header is always visible. */
    return createPortal(
        <div
            className="fixed inset-0 z-[100050] flex min-h-0 flex-col overflow-y-auto overscroll-contain"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div
                className="fixed inset-0 z-0 bg-[#EDEDED]/90 backdrop-blur-sm transition-opacity"
                aria-hidden
                onClick={onClose}
            />

            <div className="relative z-[100051] mx-auto box-border flex min-h-full w-full items-start justify-center px-4 py-6 sm:px-6 sm:py-10">
                <div className="glass-dark flex w-full max-w-lg max-h-[min(calc(100dvh-3rem),90dvh)] flex-col overflow-hidden rounded-2xl border border-[#1A1A1A]/10 shadow-2xl shadow-emerald-500/10 animate-fade-in">
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#1A1A1A]/5 px-6 py-4">
                        <h3 id="modal-title" className="text-xl font-bold text-[#1A1A1A] tracking-tight">
                            {title}
                        </h3>
                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 p-2 text-[#1A1A1A]/70 transition-colors hover:text-[#1A1A1A]"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>

                    {footer && (
                        <div className="flex shrink-0 justify-end gap-3 border-t border-[#1A1A1A]/5 bg-white/2 px-6 py-4">
                            {footer}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export const FormInput = ({
    label,
    placeholder,
    value,
    onChange,
    type = "text",
    error,
}: {
    label: string;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    error?: string;
}) => {
    return (
        <div className="space-y-2">
            <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">{label}</label>
            <input
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                className={cn(
                    "w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] placeholder:text-[#1A1A1A]/50 focus:outline-none focus:border-[#1A1A1A]/30 transition-all",
                    error && "border-rose-500"
                )}
            />
            {error && <p className="text-xs text-rose-500 ml-1">{error}</p>}
        </div>
    );
};
