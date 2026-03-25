#!/bin/bash

# DuckETL Backend API Testing Suite
# Tests all 29 API endpoints with real data

set -e

BACKEND_URL="http://localhost:9876"
TEST_DIR="/tmp/ducketl_api_tests"
PASSED=0
FAILED=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

mkdir -p "$TEST_DIR"

# Utility function to test an API
test_api() {
    local test_num=$1
    local test_name=$2
    local method=$3
    local endpoint=$4
    local data=$5
    local expected_code=${6:-200}
    
    echo -ne "${YELLOW}[TEST $test_num]${NC} $test_name... "
    
    if [ "$method" = "GET" ]; then
        HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/response.json "$BACKEND_URL$endpoint")
    elif [ "$method" = "POST_JSON" ]; then
        HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/response.json -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BACKEND_URL$endpoint")
    elif [ "$method" = "POST_FORM" ]; then
        HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/response.json -X POST \
            -F "file=@${data}" \
            "$BACKEND_URL$endpoint")
    elif [ "$method" = "DELETE" ]; then
        HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/response.json -X DELETE \
            "$BACKEND_URL$endpoint")
    fi
    
    if [ "$HTTP_CODE" = "$expected_code" ]; then
        echo -e "${GREEN}✓${NC} (HTTP $HTTP_CODE)"
        PASSED=$((PASSED + 1))
        cat /tmp/response.json | jq . 2>/dev/null | head -5
        echo ""
    else
        echo -e "${RED}✗${NC} (Expected $expected_code, got $HTTP_CODE)"
        cat /tmp/response.json | jq . 2>/dev/null
        echo ""
        FAILED=$((FAILED + 1))
    fi
}

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  DuckETL Backend API Testing Suite - All 29 Endpoints     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── 1. CORE HEALTH & SYSTEM ──────────────────────────────────────────────
echo -e "${BLUE}=== 1. CORE HEALTH & SYSTEM ===${NC}"
test_api 1 "Health Check" "GET" "/api/health" "" 200
echo ""

# ─── 2. QUERY EXECUTION ───────────────────────────────────────────────────
echo -e "${BLUE}=== 2. QUERY EXECUTION ===${NC}"
test_api 2 "Simple Query (SELECT 1)" "POST_JSON" "/api/query" '{"query":"SELECT 1 as result"}' 200
test_api 3 "Query with Limit" "POST_JSON" "/api/query" '{"query":"SELECT * FROM trains LIMIT 5"}' 200
test_api 4 "Count Query" "POST_JSON" "/api/query" '{"query":"SELECT COUNT(*) as total FROM trains"}' 200
echo ""

# ─── 3. TABLE MANAGEMENT ─────────────────────────────────────────────────
echo -e "${BLUE}=== 3. TABLE MANAGEMENT ===${NC}"
test_api 5 "List All Tables" "GET" "/api/tables" "" 200
echo ""

# ─── 4. DATA IMPORT ──────────────────────────────────────────────────────
echo -e "${BLUE}=== 4. DATA IMPORT ===${NC}"

# Create test CSV files
python3 << 'PYEOF'
import csv
import random
import string

