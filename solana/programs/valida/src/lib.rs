use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe");

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct ProgramInitialized {
    pub admin: Pubkey,
    pub required_stake: u64,
}

#[event]
pub struct PatchPublished {
    pub patch_id: u64,
    pub software_name: String,
    pub ipfs_cid: String,
    pub file_hash: [u8; 32],
}

#[event]
pub struct PatchVerified {
    pub patch_id: u64,
}

#[event]
pub struct VulnerabilitySubmitted {
    pub submission_id: u64,
    pub auditor: Pubkey,
    pub template_type: u8,
    pub severity: u8,
}

#[event]
pub struct SubmissionVerified {
    pub submission_id: u64,
}

#[event]
pub struct SubmissionRejected {
    pub submission_id: u64,
    pub stake_slashed: u64,
}

#[event]
pub struct BountyReleased {
    pub submission_id: u64,
    pub auditor: Pubkey,
    pub bounty_amount: u64,
}

#[event]
pub struct VulnerabilityRevealed {
    pub submission_id: u64,
    pub ipfs_cid: String,
}

#[event]
pub struct FraudDetected {
    pub submission_id: u64,
    pub auditor: Pubkey,
}

#[event]
pub struct ResolutionDecided {
    pub submission_id: u64,
    pub auditor_led: bool,
}

#[event]
pub struct FixCommitmentSubmitted {
    pub submission_id: u64,
}

#[event]
pub struct FixVerified {
    pub submission_id: u64,
}

#[event]
pub struct FixIncentiveReleased {
    pub submission_id: u64,
    pub auditor: Pubkey,
    pub fix_incentive_amount: u64,
}

#[event]
pub struct PatchPublishedForSubmission {
    pub submission_id: u64,
}

// ── Program ───────────────────────────────────────────────────────────────────

#[program]
pub mod valida {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, required_stake: u64) -> Result<()> {
        instructions::patch::initialize(ctx, required_stake)
    }

    pub fn publish_patch(
        ctx: Context<PublishPatch>,
        software_name: String,
        version: String,
        ipfs_cid: String,
        file_hash: [u8; 32],
    ) -> Result<()> {
        instructions::patch::publish_patch(ctx, software_name, version, ipfs_cid, file_hash)
    }

    pub fn verify_patch(ctx: Context<VerifyPatch>, patch_id: u64) -> Result<()> {
        instructions::patch::verify_patch(ctx, patch_id)
    }

    pub fn stake_and_submit(
        ctx: Context<StakeAndSubmit>,
        commitment: [u8; 32],
        template_type: u8,
        severity: u8,
        affected_software: String,
        affected_version: String,
        nonce: u64,
        system_code_hash: [u8; 32],
        stake_amount: u64,
    ) -> Result<()> {
        instructions::vulnerability::stake_and_submit(
            ctx,
            commitment,
            template_type,
            severity,
            affected_software,
            affected_version,
            nonce,
            system_code_hash,
            stake_amount,
        )
    }

    pub fn verify_submission(
        ctx: Context<VerifySubmission>,
        submission_id: u64,
    ) -> Result<()> {
        instructions::vulnerability::verify_submission(ctx, submission_id)
    }

    pub fn reject_submission(
        ctx: Context<RejectSubmission>,
        submission_id: u64,
    ) -> Result<()> {
        instructions::vulnerability::reject_submission(ctx, submission_id)
    }

    pub fn release_bounty(
        ctx: Context<ReleaseBounty>,
        submission_id: u64,
        bounty_amount: u64,
    ) -> Result<()> {
        instructions::vulnerability::release_bounty(ctx, submission_id, bounty_amount)
    }

    pub fn reveal_and_verify(
        ctx: Context<RevealAndVerify>,
        submission_id: u64,
        details: String,
        salt: [u8; 32],
        revealed_ipfs_cid: String,
    ) -> Result<()> {
        instructions::vulnerability::reveal_and_verify(
            ctx,
            submission_id,
            details,
            salt,
            revealed_ipfs_cid,
        )
    }

    pub fn decide_resolution(
        ctx: Context<DecideResolution>,
        submission_id: u64,
        auditor_led: bool,
    ) -> Result<()> {
        instructions::vulnerability::decide_resolution(ctx, submission_id, auditor_led)
    }

    pub fn submit_fix_commitment(
        ctx: Context<SubmitFixCommitment>,
        submission_id: u64,
        fix_commitment: [u8; 32],
    ) -> Result<()> {
        instructions::vulnerability::submit_fix_commitment(ctx, submission_id, fix_commitment)
    }

    pub fn verify_fix(ctx: Context<VerifyFix>, submission_id: u64) -> Result<()> {
        instructions::vulnerability::verify_fix(ctx, submission_id)
    }

    pub fn release_fix_incentive(
        ctx: Context<ReleaseFixIncentive>,
        submission_id: u64,
        fix_incentive_amount: u64,
    ) -> Result<()> {
        instructions::vulnerability::release_fix_incentive(
            ctx,
            submission_id,
            fix_incentive_amount,
        )
    }

    pub fn mark_published(
        ctx: Context<MarkPublished>,
        submission_id: u64,
    ) -> Result<()> {
        instructions::vulnerability::mark_published(ctx, submission_id)
    }
}
