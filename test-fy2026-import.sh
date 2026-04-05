#!/usr/bin/env bash
# Regression test: FY2026 department budget import → DB persistence → citizen view
# Run against Railway: BASE_URL=https://municipal-budget-dashboard-production.up.railway.app bash test-fy2026-import.sh
# Run against local:   BASE_URL=http://localhost:5000 bash test-fy2026-import.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
TENANT="essex-junction-vermont"
PASSWORD="essexjunction"

echo "=== FY2026 Department Import Regression Test ==="
echo "Target: $BASE_URL  Tenant: $TENANT"

# 1. Authenticate
echo -e "\n[1] Authenticating..."
TOKEN=$(curl -sf "$BASE_URL/api/login?tenant=$TENANT" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$PASSWORD\"}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
[ -z "$TOKEN" ] && { echo "FAIL: login returned no token"; exit 1; }
echo "    OK — token acquired"

# 2. Import FY2026 department rows (using "FY2026" year prefix to simulate AI-proposed rows)
echo -e "\n[2] POSTing FY2026 department import (with FY prefix)..."
CSV="Department,Category,Budgeted Amount,Spent Amount
\"Public Safety\",\"Police\",\"5200000\",\"0\"
\"Public Works\",\"Roads\",\"3100000\",\"0\""

COL_MAP='{"department":"Department","category":"Category","budgetedAmount":"Budgeted Amount","spentAmount":"Spent Amount"}'

IMPORT_RESP=$(curl -sf "$BASE_URL/api/upload?tenant=$TENANT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"data\":$(echo "$CSV" | jq -Rs .),\"type\":\"departments\",\"year\":\"FY2026\",\"format\":\"csv\",\"columnMap\":$COL_MAP}")
echo "    Response: $IMPORT_RESP"
echo "$IMPORT_RESP" | grep -q '"success":true' || { echo "FAIL: import did not return success"; exit 1; }
echo "    OK — import accepted"

# 3. Fetch via /api/departments/2026 (plain year — this is what citizen views use)
echo -e "\n[3] Fetching /api/departments/2026 (plain year, no FY prefix)..."
DEPTS=$(curl -sf "$BASE_URL/api/departments/2026?tenant=$TENANT")
COUNT=$(echo "$DEPTS" | grep -o '"department"' | wc -l | tr -d ' ')
echo "    Rows returned: $COUNT"
[ "$COUNT" -ge 2 ] || { echo "FAIL: expected >=2 rows at /api/departments/2026 but got $COUNT"; exit 1; }
echo "    OK"

# 4. Also verify via /api/summary/2026
echo -e "\n[4] Fetching /api/summary/2026..."
SUMMARY=$(curl -sf "$BASE_URL/api/summary/2026?tenant=$TENANT")
TOTAL=$(echo "$SUMMARY" | grep -o '"totalBudget":[0-9.]*' | cut -d: -f2)
echo "    totalBudget: $TOTAL"
[ "${TOTAL%.*}" -ge 1000000 ] || { echo "FAIL: summary totalBudget is 0 or missing"; exit 1; }
echo "    OK"

# 5. Verify /api/years includes exactly "2026" (not a duplicate "FY2026")
echo -e "\n[5] Checking /api/years for year format consistency..."
YEARS=$(curl -sf "$BASE_URL/api/years?tenant=$TENANT")
echo "    Years: $YEARS"
echo "$YEARS" | grep -q '"2026"' || { echo "FAIL: '2026' not in available years"; exit 1; }
echo "$YEARS" | grep -qv '"FY2026"' || echo "    WARNING: 'FY2026' still present (stale data from before fix) — run a fresh import to clear it"

echo -e "\n=== ALL CHECKS PASSED ==="
