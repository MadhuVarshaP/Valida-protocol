use anchor_lang::prelude::*;

// ── ProgramConfig ─────────────────────────────────────────────────────────────
// Seeds: [b"config"]
// Space: 8 (discriminator) + 32 + 8 + 8 + 8 + 1 = 65
#[account]
pub struct ProgramConfig {
    pub admin: Pubkey,          // 32
    pub required_stake: u64,    //  8  — minimum lamports an auditor must stake
    pub submission_count: u64,  //  8  — global counter, incremented per submission
    pub patch_count: u64,       //  8  — global counter, incremented per patch
    pub bump: u8,               //  1
}

impl ProgramConfig {
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 8 + 1; // 65
}

// ── PatchRecord ───────────────────────────────────────────────────────────────
// Seeds: [b"patch", patch_id.to_le_bytes()]
// Space: 8 + 32 + (4+64) + (4+32) + (4+128) + 32 + 1 + 8 + 1 = 318
#[account]
pub struct PatchRecord {
    pub authority: Pubkey,      // 32
    pub software_name: String,  //  4 + 64 = 68   (max 64 chars)
    pub version: String,        //  4 + 32 = 36   (max 32 chars)
    pub ipfs_cid: String,       //  4 + 128 = 132 (max 128 chars)
    pub file_hash: [u8; 32],    // 32
    pub is_verified: bool,      //  1
    pub published_at: i64,      //  8
    pub bump: u8,               //  1
}

impl PatchRecord {
    pub const MAX_SOFTWARE_NAME: usize = 64;
    pub const MAX_VERSION: usize = 32;
    pub const MAX_IPFS_CID: usize = 128;
    pub const SPACE: usize = 8 + 32 + (4 + 64) + (4 + 32) + (4 + 128) + 32 + 1 + 8 + 1; // 318
}

// ── VulnerabilitySubmission ───────────────────────────────────────────────────
// Seeds: [b"vuln", submission_id.to_le_bytes()]
// Space: 8
//      + 8   submission_id
//      + 32  auditor
//      + 32  commitment
//      + 1   template_type
//      + 1   severity
//      + 68  affected_software (4+64)
//      + 36  affected_version  (4+32)
//      + 1   status
//      + 1   bounty_paid
//      + 1   fix_incentive_paid
//      + 8   nonce
//      + 32  system_code_hash
//      + 1   auditor_led
//      + 32  fix_commitment
//      + 1   commitment_verified
//      + 1   fraud_detected
//      + 132 revealed_ipfs_cid (4+128)
//      + 8   submitted_at
//      + 1   bump
//      = 405
#[account]
pub struct VulnerabilitySubmission {
    pub submission_id: u64,          //   8
    pub auditor: Pubkey,             //  32
    pub commitment: [u8; 32],        //  32  keccak256(details + salt) — details stay private
    pub template_type: u8,           //   1  1=AuthBypass 2=HashMismatch 3=PrivilegeEscalation 4=ReplayAttack 5=LogicError
    pub severity: u8,                //   1  1=Critical 2=High 3=Medium
    pub affected_software: String,   //  68  max 64
    pub affected_version: String,    //  36  max 32
    /// 0=Pending 1=Verified 2=Rejected 3=Revealed 4=FixInProgress 5=FixVerified 6=Published
    pub status: u8,                  //   1
    /// INCENTIVE #1 — paid for finding the bug (Step 5 only)
    pub bounty_paid: bool,           //   1
    /// INCENTIVE #2 — paid for fixing the bug (Step 9 only)
    pub fix_incentive_paid: bool,    //   1
    pub nonce: u64,                  //   8  unique per submission, prevents replay
    pub system_code_hash: [u8; 32],  //  32  fingerprint of target system
    /// true = 8B (auditor fixes), false = 8A (team fixes internally)
    pub auditor_led: bool,           //   1
    pub fix_commitment: [u8; 32],    //  32  commitment to fix details (8B path)
    pub commitment_verified: bool,   //   1
    pub fraud_detected: bool,        //   1
    /// filled at Step 6 (reveal_and_verify)
    pub revealed_ipfs_cid: String,   // 132  max 128
    pub submitted_at: i64,           //   8
    pub bump: u8,                    //   1
}

impl VulnerabilitySubmission {
    pub const MAX_AFFECTED_SOFTWARE: usize = 64;
    pub const MAX_AFFECTED_VERSION: usize = 32;
    pub const MAX_IPFS_CID: usize = 128;
    pub const SPACE: usize = 8
        + 8 + 32 + 32 + 1 + 1
        + (4 + 64) + (4 + 32)
        + 1 + 1 + 1 + 8 + 32 + 1 + 32 + 1 + 1
        + (4 + 128) + 8 + 1; // 405
}

// ── EscrowAccount ─────────────────────────────────────────────────────────────
// Seeds: [b"escrow", submission_id.to_le_bytes()]
// Space: 8 + 8 + 32 + 8 + 8 + 8 + 1 + 1 + 1 + 1 + 1 = 77
#[account]
pub struct EscrowAccount {
    pub submission_id: u64,            //  8
    pub auditor: Pubkey,               // 32
    pub staked_amount: u64,            //  8
    pub bounty_amount: u64,            //  8
    pub fix_incentive_amount: u64,     //  8
    pub stake_returned: bool,          //  1
    /// INCENTIVE #1
    pub bounty_released: bool,         //  1
    /// INCENTIVE #2
    pub fix_incentive_released: bool,  //  1
    pub slashed: bool,                 //  1
    pub bump: u8,                      //  1
}

impl EscrowAccount {
    pub const SPACE: usize = 8 + 8 + 32 + 8 + 8 + 8 + 1 + 1 + 1 + 1 + 1; // 77
}

// ── UsedNonce ─────────────────────────────────────────────────────────────────
// Seeds: [b"nonce", nonce.to_le_bytes()]
// Space: 8 + 8 + 1 + 1 = 18
// Purpose: prevents replay attacks — created on first use;
//          attempting to init again will fail (account already exists)
#[account]
pub struct UsedNonce {
    pub nonce: u64,  //  8
    pub used: bool,  //  1
    pub bump: u8,    //  1
}

impl UsedNonce {
    pub const SPACE: usize = 8 + 8 + 1 + 1; // 18
}
