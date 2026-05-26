import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const Card = ({
    children,
    className,
    title,
    subtitle,
    headerAction,
}: {
    children: React.ReactNode;
    className?: string;
    title?: string;
    subtitle?: string;
    headerAction?: React.ReactNode;
}) => {
    return (
        <div className={cn("glass-dark rounded-xl overflow-hidden shadow-2xl transition-all duration-300 hover:shadow-emerald-500/5", className)}>
            {(title || subtitle || headerAction) && (
                <div className="px-6 py-4 border-b border-[#1A1A1A]/5 flex items-center justify-between">
                    <div>
                        {title && <h3 className="text-lg font-semibold text-[#1A1A1A]/90">{title}</h3>}
                        {subtitle && <p className="text-sm text-[#1A1A1A]/70 mt-1">{subtitle}</p>}
                    </div>
                    {headerAction && <div>{headerAction}</div>}
                </div>
            )}
            <div className="p-6">{children}</div>
        </div>
    );
};

export const StatCard = ({
    icon: Icon,
    label,
    value,
    trend,
    trendType = "neutral",
    className,
}: {
    icon: any;
    label: string;
    value: string | number;
    trend?: string;
    trendType?: "up" | "down" | "neutral";
    className?: string;
}) => {
    return (
        <div className={cn("glass p-5 rounded-xl border border-[#1A1A1A]/5 relative overflow-hidden group hover:border-[#1A1A1A]/20 transition-all duration-300", className)}>
            <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-lg bg-[#A9FD5F] text-[#1A1A1A] group-hover:scale-110 transition-transform duration-300">
                    <Icon size={20} />
                </div>
                {trend && (
                    <div className={cn(
                        "text-xs font-bold flex items-center gap-1",
                        trendType === "up" ? "text-[#1A1A1A]" : trendType === "down" ? "text-rose-500" : "text-[#1A1A1A]/70"
                    )}>
                        {trend}
                    </div>
                )}
            </div>
            <div className="mt-4">
                <p className="text-xs font-medium text-[#1A1A1A]/70 uppercase tracking-wider">{label}</p>
                <h4 className="text-2xl font-bold text-[#1A1A1A] mt-1">{value}</h4>
            </div>
            {/* Subtle background glow */}
            <div className="absolute -bottom-6 -right-6 w-16 h-16 bg-[#A9FD5F]/30 blur-2xl rounded-full transition-all duration-500 group-hover:bg-[#A9FD5F]" />
        </div>
    );
};
