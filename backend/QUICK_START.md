# Valida Protocol Backend - Quick Start Guide

## 🚀 Get Backend Running in 5 Minutes

### Step 1: Verify Environment Setup

```bash
cd backend

# Check MongoDB connection
cat .env | grep MONGODB_URI
```

Expected: Should show MongoDB Atlas connection string

**If missing, update `.env`:**
```env
MONGODB_URI=mongodb+srv://madhuvarsha0608:madhuvarsha1234%40@cluster0.9edwm3j.mongodb.net/valida
PORT=3001
```

### Step 2: Start Backend

```bash
npm run dev
```

You should see:
```
{"level":"info","message":"MongoDB connected successfully","time":"2024-11-12T..."}
{"level":"info","message":"Blockchain initialized successfully","time":"2024-11-12T..."}
{"level":"info","message":"Valida Protocol backend listening on port 3001","time":"2024-11-12T..."}
```

### Step 3: Verify Backend is Running

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "backend",
  "timestamp": "2024-11-12T..."
}
```

## 🔐 Bootstrap Admin (One-Time Setup)

Before you can test, you must create an admin user in MongoDB.

### Option A: MongoDB Compass (GUI)

1. Open MongoDB Compass
2. Connect to your MongoDB Atlas cluster
3. Select database: `valida`
4. Select collection: `users`
5. Click "Insert Document"
6. Paste this JSON:

```json
{
  "walletAddress": "0x742d35cc6634c0532925a3b844bc1e7595f25e3d",
  "role": "admin",
  "status": "active",
  "createdAt": new Date()
}
```

7. Click Insert

### Option B: MongoDB Shell

```bash
mongosh "mongodb+srv://madhuvarsha0608:madhuvarsha1234%40@cluster0.9edwm3j.mongodb.net/valida"

# In mongosh shell:
db.users.insertOne({
  walletAddress: "0x742d35cc6634c0532925a3b844bc1e7595f25e3d",
  role: "admin",
  status: "active",
  createdAt: new Date()
})
```

Expected output:
```
{ acknowledged: true, insertedId: ObjectId(...) }
```

## ✅ Verify Admin Registration

```bash
curl http://localhost:3001/api/user/role/0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d
```

Expected response:
```json
{
  "walletAddress": "0x742d35cc6634c0532925a3b844bc1e7595f25e3d",
  "role": "admin",
  "status": "active"
}
```

## 🧪 Test All APIs with One Command

### Option 1: Run Complete Test Suite

```bash
chmod +x test-all-endpoints.sh
./test-all-endpoints.sh
```

This will:
- ✅ Check health
- ✅ Register device (as admin)
- ✅ Authorize publisher (as admin)
- ✅ Upload patch (as publisher)
- ✅ Publish patch (as publisher)
- ✅ Check available patches (as device)
- ✅ Report installation (as device)
- ✅ View logs (as admin)

### Option 2: Test Manually with cURL

#### 1. Register Device

```bash
curl -X POST "http://localhost:3001/api/admin/register-device" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: 0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d" \
  -d '{
    "walletAddress": "0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a",
    "deviceId": "sensor-001",
    "deviceType": "sensor",
    "location": "base-station-1"
  }' | jq
```

Expected response:
```json
{
  "message": "Device registered in backend. Admin must call registerDevice() on smart contract.",
  "device": {
    "walletAddress": "0x362b2e1e0e8b0c0af95cdcfdf7b6f37d0cf2db3a",
    "deviceId": "sensor-001",
    "status": "registered"
  }
}
```

#### 2. Authorize Publisher

```bash
curl -X POST "http://localhost:3001/api/admin/authorize-publisher" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: 0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d" \
  -d '{
    "walletAddress": "0x8ba1f109551bD432803012645Ac136ddd64DBA72"
  }' | jq
```

#### 3. Upload Patch

```bash
# Create test file
echo "PATCH_CONTENT" > /tmp/test_patch.bin

# Upload
curl -X POST "http://localhost:3001/api/publisher/upload" \
  -H "x-wallet-address: 0x8ba1f109551bD432803012645Ac136ddd64DBA72" \
  -F "patchFile=@/tmp/test_patch.bin" | jq
