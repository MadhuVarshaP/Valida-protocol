# Valida Protocol Backend Testing Guide

## Prerequisites

- Backend running: `npm run dev` (listening on `http://localhost:3001`)
- MongoDB Atlas connected (check in `.env` MONGODB_URI)
- Wallet addresses ready (for testing, use any valid Ethereum addresses)

## Test Flow Overview

```
1. Register Admin
2. Register Publisher  
3. Register Device
4. Publisher: Upload Patch
5. Publisher: Store Patch Metadata
6. Device: Check Available Patches
7. Device: Download Patch
8. Device: Report Installation
9. Admin: View All Devices
10. Admin: View Installation Logs
```

---

## 🔐 Authentication Headers

All requests (except `/api/user/role/:walletAddress`) require:

```
Header: x-wallet-address
Value: <wallet_address>
```

**Example wallet addresses for testing:**

```
Admin:     0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d
Publisher: 0x8ba1f109551bD432803012645Ac136ddd64DBA72
Device:    0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a
```

---

## 📖 API Testing Instructions

### Test 1: Get User Role (No Auth Required)

This checks if a wallet is registered and what role it has.

**Request:**
```bash
curl -X GET "http://localhost:3001/api/user/role/0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d"
```

**Expected Response:**
```json
{
  "error": "User not found"
}
```

