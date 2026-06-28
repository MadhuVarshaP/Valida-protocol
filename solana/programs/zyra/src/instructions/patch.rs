use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ZyraError;

// ── initialize ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = signer,
        space = ProgramConfig::SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, ProgramConfig>,

    #[account(mut)]
    pub signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>, required_stake: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.signer.key();
    config.required_stake = required_stake;
    config.submission_count = 0;
    config.patch_count = 0;
    config.bump = ctx.bumps.config;

    emit!(crate::ProgramInitialized {
        admin: config.admin,
        required_stake,
    });

    Ok(())
}

// ── publish_patch ─────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct PublishPatch<'info> {
    #[account(
        init,
        payer = admin,
        space = PatchRecord::SPACE,
        seeds = [b"patch", config.patch_count.to_le_bytes().as_ref()],
        bump
    )]
    pub patch: Account<'info, PatchRecord>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ ZyraError::UnauthorizedAdmin,
    )]
    pub config: Account<'info, ProgramConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn publish_patch(
    ctx: Context<PublishPatch>,
    software_name: String,
    version: String,
    ipfs_cid: String,
    file_hash: [u8; 32],
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let patch_id = config.patch_count;

    let patch = &mut ctx.accounts.patch;
    patch.authority = ctx.accounts.admin.key();
    patch.software_name = software_name.clone();
    patch.version = version;
    patch.ipfs_cid = ipfs_cid.clone();
    patch.file_hash = file_hash;
    patch.is_verified = false;
    patch.published_at = Clock::get()?.unix_timestamp;
    patch.bump = ctx.bumps.patch;

    config.patch_count += 1;

    emit!(crate::PatchPublished {
        patch_id,
        software_name,
        ipfs_cid,
        file_hash,
    });

    Ok(())
}

// ── verify_patch ──────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(patch_id: u64)]
pub struct VerifyPatch<'info> {
    #[account(
        mut,
        seeds = [b"patch", patch_id.to_le_bytes().as_ref()],
        bump = patch.bump,
    )]
    pub patch: Account<'info, PatchRecord>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ ZyraError::UnauthorizedAdmin,
    )]
    pub config: Account<'info, ProgramConfig>,

    pub admin: Signer<'info>,
}

pub fn verify_patch(ctx: Context<VerifyPatch>, patch_id: u64) -> Result<()> {
    ctx.accounts.patch.is_verified = true;

    emit!(crate::PatchVerified { patch_id });

    Ok(())
}
