# Valida Protocol Backend

Node.js + Express backend for secure valida protocol.

## 🏗️ Architecture

```
Frontend (Next.js)
    ↓
Backend API (Node.js + Express)
    ↓
├─ MongoDB Atlas (metadata storage)
├─ Blockchain (smart contract calls via frontend/device)
└─ IPFS (Pinata - patch binary storage)
```

## 🔐 Security Principles

**Zero Private Key Storage:**
- ✅ Backend stores NO private keys
- ✅ Admin signs transactions from frontend wallet
- ✅ Publisher signs transactions from frontend wallet
- ✅ Device signs transactions from device agent
- ✅ Backend only stores metadata and verifies authenticity

## 📚 Tech Stack

- **Backend:** Node.js + Express.js
- **Database:** MongoDB Atlas + Mongoose ORM
- **Blockchain:** ethers.js (read-only provider)
- **File Storage:** IPFS via Pinata
- **Upload:** multer (100MB max)
- **Security:** helmet, CORS, wallet-based auth

## 📂 Folder Structure

```
backend/
├── config/
│   ├── db.js                    # MongoDB connection
│   ├── blockchain.js            # ethers.js read-only provider
│   └── contractAbi.json         # Smart contract ABI
├── models/
│   ├── User.js                  # Users (admin/publisher/device)
│   ├── Device.js                # Device metadata
│   ├── Patch.js                 # Patch metadata
│   └── InstallationLog.js        # Installation records
├── controllers/
│   ├── adminController.js       # Register devices/publishers
│   ├── publisherController.js    # Upload & publish patches
│   └── deviceController.js       # Download & verify patches
├── routes/
│   ├── publicRoutes.js          # Get user role (no auth)
│   ├── adminRoutes.js           # Admin endpoints
│   ├── publisherRoutes.js        # Publisher endpoints
│   └── deviceRoutes.js           # Device endpoints
├── middleware/
│   └── authMiddleware.js         # Wallet authentication
├── services/
│   ├── ipfsService.js           # Pinata API integration
│   ├── hashService.js           # SHA256 hashing
│   └── userService.js           # User management
├── device-agent/
│   └── patchAgent.js            # Device patch client simulator
├── utils/
│   └── logger.js                # JSON logging
├── server.js                    # Express app & bootstrap
├── package.json
.env                            # Environment variables
└── TESTING_GUIDE.md             # Full API testing instructions
```

## 🚀 Setup Instructions

### 1. Clone & Install

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy and update `.env`:

```bash
cp .env.example .env
```

Required variables:

```env
PORT=3001
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/valida
RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
CONTRACT_ADDRESS=0xYourContractAddress
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key
```

### 3. Start Backend

```bash
npm run dev
```

Server runs on `http://localhost:3001`

### 4. Bootstrap Admin User

Before testing admin endpoints, manually insert admin in MongoDB:

```javascript
db.users.insertOne({
  walletAddress: "0x742d35cc6634c0532925a3b844bc1e7595f25e3d",
  role: "admin",
  status: "active",
  createdAt: new Date()
})
```

## 📖 API Reference

### Public Endpoints (No Auth)

- `GET /health` - Service health check
- `GET /api/user/role/:walletAddress` - Check user role and status

### Admin Endpoints (Auth + admin role)

- `POST /api/admin/register-device` - Register new device
- `POST /api/admin/authorize-publisher` - Authorize wallet as publisher
- `GET /api/admin/devices` - List all registered devices
- `GET /api/admin/logs` - View installation logs

### Publisher Endpoints (Auth + publisher role)

- `POST /api/publisher/upload` - Upload patch file (multipart/form-data)
- `POST /api/publisher/publish` - Store patch metadata
- `GET /api/publisher/patches` - List own patches

### Device Endpoints (Auth + device role)

- `GET /api/device/patches` - List available patches
- `GET /api/device/patch/:patchId` - Get patch metadata
- `GET /api/device/patch/:patchId/download` - Download patch binary
- `POST /api/device/report-installation` - Report installation status

## 🔐 Authentication

All endpoints (except `/health` and `/api/user/role/:walletAddress`) require:

**Header:**
```
x-wallet-address: 0x742d35cc6634c0532925a3b844bc1e7595f25e3d
```

The wallet must be registered in MongoDB with an active status.

## 📊 Database Models

### Users Collection