(Expected because we haven't registered anyone yet)

---

### Test 2: Register Admin

Admin must first be registered in MongoDB before they can perform admin actions.

**Request:**
```bash
curl -X POST "http://localhost:3001/api/admin/register-device" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: 0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d" \
  -d '{
    "walletAddress": "0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d",
    "deviceId": "admin-console",
    "deviceType": "server",
    "location": "hq"
  }'
```

❌ **Expected Error:**
```json
{
  "error": "Insufficient permissions",
  "requiredRole": "admin",
  "yourRole": null
}
```

**Why?** To bootstrap the admin, you need to manually insert them into MongoDB first.

**Bootstrap Admin (Manual MongoDB Operation):**

Connect to MongoDB Atlas and run:

```javascript
db.users.insertOne({
  walletAddress: "0x742d35cc6634c0532925a3b844bc1e7595f25e3d",
  role: "admin",
  status: "active",
  createdAt: new Date()
})
```

After this, try Test 2 again.

---

### Test 3: Register Device

Once admin is registered, they can register devices.

**Request:**
```bash
curl -X POST "http://localhost:3001/api/admin/register-device" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: 0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d" \
  -d '{
    "walletAddress": "0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a",
    "deviceId": "sensor-001",
    "deviceType": "sensor",
    "location": "base-station-1"
  }'
```

✅ **Expected Response:**
```json
{
  "message": "Device registered in backend. Admin must call registerDevice() on smart contract.",
  "device": {
    "_id": "...",
    "walletAddress": "0x362b2e1e0e8b0c0af95cdcfdf7b6f37d0cf2db3a",
    "deviceId": "sensor-001",
    "deviceType": "sensor",
    "location": "base-station-1",
    "status": "registered",
    "lastSeen": "2024-11-12T...",
    "createdAt": "2024-11-12T..."
  },
  "nextStep": "Call contract registerDevice() from admin wallet"
}
```

**Key Note:** Backend stores device metadata. Admin must then call the smart contract separately from the frontend to finalize registration.

---

### Test 4: Authorize Publisher

Admin authorizes a publisher wallet.

**Request:**
```bash
curl -X POST "http://localhost:3001/api/admin/authorize-publisher" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: 0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d" \
  -d '{
    "walletAddress": "0x8ba1f109551bD432803012645Ac136ddd64DBA72"
  }'
```

✅ **Expected Response:**
```json
{
  "message": "Publisher authorized in backend. Admin must call authorizePublisher() on smart contract.",
  "walletAddress": "0x8ba1f109551bd432803012645ac136ddd64dba72",
  "nextStep": "Call contract authorizePublisher() from admin wallet"
}
```

---

### Test 5: Get All Devices (Admin)

Admin views all registered devices.

**Request:**
```bash
curl -X GET "http://localhost:3001/api/admin/devices" \
  -H "x-wallet-address: 0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d"
```

✅ **Expected Response:**
```json
{
  "count": 1,
  "devices": [
    {
      "_id": "...",
      "walletAddress": "0x362b2e1e0e8b0c0af95cdcfdf7b6f37d0cf2db3a",
      "deviceId": "sensor-001",
      "deviceType": "sensor",
      "location": "base-station-1",
      "status": "registered",
      "lastSeen": "2024-11-12T...",
      "createdAt": "2024-11-12T..."
    }
  ]
}
```

---

### Test 6: Upload Patch File (Publisher)

Publisher uploads a patch file.

**Create test patch file:**
```bash
echo "PATCH_BINARY_CONTENT_v1.0" > test_patch.bin
```

**Request:**
```bash
curl -X POST "http://localhost:3001/api/publisher/upload" \
  -H "x-wallet-address: 0x8ba1f109551bD432803012645Ac136ddd64DBA72" \
  -F "patchFile=@test_patch.bin"
```

✅ **Expected Response:**
```json
{
  "message": "Patch uploaded to IPFS successfully",
  "ipfsHash": "QmXxxx...",
  "fileHash": "0x1234567890abcdef...",
  "size": 28,
  "timestamp": "2024-11-12T...",
  "nextStep": "Use ipfsHash and fileHash to call publishPatch() from publisher wallet on smart contract"
}
```

**Save these values for Test 7:**
- `ipfsHash`
- `fileHash`

---

### Test 7: Publish Patch Metadata (Publisher)

Publisher stores patch metadata in backend.

**Request:**
```bash
curl -X POST "http://localhost:3001/api/publisher/publish" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: 0x8ba1f109551bD432803012645Ac136ddd64DBA72" \
  -d '{
    "softwareName": "Ubuntu",
    "version": "22.04-security-1",
    "ipfsHash": "QmXxxx...",
    "fileHash": "0x1234567890abcdef..."
  }'
```

✅ **Expected Response:**
```json
{
  "message": "Patch metadata stored. Publisher must call publishPatch() on smart contract with patchId.",
  "patch": {
    "_id": "...",
    "patchId": 1731414000000,
    "softwareName": "Ubuntu",
    "version": "22.04-security-1",
    "publisher": "0x8ba1f109551bd432803012645ac136ddd64dba72",
    "ipfsHash": "QmXxxx...",
    "fileHash": "0x1234567890abcdef...",
    "active": true,
    "releaseTime": "2024-11-12T..."
  },
  "nextStep": "Call contract publishPatch(...) from publisher wallet"
}
```

**Save patchId:** `1731414000000` (use in Test 9)

---

### Test 8: Get Publisher Patches (Publisher)

Publisher views their own patches.

**Request:**
```bash
curl -X GET "http://localhost:3001/api/publisher/patches" \
  -H "x-wallet-address: 0x8ba1f109551bD432803012645Ac136ddd64DBA72"
```

✅ **Expected Response:**
```json
{
  "count": 1,
  "patches": [
    {
      "_id": "...",
      "patchId": 1731414000000,
      "softwareName": "Ubuntu",
      "version": "22.04-security-1",
      "publisher": "0x8ba1f109551bd432803012645ac136ddd64dba72",
      "ipfsHash": "QmXxxx...",
      "fileHash": "0x1234567890abcdef...",
      "active": true,
      "releaseTime": "2024-11-12T..."
    }
  ]
}
```

---

### Test 9: Check Available Patches (Device)

Device queries available patches.

**Request:**
```bash
curl -X GET "http://localhost:3001/api/device/patches" \
  -H "x-wallet-address: 0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a"
```

✅ **Expected Response:**
```json
{
  "count": 1,
  "patches": [
    {
      "_id": "...",
      "patchId": 1731414000000,
      "softwareName": "Ubuntu",
      "version": "22.04-security-1",
      "publisher": "0x8ba1f109551bd432803012645ac136ddd64dba72",
      "ipfsHash": "QmXxxx...",
      "fileHash": "0x1234567890abcdef...",
      "active": true,
      "releaseTime": "2024-11-12T..."
    }
  ]
}
```

---

### Test 10: Get Patch Metadata (Device)

Device retrieves full patch metadata including IPFS and hash.

**Request:**
```bash
curl -X GET "http://localhost:3001/api/device/patch/1731414000000" \
  -H "x-wallet-address: 0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a"
```

✅ **Expected Response:**
```json
{
  "patchId": 1731414000000,
  "softwareName": "Ubuntu",
  "version": "22.04-security-1",
  "ipfsHash": "QmXxxx...",
  "expectedFileHash": "0x1234567890abcdef...",
  "releaseTime": "2024-11-12T..."
}
```

---

### Test 11: Download Patch (Device)

Device downloads patch binary from IPFS.

**Request:**
```bash
curl -X GET "http://localhost:3001/api/device/patch/1731414000000/download" \
  -H "x-wallet-address: 0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a" \
  -o downloaded_patch.bin
```

✅ **Expected:** Binary file saved to `downloaded_patch.bin`

---

### Test 12: Report Installation (Device)

Device reports patch installation result.

**Request:**
```bash
curl -X POST "http://localhost:3001/api/device/report-installation" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: 0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a" \
  -d '{
    "patchId": 1731414000000,
    "success": true
  }'
```

✅ **Expected Response:**
```json
{
  "message": "Installation logged. Device must call reportInstallation() on smart contract.",
  "log": {
    "_id": "...",
    "deviceAddress": "0x362b2e1e0e8b0c0af95cdcfdf7b6f37d0cf2db3a",
    "patchId": 1731414000000,
    "status": "success",
    "timestamp": "2024-11-12T..."
  },
  "nextStep": "Call contract reportInstallation(1731414000000, true) from device wallet"
}
```

---

### Test 13: Get Installation Logs (Admin)

Admin views all device installation logs.

**Request:**
```bash
curl -X GET "http://localhost:3001/api/admin/logs" \
  -H "x-wallet-address: 0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d"
```

✅ **Expected Response:**
```json
{
  "count": 1,
  "logs": [
    {
      "_id": "...",
      "deviceAddress": "0x362b2e1e0e8b0c0af95cdcfdf7b6f37d0cf2db3a",
      "patchId": 1731414000000,
      "status": "success",
      "timestamp": "2024-11-12T..."
    }
  ]
}
```

---

## 🤖 Device Agent Testing

The device agent simulates a device checking and installing patches.

**Setup:**
1. Add device to `.env`:
   ```bash
   DEVICE_WALLET_ADDRESS=0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a
   ```

2. Run agent:
   ```bash
   node device-agent/patchAgent.js
   ```

✅ **Expected Output:**
```
Device Agent starting for wallet: 0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a
Found 1 active patches

Processing patch 1731414000000...
Downloaded metadata: Ubuntu v22.04-security-1
Expected hash:   0x1234567890abcdef...
Calculated hash: 0x1234567890abcdef...
✅ Patch 1731414000000 installed successfully

✅ Device agent completed
```

---

## ✅ API Summary

| Method | Route | Auth | Role | Purpose |
|--------|-------|------|------|---------|
| GET | `/api/user/role/:walletAddress` | No | - | Check user role |
| POST | `/api/admin/register-device` | Yes | admin | Register device |
| POST | `/api/admin/authorize-publisher` | Yes | admin | Authorize publisher |
| GET | `/api/admin/devices` | Yes | admin | List all devices |
| GET | `/api/admin/logs` | Yes | admin | View installation logs |
| POST | `/api/publisher/upload` | Yes | publisher | Upload patch to IPFS |
| POST | `/api/publisher/publish` | Yes | publisher | Store patch metadata |
| GET | `/api/publisher/patches` | Yes | publisher | List publisher's patches |
| GET | `/api/device/patches` | Yes | device | List available patches |
| GET | `/api/device/patch/:patchId` | Yes | device | Get patch metadata |
| GET | `/api/device/patch/:patchId/download` | Yes | device | Download patch binary |
| POST | `/api/device/report-installation` | Yes | device | Report installation result |

---

## 🔒 Security Principles Enforced

✅ **No private keys stored**
- Admin wallet signs transactions on frontend
- Publisher wallet signs transactions on frontend
- Device wallet signs transactions on device agent

✅ **Backend is stateless for transactions**
- Only stores metadata in MongoDB
- Provides IPFS integration
- Routes requests to blockchain without signing

✅ **Role-based access control**
- Admin → manage devices & publishers
- Publisher → upload & publish patches
- Device → download patches & report status

---

## 🚀 Next Steps After Backend Testing

1. **Deploy Smart Contract** on Sepolia testnet
2. **Update `.env`** with `CONTRACT_ADDRESS` and `RPC_URL`
3. **Connect Frontend** to backend API
4. **Admin Dashboard** signs registerDevice/authorizePublisher transactions
5. **Publisher Dashboard** signs publishPatch transactions
6. **Device Agent** signs reportInstallation transactions
