// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BPMS {

    /* ------------------------------------------------------------ */
    /* ROLES                                                        */
    /* ------------------------------------------------------------ */

    address public admin;

    mapping(address => bool) public authorizedPublishers;
    mapping(address => bool) public registeredDevices;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyPublisher() {
        require(authorizedPublishers[msg.sender], "Not authorized publisher");
        _;
    }

    modifier onlyDevice() {
        require(registeredDevices[msg.sender], "Device not registered");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /* ------------------------------------------------------------ */
    /* DATA STRUCTURES                                              */
    /* ------------------------------------------------------------ */

    struct Patch {
        uint256 id;
        string softwareName;
        string version;
        string ipfsHash;        // location of patch binary
        bytes32 fileHash;       // integrity hash
        address publisher;
        uint256 releaseTime;
        bool active;
    }

    struct InstallationRecord {
        uint256 patchId;
        address device;
        uint256 timestamp;
        bool success;
    }

    uint256 public patchCounter;

    mapping(uint256 => Patch) public patches;
    mapping(address => uint256[]) public deviceInstallations;
    InstallationRecord[] public installationLogs;

    /* ------------------------------------------------------------ */
    /* ADMIN FUNCTIONS                                              */
    /* ------------------------------------------------------------ */

    function authorizePublisher(address _publisher) external onlyAdmin {
        authorizedPublishers[_publisher] = true;
    }

    function revokePublisher(address _publisher) external onlyAdmin {
        authorizedPublishers[_publisher] = false;
    }

    function registerDevice(address _device) external onlyAdmin {
        registeredDevices[_device] = true;
    }

    function revokeDevice(address _device) external onlyAdmin {
        registeredDevices[_device] = false;
    }

    /* ------------------------------------------------------------ */
    /* PATCH MANAGEMENT                                             */
    /* ------------------------------------------------------------ */

    event PatchPublished(uint256 patchId, string software, string version);
    event PatchDisabled(uint256 patchId);

    function publishPatch(
        string memory _software,
        string memory _version,
        string memory _ipfsHash,
        bytes32 _fileHash
    ) external onlyPublisher {

        patchCounter++;

        patches[patchCounter] = Patch({
            id: patchCounter,
            softwareName: _software,
            version: _version,
            ipfsHash: _ipfsHash,
            fileHash: _fileHash,
            publisher: msg.sender,
            releaseTime: block.timestamp,
            active: true
        });

        emit PatchPublished(patchCounter, _software, _version);
    }

    function disablePatch(uint256 _patchId) external onlyAdmin {
        patches[_patchId].active = false;
        emit PatchDisabled(_patchId);
    }

    /* ------------------------------------------------------------ */
    /* DEVICE INSTALLATION REPORTING                                */
    /* ------------------------------------------------------------ */

    event PatchInstalled(uint256 patchId, address device, bool success);

    function reportInstallation(uint256 _patchId, bool _success) external onlyDevice {

        require(patches[_patchId].id != 0, "Patch does not exist");
        require(patches[_patchId].active, "Patch inactive");

        installationLogs.push(
            InstallationRecord({
                patchId: _patchId,
                device: msg.sender,
                timestamp: block.timestamp,
                success: _success
            })
        );

        deviceInstallations[msg.sender].push(_patchId);

        emit PatchInstalled(_patchId, msg.sender, _success);
    }

    /* ------------------------------------------------------------ */
    /* AUDIT FUNCTIONS                                              */
    /* ------------------------------------------------------------ */

    function getDeviceInstallations(address _device)
        external
        view
        returns (uint256[] memory)
    {
        return deviceInstallations[_device];
    }

    function getInstallationLogCount() external view returns (uint256) {
        return installationLogs.length;
    }

    function getInstallationRecord(uint256 index)
        external
        view
        returns (
            uint256 patchId,
            address device,
            uint256 timestamp,
            bool success
        )
    {
        InstallationRecord memory r = installationLogs[index];
        return (r.patchId, r.device, r.timestamp, r.success);
    }
}