```

Expected response includes `ipfsHash` and `fileHash`

#### 4. Publish Patch

Replace `IPFS_HASH` and `FILE_HASH` from upload response:

```bash
curl -X POST "http://localhost:3001/api/publisher/publish" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: 0x8ba1f109551bD432803012645Ac136ddd64DBA72" \
  -d '{
    "softwareName": "Ubuntu",
    "version": "22.04-security-1",
    "ipfsHash": "IPFS_HASH",
    "fileHash": "FILE_HASH"
  }' | jq
```

#### 5. Check Available Patches

```bash
curl -X GET "http://localhost:3001/api/device/patches" \
  -H "x-wallet-address: 0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a" | jq
```

#### 6. Report Installation

```bash
curl -X POST "http://localhost:3001/api/device/report-installation" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: 0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a" \
  -d '{
    "patchId": PATCH_ID,
    "success": true
  }' | jq
```

#### 7. View Logs

```bash
curl -X GET "http://localhost:3001/api/admin/logs" \
  -H "x-wallet-address: 0x742d35Cc6634C0532925a3b844Bc1e7595f25e3d" | jq
```

### Option 3: Import Postman Collection

1. Open Postman
2. Click "Import"
3. Drag `Valida_Backend_API.postman_collection.json` into Postman
4. Click "Import"
5. Update wallet addresses in each request
6. Send requests

## 🤖 Test Device Agent

### Setup

Add to `.env`:
```env
DEVICE_WALLET_ADDRESS=0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a
```

### Run

```bash
node device-agent/patchAgent.js
```

Expected output:
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

## 📊 Check MongoDB Data

Connect to MongoDB and verify data was stored:

```bash
# Connect to MongoDB
mongosh "mongodb+srv://madhuvarsha0608:madhuvarsha1234%40@cluster0.9edwm3j.mongodb.net/valida"

# View users
db.users.find()

# View devices
db.devices.find()

# View patches
db.patches.find()

# View installation logs
db.installation_logs.find()
```

## 🔗 API Endpoints Summary

| Role | Method | Endpoint | Purpose |
|------|--------|----------|---------|
| - | GET | `/health` | Check service health |
| - | GET | `/api/user/role/:walletAddress` | Get user role |
| Admin | POST | `/api/admin/register-device` | Register device |
| Admin | POST | `/api/admin/authorize-publisher` | Authorize publisher |
| Admin | GET | `/api/admin/devices` | List devices |
| Admin | GET | `/api/admin/logs` | View logs |
| Publisher | POST | `/api/publisher/upload` | Upload patch file |
| Publisher | POST | `/api/publisher/publish` | Publish patch |
| Publisher | GET | `/api/publisher/patches` | List patches |
| Device | GET | `/api/device/patches` | Check patches |
| Device | GET | `/api/device/patch/:id` | Get metadata |
| Device | GET | `/api/device/patch/:id/download` | Download patch |
| Device | POST | `/api/device/report-installation` | Report status |

## 🆘 Troubleshooting

### Port Already in Use

```bash
# Find process
lsof -ti:3001

# Kill process
kill -9 <PID>

# Or change PORT in .env
echo "PORT=5001" >> .env
npm run dev
```

### MongoDB Connection Failed

```bash
# Check connection string
cat .env | grep MONGODB_URI

# Try connecting directly
mongosh "mongodb+srv://madhuvarsha0608:madhuvarsha1234%40@cluster0.9edwm3j.mongodb.net/valida"

# Check IP whitelist in MongoDB Atlas
# add 0.0.0.0/0 if testing locally
```

### User Not Registered Error

Make sure admin is bootstrapped first (see "Bootstrap Admin" section above)

### IPFS Upload Fails

```bash
# Check Pinata credentials
cat .env | grep PINATA

# Verify you have PINATA_API_KEY and PINATA_SECRET_KEY set
```

## 📖 Full Documentation

See detailed documentation:
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Comprehensive API testing
- [README.md](./README.md) - Architecture & setup details

## ✨ Next Step: Connect Frontend

Once backend is tested and working:

1. Update frontend `.env` to point to backend:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

2. Update API calls in frontend to use wallet auth header

3. Test admin, publisher, and device dashboards

## 🎯 Production Deployment

For production:

1. Deploy MongoDB Atlas cluster (already done)
2. Get Sepolia RPC endpoint from Infura
3. Deploy Solidity contract to Sepolia
4. Deploy backend to hosting (AWS/Heroku/DigitalOcean)
5. Update frontend to connect to production backend
6. Deploy device agents to target devices
