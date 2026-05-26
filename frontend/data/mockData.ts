export const ADMIN_ADDRESS = "0x8932Cc72386762C92a95c34538C40Ef850D5C921";

export const PUBLISHER_LIST = [
    "0x3565A849c7D2078693246294D0A410D31969B086",
    "0xD494917B805BB2677610AF891B012F3D963F01C3",
    "0xE8F5B10D348E72D7048737F9611D6142340798C2",
];

export const DEVICE_LIST = [
    "0x9A2C18D1F74328F667610AD8A3B12384617B01C5",
    "0x89C23C2D2B0F33A184F9B611D6C5A2C3E0D101A6",
    "0x7B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3B",
    "0x6B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3C",
    "0x5B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3D",
    "0x4B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3E",
];

export const PATCHES = [
    {
        id: 1,
        software: "Windows",
        version: "KB501",
        publisher: "0x3565A849c7D2078693246294D0A410D31969B086",
        active: true,
        releaseDate: "2026-01-10",
        installCount: 18,
        successRate: 92,
        fileHash: "QmXoypizjUMmEc2D22m5BAbC...1234",
        ipfsHash: "ipfs://QmXoypizj...",
    },
    {
        id: 2,
        software: "Visual Studio Code",
        version: "1.85.2",
        publisher: "0xD494917B805BB2677610AF891B012F3D963F01C3",
        active: true,
        releaseDate: "2026-02-05",
        installCount: 142,
        successRate: 98,
        fileHash: "QvYxpizjUMmEc2D22m5BAbC...5678",
        ipfsHash: "ipfs://QvYxpizj...",
    },
    {
        id: 3,
        software: "Adobe Acrobat",
        version: "v2024.11",
        publisher: "0xE8F5B10D348E72D7048737F9611D6142340798C2",
        active: true,
        releaseDate: "2026-02-12",
        installCount: 56,
        successRate: 85,
        fileHash: "QwZxpizjUMmEc2D22m5BAbC...9012",
        ipfsHash: "ipfs://QwZxpizj...",
    },
    {
        id: 4,
        software: "Google Chrome",
        version: "125.0.1",
        publisher: "0x3565A849c7D2078693246294D0A410D31969B086",
        active: false,
        releaseDate: "2026-02-18",
        installCount: 231,
        successRate: 99,
        fileHash: "QrAxpizjUMmEc2D22m5BAbC...3456",
        ipfsHash: "ipfs://QrAxpizj...",
    },
    {
        id: 5,
        software: "Node.js",
        version: "20.10.0",
        publisher: "0xD494917B805BB2677610AF891B012F3D963F01C3",
        active: true,
        releaseDate: "2026-03-01",
        installCount: 12,
        successRate: 100,
        fileHash: "QtBxpizjUMmEc2D22m5BAbC...7890",
        ipfsHash: "ipfs://QtBxpizj...",
    },
];

export const DEVICES = [
    {
        address: "0x9A2C18D1F74328F667610AD8A3B12384617B01C5",
        status: "registered",
        lastInstallation: "2026-02-01",
        compliance: 85,
        installedPatchesCount: 4,
    },
    {
        address: "0x89C23C2D2B0F33A184F9B611D6C5A2C3E0D101A6",
        status: "registered",
        lastInstallation: "2026-02-03",
        compliance: 100,
        installedPatchesCount: 5,
    },
    {
        address: "0x7B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3B",
        status: "revoked",
        lastInstallation: "2026-01-15",
        compliance: 40,
        installedPatchesCount: 2,
    },
    {
        address: "0x6B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3C",
        status: "registered",
        lastInstallation: "2026-02-10",
        compliance: 92,
        installedPatchesCount: 5,
    },
    {
        address: "0x5B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3D",
        status: "registered",
        lastInstallation: "2026-02-15",
        compliance: 75,
        installedPatchesCount: 3,
    },
    {
        address: "0x4B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3E",
        status: "registered",
        lastInstallation: "2026-03-01",
        compliance: 100,
        installedPatchesCount: 5,
    },
];

export const INSTALL_LOGS = [
    {
        device: "0x9A2C18D1F74328F667610AD8A3B12384617B01C5",
        patchId: 1,
        status: "success",
        timestamp: "2026-02-03 14:23",
    },
    {
        device: "0x89C23C2D2B0F33A184F9B611D6C5A2C3E0D101A6",
        patchId: 2,
        status: "success",
        timestamp: "2026-02-05 09:12",
    },
    {
        device: "0x7B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3B",
        patchId: 3,
        status: "failed",
        timestamp: "2026-02-12 11:45",
    },
    {
        device: "0x6B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3C",
        patchId: 4,
        status: "success",
        timestamp: "2026-02-18 16:30",
    },
    {
        device: "0x5B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3D",
        patchId: 5,
        status: "success",
        timestamp: "2026-03-01 10:15",
    },
    // Adding more entries to make it richer
    {
        device: "0x4B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3E",
        patchId: 1,
        status: "success",
        timestamp: "2026-01-12 08:23",
    },
    {
        device: "0x9A2C18D1F74328F667610AD8A3B12384617B01C5",
        patchId: 2,
        status: "success",
        timestamp: "2026-02-08 13:42",
    },
    {
        device: "0x89C23C2D2B0F33A184F9B611D6C5A2C3E0D101A6",
        patchId: 1,
        status: "success",
        timestamp: "2026-01-15 15:20",
    },
    {
        device: "0x7B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3B",
        patchId: 2,
        status: "failed",
        timestamp: "2026-02-20 17:55",
    },
    {
        device: "0x6B1F3C4D2E5F1A1B2C3D4E5F6A7B8C9D0E1F2A3C",
        patchId: 1,
        status: "success",
        timestamp: "2026-01-18 12:10",
    },
];
