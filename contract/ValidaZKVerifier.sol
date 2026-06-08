// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Phase 4 implements AuthBypass template only.
 *      Add HashMismatch, PrivEscalation, ReplayAttack, LogicError templates
 *      in future sprints using the TemplateRegistry pattern below.
 */

interface ITemplateVerifier {
    function verifyProof(
        uint256[2] memory _pA,
        uint256[2][2] memory _pB,
        uint256[2] memory _pC,
        uint256[4] memory _pubSignals
    ) external view returns (bool);
}

interface IValidaVulnerabilityZK {
    function getSubmissionCommitment(uint256 submissionId) external view returns (bytes32);
    function markZKVerified(uint256 submissionId) external;
}

/**
 * @title ValidaZKVerifier
 * @notice Verifies Groth16 ZK proofs for vulnerability submissions.
 *         Uses a TemplateRegistry so new vulnerability type circuits can be added
 *         without changing core logic.
 *
 *         Public signals layout (all templates must use this order):
 *           [0] = functionSelector   (which function is vulnerable)
 *           [1] = expectedAuthState  (what auth value should be required)
 *           [2] = systemCodeHash     (fingerprint of target system, as uint256)
 *           [3] = commitmentHash     (Poseidon(exploitInput, salt))
 *
 *         The commitmentHash in [3] MUST match the on-chain commitment from
 *         ValidaVulnerability.submissions[submissionId].commitment — enforced by require().
 */
contract ValidaZKVerifier {

    /* ------------------------------------------------------------ */
    /* STATE                                                        */
    /* ------------------------------------------------------------ */

    address public admin;
    address public validaVulnerability;

    // TemplateRegistry: templateId → verifier contract address
    // templateId 1 = AuthBypass (only template in Phase 4)
    // templateId 2 = HashMismatch    (future)
    // templateId 3 = PrivEscalation  (future)
    // templateId 4 = ReplayAttack    (future)
    // templateId 5 = LogicError      (future)
    mapping(uint8 => address) public templateVerifiers;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    /* ------------------------------------------------------------ */
    /* DATA STRUCTURES                                              */
    /* ------------------------------------------------------------ */

    struct ZKProofSubmission {
        uint256 submissionId;
        address prover;
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
        uint256[4] publicSignals; // [functionSelector, expectedAuthState, systemCodeHash, commitmentHash]
        bool verified;
        uint8 templateType;
        uint256 verifiedAt;
    }

    mapping(uint256 => ZKProofSubmission) public zkProofs;

    /* ------------------------------------------------------------ */
    /* EVENTS                                                       */
    /* ------------------------------------------------------------ */

    event ZKProofVerified(uint256 indexed submissionId, address indexed prover, uint8 templateType);
    event TemplateAdded(uint8 indexed templateId, address verifierAddress);

    /* ------------------------------------------------------------ */
    /* CONSTRUCTOR                                                  */
    /* ------------------------------------------------------------ */

    constructor(address _validaVulnerability) {
        admin = msg.sender;
        validaVulnerability = _validaVulnerability;
    }

    /* ------------------------------------------------------------ */
    /* ADMIN — TEMPLATE REGISTRY                                    */
    /* ------------------------------------------------------------ */

    /**
     * @notice Register a new template verifier (SnarkJS-generated contract).
     *         Call this after deploying AuthBypassVerifier (or future verifiers).
     */
    function addTemplate(uint8 templateId, address verifierAddress) external onlyAdmin {
        require(verifierAddress != address(0), "Invalid verifier address");
        templateVerifiers[templateId] = verifierAddress;
        emit TemplateAdded(templateId, verifierAddress);
    }

    /* ------------------------------------------------------------ */
    /* PROOF SUBMISSION                                             */
    /* ------------------------------------------------------------ */

    /**
     * @notice Submit a ZK proof for a vulnerability submission.
     *         If the proof verifies on-chain AND the commitmentHash matches the
     *         on-chain commitment, the submission is auto-advanced to Verified status.
     *
     * @param submissionId  The ValidaVulnerability submission to verify
     * @param a             Proof component A (from SnarkJS groth16.exportSolidityCallData)
     * @param b             Proof component B
     * @param c             Proof component C
     * @param publicSignals [functionSelector, expectedAuthState, systemCodeHash, commitmentHash]
     * @param templateType  1 for AuthBypass; other types registered via addTemplate()
     */
    function submitZKProof(
        uint256 submissionId,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata publicSignals,
        uint8 templateType
    ) external {
        address verifier = templateVerifiers[templateType];
        require(verifier != address(0), "Template not registered");
        require(zkProofs[submissionId].submissionId == 0, "ZK proof already submitted for this submission");

        // 1. Verify the ZK proof on-chain
        bool valid = ITemplateVerifier(verifier).verifyProof(a, b, c, publicSignals);
        require(valid, "ZK proof verification failed");

        // 2. Cross-check: commitmentHash (public signal[3]) must match on-chain commitment
        //    Auditor must have submitted their vulnerability with Poseidon(exploitInput, salt)
        //    as the commitment — this is enforced here cryptographically.
        bytes32 onChainCommitment = IValidaVulnerabilityZK(validaVulnerability)
            .getSubmissionCommitment(submissionId);
        require(
            bytes32(publicSignals[3]) == onChainCommitment,
            "ZK commitmentHash does not match on-chain commitment - proof is for wrong submission"
        );

        // 3. Record the verified proof
        zkProofs[submissionId] = ZKProofSubmission({
            submissionId: submissionId,
            prover: msg.sender,
            a: a,
            b: b,
            c: c,
            publicSignals: publicSignals,
            verified: true,
            templateType: templateType,
            verifiedAt: block.timestamp
        });

        // 4. Auto-advance submission to Verified on ValidaVulnerability
        IValidaVulnerabilityZK(validaVulnerability).markZKVerified(submissionId);

        emit ZKProofVerified(submissionId, msg.sender, templateType);
    }

    /* ------------------------------------------------------------ */
    /* VIEW                                                         */
    /* ------------------------------------------------------------ */

    function getZKProof(uint256 submissionId)
        external
        view
        returns (ZKProofSubmission memory)
    {
        return zkProofs[submissionId];
    }
}
