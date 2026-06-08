use anchor_lang::prelude::*;

#[error_code]
pub enum ValidaError {
    #[msg("Only admin can perform this action")]
    UnauthorizedAdmin,

    #[msg("Only the submitting auditor can perform this action")]
    UnauthorizedAuditor,

    #[msg("Submission status does not allow this action")]
    InvalidStatusTransition,

    #[msg("Bounty can only be released after proof is verified — status must be Verified")]
    BountyNotYetEligible,

    #[msg("Fix incentive can only be released after fix is validated — status must be FixVerified")]
    FixIncentiveNotYetEligible,

    #[msg("This nonce has already been used — replay attack detected")]
    NonceAlreadyUsed,

    #[msg("Commitment verification failed — details do not match original submission")]
    CommitmentMismatch,

    #[msg("Payment already released")]
    AlreadyPaid,

    #[msg("Stake already slashed")]
    AlreadySlashed,

    #[msg("Insufficient stake — must meet required_stake minimum")]
    InsufficientStake,

    #[msg("Fix incentive only applies when auditor was assigned the fix (8B path)")]
    NotAuditorLedFix,

    #[msg("Cannot slash — no stake remaining")]
    NothingToSlash,
}
