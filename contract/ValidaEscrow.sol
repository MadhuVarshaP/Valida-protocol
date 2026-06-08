// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IValidaVulnerabilityEscrow {
    // Slim 3-value getter used by escrow — avoids stack-too-deep from the 13-value getSubmission()
    function getSubmissionStatus(uint256 submissionId) external view returns (
        uint8 status, bool bountyPaid, bool fixIncentivePaid
    );
    function markBountyPaid(uint256 submissionId) external;
    function markFixIncentivePaid(uint256 submissionId) external;
}

/**
 * @title ValidaEscrow
 * @notice Manages staking and incentive payments for the Valida vulnerability platform.
 *         Incentive #1 (bounty) is only releasable when ValidaVulnerability status = Verified (1).
 *         Incentive #2 (fix)   is only releasable when ValidaVulnerability status = FixVerified (5).
 *         These are hard contract rules enforced by require() — no override is possible.
 */
contract ValidaEscrow {

    /* ------------------------------------------------------------ */
    /* REENTRANCY GUARD                                             */
    /* ------------------------------------------------------------ */

    uint256 private _locked;
    modifier nonReentrant() {
        require(_locked == 0, "Reentrant call");
        _locked = 1;
        _;
        _locked = 0;
    }

    /* ------------------------------------------------------------ */
    /* STATE                                                        */
    /* ------------------------------------------------------------ */

    address public admin;
    address public validaVulnerabilityContract;
    uint256 public requiredStake;
    uint256 public bountyPool;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    /* ------------------------------------------------------------ */
    /* DATA STRUCTURES                                              */
    /* ------------------------------------------------------------ */

    struct EscrowRecord {
        address auditor;
        uint256 submissionId;
        uint256 stakedAmount;
        uint256 bountyAmount;           // set by admin after Verified
        uint256 fixIncentiveAmount;     // set by admin after FixInProgress decision
        bool stakeReturned;
        bool bountyReleased;            // Incentive #1
        bool fixIncentiveReleased;      // Incentive #2
        bool slashed;
        bool fixIncentiveSkipped;       // true for 8A (internal fix) path
    }

    mapping(uint256 => EscrowRecord) public escrowRecords;

    /* ------------------------------------------------------------ */
    /* EVENTS                                                       */
    /* ------------------------------------------------------------ */

    event Staked(uint256 indexed submissionId, address indexed auditor, uint256 amount);
    event BountyReleased(uint256 indexed submissionId, address indexed auditor, uint256 amount);
    event FixIncentiveReleased(uint256 indexed submissionId, address indexed auditor, uint256 amount);
    event Slashed(uint256 indexed submissionId, address indexed auditor, uint256 amount);
    event BountyPoolFunded(address indexed by, uint256 amount);
    event RequiredStakeUpdated(uint256 newStake);
    event FixIncentiveSkipped(uint256 indexed submissionId);
    event BountyAmountSet(uint256 indexed submissionId, uint256 amount);
    event FixIncentiveAmountSet(uint256 indexed submissionId, uint256 amount);

    /* ------------------------------------------------------------ */
    /* CONSTRUCTOR                                                  */
    /* ------------------------------------------------------------ */

    constructor(address _validaVulnerabilityContract, uint256 _requiredStake) {
        admin = msg.sender;
        validaVulnerabilityContract = _validaVulnerabilityContract;
        requiredStake = _requiredStake;
    }

    /* ------------------------------------------------------------ */
    /* ADMIN CONFIG                                                 */
    /* ------------------------------------------------------------ */

    function setRequiredStake(uint256 newStake) external onlyAdmin {
        requiredStake = newStake;
        emit RequiredStakeUpdated(newStake);
    }

    /* ------------------------------------------------------------ */
    /* STAKING                                                      */
    /* ------------------------------------------------------------ */

    /**
     * @notice Auditor stakes ETH before/with vulnerability submission.
     *         Call this before submitVulnerability() on ValidaVulnerability.
     *         Use current submissionCount + 1 as the expected submissionId.
     */
    function stake(uint256 submissionId) external payable {
        require(msg.value >= requiredStake, "Insufficient stake amount");
        require(escrowRecords[submissionId].auditor == address(0), "Already staked for this submission");

        escrowRecords[submissionId] = EscrowRecord({
            auditor: msg.sender,
            submissionId: submissionId,
            stakedAmount: msg.value,
            bountyAmount: 0,
            fixIncentiveAmount: 0,
            stakeReturned: false,
            bountyReleased: false,
            fixIncentiveReleased: false,
            slashed: false,
            fixIncentiveSkipped: false
        });

        emit Staked(submissionId, msg.sender, msg.value);
    }

    /* ------------------------------------------------------------ */
    /* ADMIN: BOUNTY (INCENTIVE #1)                                 */
    /* ------------------------------------------------------------ */

    function setBountyAmount(uint256 submissionId, uint256 amount) external onlyAdmin {
        IValidaVulnerabilityEscrow vuln = IValidaVulnerabilityEscrow(validaVulnerabilityContract);
        (uint8 status, , ) = vuln.getSubmissionStatus(submissionId);
        require(status == 1, "Submission must be Verified");
        require(escrowRecords[submissionId].auditor != address(0), "No escrow record");
        escrowRecords[submissionId].bountyAmount = amount;
        emit BountyAmountSet(submissionId, amount);
    }

    /**
     * @notice INCENTIVE #1 - releases bounty + returns stake to auditor.
     *         HARD RULE: status must equal Verified (1). No override.
     */
    function releaseBounty(uint256 submissionId) external onlyAdmin nonReentrant {
        IValidaVulnerabilityEscrow vuln = IValidaVulnerabilityEscrow(validaVulnerabilityContract);
        (uint8 status, bool bountyPaid, ) = vuln.getSubmissionStatus(submissionId);

        // HARD RULE enforced by require - cannot be bypassed
        require(status == 1, "Submission must be Verified - cannot release bounty at any other stage");
        require(!bountyPaid, "Bounty already paid on vulnerability contract");

        EscrowRecord storage record = escrowRecords[submissionId];
        require(record.auditor != address(0), "No escrow record");
        require(!record.bountyReleased, "Bounty already released");
        require(!record.slashed, "Submission was slashed");
        require(bountyPool >= record.bountyAmount, "Insufficient bounty pool");

        address auditor = record.auditor;
        uint256 bounty = record.bountyAmount;
        uint256 stakeAmt = record.stakedAmount;

        bountyPool -= bounty;
        record.bountyReleased = true;
        record.stakeReturned = true;

        // Mark on vulnerability contract BEFORE transfer (checks-effects-interactions)
        vuln.markBountyPaid(submissionId);

        // Return bounty + stake to auditor using .call (not .transfer)
        (bool ok, ) = auditor.call{value: bounty + stakeAmt}("");
        require(ok, "ETH transfer failed");

        emit BountyReleased(submissionId, auditor, bounty);
    }

    /* ------------------------------------------------------------ */
    /* ADMIN: FIX INCENTIVE (INCENTIVE #2)                          */
    /* ------------------------------------------------------------ */

    function setFixIncentiveAmount(uint256 submissionId, uint256 amount) external onlyAdmin {
        IValidaVulnerabilityEscrow vuln = IValidaVulnerabilityEscrow(validaVulnerabilityContract);
        (uint8 status, , ) = vuln.getSubmissionStatus(submissionId);
        require(status == 4, "Submission must be FixInProgress");
        require(escrowRecords[submissionId].auditor != address(0), "No escrow record");
        escrowRecords[submissionId].fixIncentiveAmount = amount;
        emit FixIncentiveAmountSet(submissionId, amount);
    }

    /**
     * @notice INCENTIVE #2 - releases fix incentive to auditor.
     *         HARD RULE: status must equal FixVerified (5). No override.
     */
    function releaseFixIncentive(uint256 submissionId) external onlyAdmin nonReentrant {
        IValidaVulnerabilityEscrow vuln = IValidaVulnerabilityEscrow(validaVulnerabilityContract);
        (uint8 status, , bool fixIncentivePaid) = vuln.getSubmissionStatus(submissionId);

        // HARD RULE enforced by require - cannot be bypassed
        require(status == 5, "Submission must be FixVerified - cannot release incentive at any other stage");
        require(!fixIncentivePaid, "Fix incentive already paid on vulnerability contract");

        EscrowRecord storage record = escrowRecords[submissionId];
        require(record.auditor != address(0), "No escrow record");
        require(!record.fixIncentiveReleased, "Fix incentive already released");
        require(!record.fixIncentiveSkipped, "Fix incentive was skipped (internal fix path)");
        require(!record.slashed, "Submission was slashed");
        require(bountyPool >= record.fixIncentiveAmount, "Insufficient bounty pool");

        address auditor = record.auditor;
        uint256 incentive = record.fixIncentiveAmount;

        bountyPool -= incentive;
        record.fixIncentiveReleased = true;

        vuln.markFixIncentivePaid(submissionId);

        (bool ok, ) = auditor.call{value: incentive}("");
        require(ok, "ETH transfer failed");

        emit FixIncentiveReleased(submissionId, auditor, incentive);
    }

    /**
     * @notice Admin calls this for the 8A (internal fix) path - no auditor incentive applies.
     */
    function skipFixIncentive(uint256 submissionId) external onlyAdmin {
        require(escrowRecords[submissionId].auditor != address(0), "No escrow record");
        require(!escrowRecords[submissionId].fixIncentiveReleased, "Already released");
        require(!escrowRecords[submissionId].fixIncentiveSkipped, "Already skipped");
        escrowRecords[submissionId].fixIncentiveSkipped = true;
        emit FixIncentiveSkipped(submissionId);
    }

    /* ------------------------------------------------------------ */
    /* ADMIN: SLASH (REJECTED SUBMISSIONS)                          */
    /* ------------------------------------------------------------ */

    /**
     * @notice Slashes stake for rejected submissions (status = Rejected).
     */
    function slash(uint256 submissionId) external onlyAdmin nonReentrant {
        IValidaVulnerabilityEscrow vuln = IValidaVulnerabilityEscrow(validaVulnerabilityContract);
        (uint8 status, , ) = vuln.getSubmissionStatus(submissionId);
        require(status == 2, "Submission must be Rejected");

        EscrowRecord storage record = escrowRecords[submissionId];
        require(record.auditor != address(0), "No escrow record");
        require(!record.slashed, "Already slashed");

        address auditor = record.auditor;
        uint256 amount = record.stakedAmount;
        record.slashed = true;
        bountyPool += amount;

        emit Slashed(submissionId, auditor, amount);
    }

    /**
     * @notice Auto-slash triggered by ValidaVulnerability when fraud is detected (Phase 3).
     *         Does not require a specific status - callable only by the linked vuln contract.
     */
    function fraudSlash(uint256 submissionId) external nonReentrant {
        require(msg.sender == validaVulnerabilityContract, "Only ValidaVulnerability can call fraudSlash");

        EscrowRecord storage record = escrowRecords[submissionId];
        if (record.auditor == address(0) || record.slashed) return; // no record or already slashed

        address auditor = record.auditor;
        uint256 amount = record.stakedAmount;
        record.slashed = true;
        bountyPool += amount;

        emit Slashed(submissionId, auditor, amount);
    }

    /* ------------------------------------------------------------ */
    /* FUNDING                                                      */
    /* ------------------------------------------------------------ */

    /**
     * @notice Admin deposits ETH to fund the bounty pool for future payouts.
     */
    function fundBountyPool() external payable onlyAdmin {
        bountyPool += msg.value;
        emit BountyPoolFunded(msg.sender, msg.value);
    }

    /* ------------------------------------------------------------ */
    /* VIEW                                                         */
    /* ------------------------------------------------------------ */

    function getEscrowRecord(uint256 submissionId)
        external
        view
        returns (EscrowRecord memory)
    {
        return escrowRecords[submissionId];
    }

    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