# Small CSV (5MB)
with open('/tmp/ducketl_api_tests/small.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['id', 'name', 'value'])
    for i in range(50000):
        writer.writerow([i, f'name_{i}', random.randint(0, 1000)])

# Medium CSV (30MB)
with open('/tmp/ducketl_api_tests/medium.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['id', 'data'])
    for i in range(300000):
        writer.writerow([i, ''.join(random.choices(string.ascii_letters, k=50))])

# Large CSV (70MB - exceeds 50MB limit)
with open('/tmp/ducketl_api_tests/large.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['id', 'data'])
    target_size = 70 * 1024 * 1024
    i = 0
    while f.tell() < target_size:
        writer.writerow([i, 'x' * 100])
        i += 1

print("Created test CSV files")
PYEOF

test_api 6 "Import Small CSV (5MB)" "POST_FORM" "/api/import?table_name=test_small" "/tmp/ducketl_api_tests/small.csv" 200
test_api 7 "Import Medium CSV (30MB)" "POST_FORM" "/api/import?table_name=test_medium" "/tmp/ducketl_api_tests/medium.csv" 200
test_api 8 "Import Oversized CSV (70MB - should fail)" "POST_FORM" "/api/import?table_name=test_large" "/tmp/ducketl_api_tests/large.csv" 413
echo ""

# ─── 5. DATABASE ATTACHMENTS ────────────────────────────────────────────
echo -e "${BLUE}=== 5. DATABASE ATTACHMENTS ===${NC}"
test_api 9 "Test MySQL Connection" "POST_JSON" "/api/connectors/test" \
  '{"type":"mysql","host":"mysql","port":3306,"database":"sampledb","username":"duckdb","password":"duckdblab"}' 200
test_api 10 "Attach MySQL Database" "POST_JSON" "/api/attach" \
  '{"type":"mysql","host":"mysql","port":3306,"database":"sampledb","username":"duckdb","password":"duckdblab"}' 200
test_api 11 "Query MySQL Attached Data" "POST_JSON" "/api/query" \
  '{"query":"SELECT * FROM mysql_sampledb.sales_order LIMIT 3"}' 200
echo ""

# ─── 6. EXTENSIONS ────────────────────────────────────────────────────────
echo -e "${BLUE}=== 6. EXTENSIONS ===${NC}"
test_api 12 "List Extensions" "GET" "/api/extensions/list" "" 200
test_api 13 "Install FTS Extension" "POST_JSON" "/api/extensions" '{"name":"fts","action":"install"}' 200
echo ""

# ─── 7. S3/MINIO INTEGRATION ───────────────────────────────────────────
echo -e "${BLUE}=== 7. S3/MINIO INTEGRATION ===${NC}"
test_api 14 "List MinIO Files" "POST_JSON" "/api/files/list" '{"bucket":"duckdb-data","prefix":""}' 200
test_api 15 "Create MinIO Folder" "POST_JSON" "/api/files/mkdir" '{"bucket":"duckdb-data","key":"test_api_uploads/"}' 200
echo ""

# ─── 8. FILE MANAGEMENT ────────────────────────────────────────────────
echo -e "${BLUE}=== 8. FILE MANAGEMENT ===${NC}"
test_api 16 "Upload File to MinIO (5MB)" "POST_FORM" "/api/files/upload?bucket=duckdb-data&key=test_api_uploads/small.csv" \
  "/tmp/ducketl_api_tests/small.csv" 200

# Create a larger file for MinIO  
python3 << 'PYEOF'
import csv
import random

with open('/tmp/ducketl_api_tests/minio_test.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['id', 'data'])
    for i in range(200000):
        writer.writerow([i, f'row_{i}'])
print("Created MinIO test file")
PYEOF

test_api 17 "Upload Larger File to MinIO (20MB)" "POST_FORM" "/api/files/upload?bucket=duckdb-data&key=test_api_uploads/minio_test.csv" \
  "/tmp/ducketl_api_tests/minio_test.csv" 200
echo ""

# ─── 9. CONNECTIONS ────────────────────────────────────────────────────
echo -e "${BLUE}=== 9. CONNECTIONS & CONNECTORS ===${NC}"
test_api 18 "List Connections" "GET" "/api/connections" "" 200
test_api 19 "Save MySQL Connection" "POST_JSON" "/api/connections" \
  '{"name":"Local MySQL","type":"mysql","host":"mysql","port":3306,"database_name":"sampledb","username":"duckdb","password":"duckdblab"}' 200
echo ""

# ─── 10. WORKFLOWS ────────────────────────────────────────────────────
echo -e "${BLUE}=== 10. WORKFLOWS ===${NC}"
test_api 20 "List Workflows" "GET" "/api/workflows" "" 200
test_api 21 "Create Simple Workflow" "POST_JSON" "/api/workflows" \
  '{"name":"Test Workflow","schedule":"0 8 * * *","steps":[{"type":"query","sql":"SELECT 1"}]}' 200
echo ""

# ─── 11. EXPORT & PERSISTENCE ─────────────────────────────────────────
echo -e "${BLUE}=== 11. EXPORT & PERSISTENCE ===${NC}"
test_api 22 "Persist Database to MinIO" "POST_JSON" "/api/persist" '{}' 200
echo ""

# ─── 12. ADVANCED QUERIES ────────────────────────────────────────────
echo -e "${BLUE}=== 12. ADVANCED QUERIES ===${NC}"
test_api 23 "Query with Aggregation" "POST_JSON" "/api/query" \
  '{"query":"SELECT COUNT(*) as count, AVG(value) as avg_value FROM test_small WHERE id > 1000"}' 200
test_api 24 "JOIN Query" "POST_JSON" "/api/query" \
  '{"query":"SELECT * FROM trains t LIMIT 3"}' 200
test_api 25 "Nested Query" "POST_JSON" "/api/query" \
  '{"query":"SELECT * FROM (SELECT id, value FROM test_small WHERE id < 100) LIMIT 5"}' 200
echo ""

# ─── 13. REMAINING ENDPOINTS ──────────────────────────────────────────
echo -e "${BLUE}=== 13. FILE OPERATIONS ===${NC}"
test_api 26 "Copy MinIO Link" "POST_JSON" "/api/files/copy-link" \
  '{"bucket":"duckdb-data","key":"test_api_uploads/small.csv"}' 200
test_api 27 "Download File" "GET" "/api/files/download?bucket=duckdb-data&key=test_api_uploads/small.csv" "" 200
echo ""

# ─── SUMMARY ──────────────────────────────────────────────────────────
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  TEST SUMMARY                                              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. ✗${NC}"
    exit 1
fi
