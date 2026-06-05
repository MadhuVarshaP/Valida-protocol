export const escrowContractAbi = [
	{ "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },
	{
		"inputs": [
			{ "internalType": "address", "name": "_zenoVulnerabilityContract", "type": "address" },
			{ "internalType": "uint256", "name": "_requiredStake", "type": "uint256" }
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "submissionId", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "BountyAmountSet", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "submissionId", "type": "uint256" }, { "indexed": true, "internalType": "address", "name": "auditor", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "BountyReleased", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "by", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "BountyPoolFunded", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "submissionId", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "FixIncentiveAmountSet", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "submissionId", "type": "uint256" }, { "indexed": true, "internalType": "address", "name": "auditor", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "FixIncentiveReleased", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "submissionId", "type": "uint256" }], "name": "FixIncentiveSkipped", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "submissionId", "type": "uint256" }, { "indexed": true, "internalType": "address", "name": "auditor", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "Slashed", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "submissionId", "type": "uint256" }, { "indexed": true, "internalType": "address", "name": "auditor", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "Staked", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": false, "internalType": "uint256", "name": "newStake", "type": "uint256" }], "name": "RequiredStakeUpdated", "type": "event" },
	{
		"inputs": [{ "internalType": "uint256", "name": "submissionId", "type": "uint256" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }],
		"name": "setBountyAmount",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{ "internalType": "uint256", "name": "submissionId", "type": "uint256" }],
		"name": "releaseBounty",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{ "internalType": "uint256", "name": "submissionId", "type": "uint256" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }],
		"name": "setFixIncentiveAmount",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{ "internalType": "uint256", "name": "submissionId", "type": "uint256" }],
		"name": "releaseFixIncentive",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{ "internalType": "uint256", "name": "submissionId", "type": "uint256" }],
		"name": "skipFixIncentive",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{ "internalType": "uint256", "name": "submissionId", "type": "uint256" }],
		"name": "slash",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "fundBountyPool",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [{ "internalType": "uint256", "name": "submissionId", "type": "uint256" }],
		"name": "stake",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [{ "internalType": "uint256", "name": "newStake", "type": "uint256" }],
		"name": "setRequiredStake",
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
		"name": "bountyPool",
		"outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "contractBalance",
		"outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "requiredStake",
		"outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "zenoVulnerabilityContract",
		"outputs": [{ "internalType": "address", "name": "", "type": "address" }],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{ "internalType": "uint256", "name": "submissionId", "type": "uint256" }],
		"name": "getEscrowRecord",
		"outputs": [
			{
				"components": [
					{ "internalType": "address", "name": "auditor", "type": "address" },
					{ "internalType": "uint256", "name": "submissionId", "type": "uint256" },
					{ "internalType": "uint256", "name": "stakedAmount", "type": "uint256" },
					{ "internalType": "uint256", "name": "bountyAmount", "type": "uint256" },
					{ "internalType": "uint256", "name": "fixIncentiveAmount", "type": "uint256" },
					{ "internalType": "bool", "name": "stakeReturned", "type": "bool" },
					{ "internalType": "bool", "name": "bountyReleased", "type": "bool" },
					{ "internalType": "bool", "name": "fixIncentiveReleased", "type": "bool" },
					{ "internalType": "bool", "name": "slashed", "type": "bool" },
					{ "internalType": "bool", "name": "fixIncentiveSkipped", "type": "bool" }
				],
				"internalType": "struct ZenoEscrow.EscrowRecord",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
] as const;

export function getEscrowContractAddress(): string {
	const address = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS;
	if (!address) throw new Error("NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS is not configured");
	return address;
}

export type EscrowRecord = {
	auditor: string;
	submissionId: number;
	stakedAmount: bigint;
	bountyAmount: bigint;
	fixIncentiveAmount: bigint;
	stakeReturned: boolean;
	bountyReleased: boolean;
	fixIncentiveReleased: boolean;
	slashed: boolean;
	fixIncentiveSkipped: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseEscrowRecord(raw: any): EscrowRecord {
	return {
		auditor: raw.auditor as string,
		submissionId: Number(raw.submissionId),
		stakedAmount: BigInt(raw.stakedAmount),
		bountyAmount: BigInt(raw.bountyAmount),
		fixIncentiveAmount: BigInt(raw.fixIncentiveAmount),
		stakeReturned: raw.stakeReturned as boolean,
		bountyReleased: raw.bountyReleased as boolean,
		fixIncentiveReleased: raw.fixIncentiveReleased as boolean,
		slashed: raw.slashed as boolean,
		fixIncentiveSkipped: raw.fixIncentiveSkipped as boolean,
	};
}
