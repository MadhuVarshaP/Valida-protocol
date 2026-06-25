"use client";

import React from "react";
import { Check } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STEP_LABELS = [
  "Identify vulnerability",
  "Generate ZK proof",
  "Submit proof",
  "Team verifies",
  "Bounty paid (Incentive #1)",
  "Vulnerability revealed",
  "Resolution decided",
  "Fix developed",
  "Fix verified + incentive #2",
  "Patch published",
  "Devices verify & install",
  "Lifecycle recorded",
] as const;

export const LIFECYCLE_STEP_COUNT = STEP_LABELS.length;

/**
 * Horizontal 12-step lifecycle stepper used across every page in the
 * vulnerability → fix → publish flow so the current position is always
 * visible. `currentStep` is 1-indexed.
 */
export function LifecycleTimeline({
  currentStep,
  auditorLed,
  compact = false,
  className,
}: {
  currentStep: number;
  auditorLed?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const labels = STEP_LABELS.map((label, i) => {
    if (i !== 7) return label;
    if (auditorLed === true) return "8B: Auditor ZK proof";
    if (auditorLed === false) return "8A: Internal fix";
    return label;
  });

  return (
    <div className={cn("w-full overflow-x-auto", compact ? "py-1" : "py-3", className)}>
      <div className="flex items-start min-w-max">
        {labels.map((label, i) => {
          const step = i + 1;
          const done = step < currentStep;
          const isCurrent = step === currentStep;
          return (
            <React.Fragment key={step}>
              <div
                className="flex flex-col items-center gap-1.5 shrink-0"
                style={{ width: compact ? 60 : 80 }}
              >
                <div
                  className={cn(
                    "rounded-full flex items-center justify-center font-bold shrink-0 border-2 transition-all",
                    compact ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs",
                    done && "bg-[#A9FD5F] border-[#A9FD5F] text-[#1A1A1A]",
                    isCurrent &&
                      "bg-purple-600 border-purple-600 text-white ring-4 ring-purple-200 animate-pulse",
                    !done && !isCurrent && "bg-white border-[#1A1A1A]/15 text-[#1A1A1A]/30"
                  )}
                >
                  {done ? <Check size={compact ? 12 : 14} /> : step}
                </div>
                <span
                  className={cn(
                    "text-center leading-tight",
                    compact ? "text-[8px]" : "text-[9px]",
                    isCurrent ? "font-bold text-[#1A1A1A]" : "text-[#1A1A1A]/40 font-medium"
                  )}
                >
                  {label}
                </span>
              </div>
              {step < labels.length && (
                <div
                  className={cn(
                    "h-0.5 shrink-0 mt-3",
                    compact ? "w-2" : "w-4",
                    step < currentStep ? "bg-[#A9FD5F]" : "bg-[#1A1A1A]/10"
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
