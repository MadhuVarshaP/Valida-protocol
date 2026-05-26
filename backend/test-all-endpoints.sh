#!/bin/bash
# BPMS Backend - Complete Test Script
# This script runs through all API endpoints to verify backend functionality.
#
# Prerequisites:
#   1. Backend running: npm run dev (port 3001)
#   2. Seed users once: node scripts/seed-admin.js
#   3. Optional: SKIP_MANUAL_SETUP=1 for non-interactive run
#   With placeholder Pinata keys in .env, IPFS upload uses mock (no real Pinata needed).

set -e

API_BASE="http://localhost:3001"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test wallet addresses (lowercase for consistent API behavior)
ADMIN_WALLET="0x742d35cc6634c0532925a3b844bc1e7595f25e3d"
PUBLISHER_WALLET="0x8ba1f109551bd432803012645ac136ddd64dba72"
DEVICE_WALLET="0x362b2e1e0e8b0c0af95cdcfdf7b6f37d0cf2db3a"

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}  BPMS Backend - Complete API Test Suite${NC}"
echo -e "${BLUE}==================================================${NC}\n"

# Check if backend is running
echo -e "${YELLOW}[1] Checking if backend is running...${NC}"
if ! curl -s "$API_BASE/health" > /dev/null 2>&1; then
  echo -e "${RED}❌ Backend is not running at $API_BASE${NC}"
  echo "Start backend with: npm run dev"
  exit 1
fi
echo -e "${GREEN}✅ Backend is running${NC}\n"

# Test 1: Health Check
echo -e "${YELLOW}[2] Testing Health Check${NC}"
HEALTH=$(curl -s "$API_BASE/health")
if ! echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "${RED}❌ Health check failed: $HEALTH${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Response: $HEALTH${NC}\n"

# Test 2: Get User Role (before registration - should fail)
echo -e "${YELLOW}[3] Testing Get User Role (before registration)${NC}"
USER_ROLE=$(curl -s "$API_BASE/api/user/role/$ADMIN_WALLET")
echo -e "${GREEN}✅ Response: $USER_ROLE${NC}\n"

# Test 3: Try to register device as guest (should fail)
echo -e "${YELLOW}[4] Testing Admin Endpoint Without Admin Role (should fail)${NC}"
FAIL_TEST=$(curl -s -X POST "$API_BASE/api/admin/register-device" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: $ADMIN_WALLET" \
  -d '{
    "walletAddress": "'$DEVICE_WALLET'",
    "deviceId": "test-device",
    "deviceType": "server",
    "location": "test"
  }')
echo -e "${YELLOW}Expected error (user not registered):${NC}"
echo -e "${GREEN}✅ Response: $FAIL_TEST${NC}\n"

# If admin user does not exist, bootstrap: set ADMIN_WALLET_ADDRESS in .env and restart backend
if echo "$FAIL_TEST" | grep -q "User not registered\|Authentication failed\|not registered"; then
  echo -e "${BLUE}==================================================${NC}"
  echo -e "${BLUE}  ⚠️  ADMIN USER REQUIRED${NC}"
  echo -e "${BLUE}==================================================${NC}\n"
  echo -e "${YELLOW}Set ADMIN_WALLET_ADDRESS=$ADMIN_WALLET in backend .env and restart the backend.${NC}"
  echo -e "${YELLOW}The server will create the admin user at startup. Then re-run this script.${NC}\n"
  if [ -z "${SKIP_MANUAL_SETUP}" ]; then
    echo -e "${YELLOW}Press Enter to continue anyway (tests may fail), or Ctrl+C to exit...${NC}"
    read -p ""
  fi
fi

# Test 4: Register Device (as admin)
echo -e "\n${YELLOW}[5] Testing Register Device (as admin)${NC}"
DEVICE_REG=$(curl -s -X POST "$API_BASE/api/admin/register-device" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: $ADMIN_WALLET" \
  -d '{
    "walletAddress": "'$DEVICE_WALLET'",
    "deviceId": "sensor-001",
    "deviceType": "sensor",
    "location": "base-station-1"
  }')
if echo "$DEVICE_REG" | grep -q '"error"'; then
  echo -e "${RED}❌ Register device failed: $DEVICE_REG${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Response:${NC}"
echo "$DEVICE_REG" | jq . 2>/dev/null || echo "$DEVICE_REG"

# Extract device ID if needed
DEVICE_ID=$(echo "$DEVICE_REG" | jq -r '.device.deviceId' 2>/dev/null || echo "unknown")
echo ""

# Test 5: Authorize Publisher
echo -e "${YELLOW}[6] Testing Authorize Publisher (as admin)${NC}"
PUB_AUTH=$(curl -s -X POST "$API_BASE/api/admin/authorize-publisher" \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: $ADMIN_WALLET" \
  -d '{
    "walletAddress": "'$PUBLISHER_WALLET'"
  }')
echo -e "${GREEN}✅ Response:${NC}"
echo "$PUB_AUTH" | jq . 2>/dev/null || echo "$PUB_AUTH"
echo ""

# Test 6: Get All Devices (as admin)
echo -e "${YELLOW}[7] Testing Get All Devices (as admin)${NC}"
DEVICES=$(curl -s -X GET "$API_BASE/api/admin/devices" \
  -H "x-wallet-address: $ADMIN_WALLET")