```javascript
{
  walletAddress: String,           // Primary identifier
  role: "admin|publisher|device",  // User role
  status: "active|revoked",        // Account status
  createdAt: Date
}
```

### Devices Collection

```javascript
{
  walletAddress: String,           // Device wallet
  deviceId: String,                // Unique device ID
  deviceType: String,              // server|drone|radar|sensor|other
  location: String,                // Physical location
  hardwareFingerprint: String,     // Hardware ID
  serialNumber: String,            // Device serial
  status: "registered|revoked|disabled",
  lastSeen: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Patches Collection

```javascript
{
  patchId: Number,                 // Unique ID
  softwareName: String,            // e.g., "Ubuntu"
  version: String,                 // e.g., "22.04-security-1"
  publisher: String,               // Publisher wallet address
  ipfsHash: String,                // IPFS CID
  fileHash: String,                // SHA256 hash (0x...)
  active: Boolean,
  releaseTime: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### InstallationLogs Collection

```javascript
{
  deviceAddress: String,           // Device wallet
  patchId: Number,                 // Patch ID
  status: "success|failure",
  timestamp: Date,
  createdAt: Date
}
```

## 🤖 Device Agent

Simulates a device patch client:

```bash
DEVICE_WALLET_ADDRESS=0x362b2e1e0e8B0c0aF95cdcfDF7b6f37d0cF2dB3a \
node device-agent/patchAgent.js
```

**Agent Flow:**
1. Query available patches from backend
2. Download patch from IPFS
3. Calculate SHA256 hash
4. Verify hash matches expected
5. Report installation result

## 🧪 Testing

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for:
- Complete setup instructions
- Step-by-step API testing
- Example requests & responses
- Device agent simulation
- Bootstrap procedures

## 🔄 System Flow

### Admin Workflow

```
Admin Dashboard
    ↓
Register Device (backend stores metadata)
    ↓
Admin signs registerDevice() on smart contract
    ↓
Backend confirms device is registered
```

### Publisher Workflow

```
Publisher Dashboard
    ↓
Upload patch file → Backend → IPFS (returns IPFS hash + SHA256)
    ↓
Publish Patch (backend stores metadata)
    ↓
Publisher signs publishPatch() on smart contract
    ↓
Blockchain records patch immutably
```

### Device Workflow

```
Device Agent
    ↓
Query backend for available patches
    ↓
Download patch from IPFS
    ↓
Verify SHA256 hash locally
    ↓
Report installation status to backend
    ↓
Device signs reportInstallation() on smart contract
    ↓
Blockchain records immutable log
```

## 🎯 Key Features

✅ **Wallet-based Authentication** - No usernames/passwords
✅ **Role-based Access Control** - Admin, Publisher, Device roles
✅ **IPFS Integration** - Secure patch distribution
✅ **Hash Verification** - SHA256 integrity checks
✅ **Immutable Logging** - Blockchain records all installations
✅ **MongoDB Metadata** - Fast queries for patch & device info
✅ **Device Agent Simulation** - Test full workflow
✅ **Zero Private Key Storage** - Backend never handles keys
✅ **Production-Ready** - Helmet, CORS, error handling

## 📈 Production Deployment

1. Deploy MongoDB Atlas cluster (already done)
2. Get Sepolia RPC endpoint from Infura
3. Deploy Solidity contract to Sepolia testnet
4. Update `.env` with deployed contract address
5. Deploy backend to (AWS/Heroku/DigitalOcean)
6. Connect frontend to backend API
7. Run device agents on target devices

## 🚨 Troubleshooting

**MongoDB connection fails:**
- Check MONGODB_URI format
- Verify IP whitelist in MongoDB Atlas
- Test connection: `node -e "const m = require('mongoose'); m.connect('...').then(() => console.log('ok'))"`

**PORT already in use:**
- Change PORT in `.env`
- Or kill process: `lsof -ti:3001 | xargs kill -9`

**IPFS upload fails:**
- Verify PINATA_API_KEY and PINATA_SECRET_KEY in `.env`
- Check Pinata account has upload permissions

**Device agent can't download patches:**
- Verify IPFS_GATEWAY in `.env`
- Check device wallet is registered
- Ensure patch is active in database

## 📞 Support

Check logs for detailed error messages:

```bash
tail -f backend.log | jq
```

All errors include:
- Error message
- Stack trace (dev only)
- API context
- Timestamp
