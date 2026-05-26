/**
 * Compares patch/device version strings for "is this patch newer than what the device runs".
 * Supports semver-like strings (1.0.9) and Windows-style KB build ids (VKB5030211, KB5030211).
 */

export function stripVersion(v: string) {
    return String(v || "")
        .trim()
        .replace(/^v/i, "");
}

/** e.g. "1.0.9" -> 1000009 (major*1e6 + minor*1e3 + patch), caps at reasonable range */
function semverCompactRank(v: string): number | null {
    const s = stripVersion(v);
    const m = s.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m) return null;
    const maj = parseInt(m[1], 10) || 0;
    const min = parseInt(m[2] ?? "0", 10) || 0;
    const pat = parseInt(m[3] ?? "0", 10) || 0;
    return maj * 1_000_000 + min * 1_000 + pat;
}

/** Windows update style: KB5030211, VKB5030211 */
function extractKbBuildId(v: string): number | null {
    const s = stripVersion(v);
    const kb = s.match(/(?:kb|vkb)\s*(\d{4,})/i);
    if (kb) return parseInt(kb[1], 10);
    const long = s.match(/\b(\d{7,})\b/);
    return long ? parseInt(long[1], 10) : null;
}

function segmentWiseNewer(candidate: string, current: string): boolean {
    const c = stripVersion(candidate);
    const b = stripVersion(current);
    if (!b) return Boolean(c);
    if (!c) return false;
    const p1 = c.split(/[.+_-]/).map((x) => parseInt(x, 10) || 0);
    const p2 = b.split(/[.+_-]/).map((x) => parseInt(x, 10) || 0);
    const len = Math.max(p1.length, p2.length);
    for (let i = 0; i < len; i++) {
        const x = p1[i] || 0;
        const y = p2[i] || 0;
        if (x > y) return true;
        if (x < y) return false;
    }
    return false;
}

/**
 * True if candidate version is strictly newer than current.
 * Falls back to KB id vs semver compact rank when segment parsing yields no ordering (e.g. VKB5030211 vs 1.0.9).
 */
export function isVersionNewer(candidate: string, current: string): boolean {
    const c = stripVersion(candidate);
    const b = stripVersion(current);
    if (!b) return Boolean(c);
    if (!c) return false;

    const seg = segmentWiseNewer(candidate, current);
    const p1 = c.split(/[.+_-]/).map((x) => parseInt(x, 10) || 0);
    const looksLikeGarbageCandidate =
        p1.length > 0 && p1.every((n) => n === 0) && /[a-z]/i.test(c);

    if (!looksLikeGarbageCandidate && segmentWiseNewer(candidate, current)) {
        return true;
    }

    const kbCand = extractKbBuildId(candidate);
    const kbCur = extractKbBuildId(current);
    const semCur = semverCompactRank(current);
    const semCand = semverCompactRank(candidate);

    if (kbCand != null && kbCur != null) {
        return kbCand > kbCur;
    }
    if (kbCand != null && semCur != null) {
        return kbCand > semCur;
    }
    if (semCand != null && kbCur != null) {
        return semCand > kbCur;
    }

    return seg;
}