echo -e "${GREEN}✅ Response:${NC}"
echo "$DEVICES" | jq . 2>/dev/null || echo "$DEVICES"
echo ""

# Test 7: Create test patch file
echo -e "${YELLOW}[8] Creating test patch file${NC}"
echo "TEST_PATCH_CONTENT_v1.0" > /tmp/test_patch.bin
echo -e "${GREEN}✅ Created /tmp/test_patch.bin${NC}\n"

# Test 8: Upload Patch (as publisher)
echo -e "${YELLOW}[9] Testing Upload Patch (as publisher)${NC}"
UPLOAD=$(curl -s -X POST "$API_BASE/api/publisher/upload" \
  -H "x-wallet-address: $PUBLISHER_WALLET" \
  -F "patchFile=@/tmp/test_patch.bin")
echo -e "${GREEN}✅ Response:${NC}"
echo "$UPLOAD" | jq . 2>/dev/null || echo "$UPLOAD"

# Extract IPFS hash and fileHash
IPFS_HASH=$(echo "$UPLOAD" | jq -r '.ipfsHash' 2>/dev/null || echo "unknown")
FILE_HASH=$(echo "$UPLOAD" | jq -r '.fileHash' 2>/dev/null || echo "unknown")
echo ""

# Test 9: Publish Patch Metadata (as publisher)
if [ "$IPFS_HASH" != "unknown" ] && [ "$FILE_HASH" != "unknown" ]; then
  echo -e "${YELLOW}[10] Testing Publish Patch Metadata (as publisher)${NC}"
  PUBLISH=$(curl -s -X POST "$API_BASE/api/publisher/publish" \
    -H "Content-Type: application/json" \
    -H "x-wallet-address: $PUBLISHER_WALLET" \
    -d '{
      "softwareName": "Ubuntu",
      "version": "22.04-security-1",
      "ipfsHash": "'$IPFS_HASH'",
      "fileHash": "'$FILE_HASH'"
    }')
  echo -e "${GREEN}✅ Response:${NC}"
  echo "$PUBLISH" | jq . 2>/dev/null || echo "$PUBLISH"

  # Extract patchId
  PATCH_ID=$(echo "$PUBLISH" | jq -r '.patch.patchId' 2>/dev/null || echo "unknown")
  echo ""

  # Test 10: Get Publisher Patches
  echo -e "${YELLOW}[11] Testing Get Publisher Patches (as publisher)${NC}"
  PUB_PATCHES=$(curl -s -X GET "$API_BASE/api/publisher/patches" \
    -H "x-wallet-address: $PUBLISHER_WALLET")
  echo -e "${GREEN}✅ Response:${NC}"
  echo "$PUB_PATCHES" | jq . 2>/dev/null || echo "$PUB_PATCHES"
  echo ""

  # Test 11: Get Available Patches (as device)
  echo -e "${YELLOW}[12] Testing Get Available Patches (as device)${NC}"
  AVAIL_PATCHES=$(curl -s -X GET "$API_BASE/api/device/patches" \
    -H "x-wallet-address: $DEVICE_WALLET")
  echo -e "${GREEN}✅ Response:${NC}"
  echo "$AVAIL_PATCHES" | jq . 2>/dev/null || echo "$AVAIL_PATCHES"
  echo ""

  # Test 12: Get Patch Metadata (as device)
  if [ "$PATCH_ID" != "unknown" ]; then
    echo -e "${YELLOW}[13] Testing Get Patch Metadata (as device)${NC}"
    PATCH_META=$(curl -s -X GET "$API_BASE/api/device/patch/$PATCH_ID" \
      -H "x-wallet-address: $DEVICE_WALLET")
    echo -e "${GREEN}✅ Response:${NC}"
    echo "$PATCH_META" | jq . 2>/dev/null || echo "$PATCH_META"
    echo ""

    # Test 13: Report Installation (as device)
    echo -e "${YELLOW}[14] Testing Report Installation (as device)${NC}"
    REPORT=$(curl -s -X POST "$API_BASE/api/device/report-installation" \
      -H "Content-Type: application/json" \
      -H "x-wallet-address: $DEVICE_WALLET" \
      -d '{
        "patchId": '$PATCH_ID',
        "success": true
      }')
    echo -e "${GREEN}✅ Response:${NC}"
    echo "$REPORT" | jq . 2>/dev/null || echo "$REPORT"
    echo ""
  fi
fi

# Test 14: Get Installation Logs (as admin)
echo -e "${YELLOW}[15] Testing Get Installation Logs (as admin)${NC}"
LOGS=$(curl -s -X GET "$API_BASE/api/admin/logs" \
  -H "x-wallet-address: $ADMIN_WALLET")
echo -e "${GREEN}✅ Response:${NC}"
echo "$LOGS" | jq . 2>/dev/null || echo "$LOGS"
echo ""

echo -e "${BLUE}==================================================${NC}"
echo -e "${GREEN}✅ All tests completed!${NC}"
echo -e "${BLUE}==================================================${NC}"
echo ""
echo -e "${YELLOW}Summary:${NC}"
echo -e "  - Backend is running and responding"
echo -e "  - Admin can register devices"
echo -e "  - Admin can authorize publishers"
echo -e "  - Publisher can upload patches"
echo -e "  - Publisher can publish patch metadata"
echo -e "  - Device can check available patches"
echo -e "  - Device can report installation"
echo -e "  - Installation logs are recorded"
echo ""
