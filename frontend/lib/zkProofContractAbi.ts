export const zkVerifierContractAbi = [
	{ "inputs": [{ "internalType": "address", "name": "_zenoVulnerability", "type": "address" }], "stateMutability": "nonpayable", "type": "constructor" },
	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "internalType": "uint256", "name": "submissionId", "type": "uint256" },
			{ "indexed": true, "internalType": "address", "name": "prover", "type": "address" },
			{ "indexed": false, "internalType": "uint8", "name": "templateType", "type": "uint8" }
		],
		"name": "ZKProofVerified",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "internalType": "uint8", "name": "templateId", "type": "uint8" },
			{ "indexed": false, "internalType": "address", "name": "verifierAddress", "type": "address" }
		],
		"name": "TemplateAdded",
		"type": "event"
	},
	{
		"inputs": [
			{ "internalType": "uint8", "name": "templateId", "type": "uint8" },
			{ "internalType": "address", "name": "verifierAddress", "type": "address" }
		],
		"name": "addTemplate",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{ "internalType": "uint256", "name": "submissionId", "type": "uint256" },
			{ "internalType": "uint256[2]", "name": "a", "type": "uint256[2]" },
			{ "internalType": "uint256[2][2]", "name": "b", "type": "uint256[2][2]" },
			{ "internalType": "uint256[2]", "name": "c", "type": "uint256[2]" },
			{ "internalType": "uint256[4]", "name": "publicSignals", "type": "uint256[4]" },
			{ "internalType": "uint8", "name": "templateType", "type": "uint8" }
		],
		"name": "submitZKProof",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "admin",
		"outputs": [{ "internalType": "address", "name": "", "type": "address" }],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "zenoVulnerability",
		"outputs": [{ "internalType": "address", "name": "", "type": "address" }],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
		"name": "templateVerifiers",
		"outputs": [{ "internalType": "address", "name": "", "type": "address" }],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{ "internalType": "uint256", "name": "submissionId", "type": "uint256" }],
		"name": "getZKProof",
		"outputs": [
			{
				"components": [
					{ "internalType": "uint256", "name": "submissionId", "type": "uint256" },
					{ "internalType": "address", "name": "prover", "type": "address" },
					{ "internalType": "uint256[2]", "name": "a", "type": "uint256[2]" },
					{ "internalType": "uint256[2][2]", "name": "b", "type": "uint256[2][2]" },
					{ "internalType": "uint256[2]", "name": "c", "type": "uint256[2]" },
					{ "internalType": "uint256[4]", "name": "publicSignals", "type": "uint256[4]" },
					{ "internalType": "bool", "name": "verified", "type": "bool" },
					{ "internalType": "uint8", "name": "templateType", "type": "uint8" },
					{ "internalType": "uint256", "name": "verifiedAt", "type": "uint256" }
				],
				"internalType": "struct ZenoZKVerifier.ZKProofSubmission",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
] as const;

export function getZKVerifierAddress(): string {
	const address = process.env.NEXT_PUBLIC_ZK_VERIFIER_ADDRESS;
	if (!address) throw new Error("NEXT_PUBLIC_ZK_VERIFIER_ADDRESS is not configured");
	return address;
}

export type ZKProof = {
	submissionId: number;
	prover: string;
	a: [bigint, bigint];
	b: [[bigint, bigint], [bigint, bigint]];
	c: [bigint, bigint];
	publicSignals: [bigint, bigint, bigint, bigint];
	verified: boolean;
	templateType: number;
	verifiedAt: number;
};

// Template config — add new circuits here without changing core logic
export const ZK_TEMPLATES = {
	1: {
		name: "Authentication Bypass",
		circuitWasm: "/circuits/AuthBypass_js/AuthBypass.wasm",
		circuitZkey: "/circuits/AuthBypass_final.zkey",
		privateInputs: ["exploitInput", "salt"] as const,
		publicInputs: ["functionSelector", "expectedAuthState", "systemCodeHash", "commitmentHash"] as const,
		description: "Proves you can bypass authentication without revealing the exploit value",
	},
	// Future templates:
	// 2: { name: "Hash Mismatch", ... },
	// 3: { name: "Privilege Escalation", ... },
	// 4: { name: "Replay Attack", ... },
	// 5: { name: "Logic Error", ... },
} as const;
