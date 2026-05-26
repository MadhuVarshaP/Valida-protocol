import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
    size?: "sm" | "md" | "lg" | "icon";
    isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }, ref) => {
        const variants = {
            primary: "bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/90 hover:scale-[1.02]",
            secondary: "bg-[#EDEDED] text-[#1A1A1A] hover:bg-[#A9FD5F] hover:border-[#A9FD5F]",
            outline: "border-2 border-[#1A1A1A] bg-transparent hover:bg-[#1A1A1A]/5 text-[#1A1A1A]",
            ghost: "bg-transparent hover:bg-[#1A1A1A]/5 text-[#1A1A1A]",
            danger: "bg-rose-600 text-white hover:bg-rose-500",
            success: "bg-[#A9FD5F] text-[#1A1A1A] hover:bg-[#A9FD5F]/90 font-bold",
        };

        const sizes = {
            sm: "h-8 px-3 text-xs",
            md: "h-10 px-4 text-sm",
            lg: "h-12 px-6 text-base",
            icon: "h-10 w-10 p-0 flex items-center justify-center",
        };

        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
                    variants[variant],
                    sizes[size],
                    className
                )}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading ? (
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : null}
                {children}
            </button>
        );
    }
);

Button.displayName = "Button";

export const Badge = ({
    children,
    variant = "success",
    className,
}: {
    children: React.ReactNode;
    variant?: "success" | "warning" | "error" | "info" | "neutral";
    className?: string;
}) => {
    const variants = {
        success: "bg-[#A9FD5F] text-[#1A1A1A] border-[#1A1A1A]/10 font-bold",
        warning: "bg-amber-100 text-amber-700 border-amber-200",
        error: "bg-rose-100 text-rose-700 border-rose-200",
        info: "bg-blue-100 text-blue-700 border-blue-200",
        neutral: "bg-[#EDEDED] text-[#1A1A1A] border-[#1A1A1A]/10",
    };

    return (
        <span
            className={cn(
                "px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border",
                variants[variant],
                className
            )}
        >
            {children}
        </span>
    );
};

export const Skeleton = ({ className }: { className?: string }) => {
    return (
        <div className={cn("animate-pulse bg-[#EDEDED] rounded-lg", className)} />
    );
};

export const EmptyState = ({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: any;
    title: string;
    description: string;
    action?: React.ReactNode;
}) => {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="bg-[#EDEDED] p-4 rounded-2xl text-[#1A1A1A] mb-4 border border-[#1A1A1A]/5">
                <Icon size={32} />
            </div>
            <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">{title}</h3>
            <p className="text-sm text-[#1A1A1A]/60 max-w-xs mb-6 font-medium">{description}</p>
            {action}
        </div>
    );
};
