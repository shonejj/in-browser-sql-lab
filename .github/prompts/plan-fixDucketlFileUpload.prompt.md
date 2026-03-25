# Plan: Fix Backend File Upload Crashes & Stabilize DuckETL

## Executive Summary

DuckETL is a sophisticated SQL IDE with impressive features (WASM mode, MySQL/PostgreSQL connectors, S3 integration, workflow builder). However, **file upload handling was not designed for production load** with large files. The entire file is loaded into memory before processing, with no streaming, chunking, or resource limits. This causes container crashes when:

- Single files > available container memory
- Multiple concurrent uploads
- Large CSV/Parquet files
- Database attachments > container memory

**Root Cause**: FastAPI's `await file.read()` in async endpoints combined with zero memory constraints in Docker compose and zero backend size validation.

---

## Critical Issues

### 🔴 ISSUE 1: NO MEMORY LIMITS ON CONTAINERS
- **File**: `docker-compose.yml`
- **Problem**: No `deploy.resources.limits.memory` defined
- **Impact**: A 2GB file upload will try to allocate 2GB+ of RAM
- **Symptoms**: Container OOM kill, sudden crash without error logs

### 🔴 ISSUE 2: ENTIRE FILES LOADED INTO MEMORY
- **Backend files**: `/api/import` and `/api/files/upload`
- **Problem**: `await file.read()` loads entire file into RAM
- **Impact**: No chunking, no streaming, no max file size limits
- **Memory Footprint**: 3x file size during import (file → RAM → temp file → DuckDB processing)

### 🔴 ISSUE 3: NO FILE SIZE VALIDATION
- **Nginx** (`nginx.conf`): `client_max_body_size 500M;` (too permissive)
- **Backend**: Zero validation on upload sizes
- **FastAPI**: Default settings could accept unlimited sizes

### 🔴 ISSUE 4: SYNCHRONOUS PROCESSING
- No async streaming or chunked processing
- All imports are synchronous, blocking other requests
- DuckDB processing happens in main thread (single process uvicorn)

### 🔴 ISSUE 5: CONCURRENT UPLOADS WITHOUT POOLING
- Multiple concurrent uploads compete for same memory in single worker
- No rate limiting or request queuing
- No connection pooling for DuckDB

### 🔴 ISSUE 6: MISSING ERROR HANDLING & CLEANUP
- No try-catch around `file.read()`
- No cleanup if DuckDB query fails mid-import
- Tempfiles may accumulate if process crashes

---

## Crash Scenarios

### Scenario 1: Single Large File Upload
- User uploads 1.5GB DuckDB file
- `file.read()` allocates 1.5GB in FastAPI worker
- Writes 1.5GB to tempfile (now 3GB total)
- DuckDB starts processing
- OOM killer triggers → **Container restarts**, user loses upload

### Scenario 2: Large MinIO Upload
- User uploads 600MB CSV to MinIO
- FileManager → `/api/files/upload`
- `await file.read()` allocates 600MB
- boto3 `put_object` tries to allocate more
- Memory exhausted → **Container crashes**

### Scenario 3: Multiple Concurrent Uploads
- 3 concurrent uploads of 200MB files each
- 3 requests to `/api/import`
- Each allocates 200MB
- Total: 600MB+ in single worker process
- Available memory exceeded → **Container OOM kill**

---

## Implementation Plan

### Step 1: Establish Docker Resource Limits
**File**: [docker-compose.yml](docker-compose.yml)
**Impact**: Immediate stability, prevents unbounded memory allocation
**Changes**:
- Add `deploy.resources.limits.memory: 1G` to backend service
- Set `deploy.resources.limits.cpus: 2` for stability
- Add health checks to detect crashes early
- Add restart policy for resilience

**Code**:
```yaml
backend:
  build: ./backend
  ports:
    - "9876:9876"
  depends_on:
    - mysql
  deploy:
    resources:
      limits:
        memory: 1G
        cpus: '2'
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9876/health"]
    interval: 30s
    timeout: 10s
    retries: 3
  restart_policy:
    condition: on-failure
    delay: 5s
    max_attempts: 3
```

### Step 2: Add Backend File Size Validation
**File**: [backend/main.py](backend/main.py)
**Impact**: Blocks oversized uploads before memory allocation
**Changes**:
- Add size constants at top: `MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024` (50MB)
- Add validation in `/api/import` before `await file.read()`
- Add validation in `/api/files/upload` before `await file.read()`
- Return 413 (Payload Too Large) for oversized files

**Code**:
```python
# At top of main.py
MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024  # 50MB for imports
MAX_MINIOS_FILE_SIZE = 500 * 1024 * 1024  # 500MB for MinIO storage

# In /api/import endpoint
@app.post("/api/import")
async def import_file(
    file: UploadFile = File(...),
    table_name: str = Form("imported_table"),
    overwrite: bool = Form(False),
):
    # Validate file size BEFORE reading
    if file.size and file.size > MAX_IMPORT_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File size exceeds {MAX_IMPORT_FILE_SIZE / 1024 / 1024:.0f}MB limit"
        )
    
    try:
        content = await file.read()
        # ... rest of implementation
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# In /api/files/upload endpoint
@app.post("/api/files/upload")
async def files_upload(
    file: UploadFile = File(...),
    bucket: str = Form("duckdb-data"),
    key: str = Form(""),
):
    # Validate file size BEFORE reading
    if file.size and file.size > MAX_MINIOS_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File size exceeds {MAX_MINIOS_FILE_SIZE / 1024 / 1024:.0f}MB limit"
        )
    
    try:
        content = await file.read()
        # ... rest of implementation
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 3: Implement Streaming File Upload
**File**: [backend/main.py](backend/main.py)
**Impact**: Eliminates memory bloat, handles files larger than container memory
**Changes**:
- Replace `await file.read()` with streaming chunk writes
- Read file in 5-10MB chunks
- Write directly to temp file without buffering in RAM
- Add try-except with cleanup on error
- Calculate progress tracking for large files

**Code**:
```python
import aiofiles
import os

CHUNK_SIZE = 5 * 1024 * 1024  # 5MB chunks

async def save_uploaded_file_streaming(file: UploadFile, temp_path: str) -> int:
    """Save uploaded file using streaming to avoid memory bloat."""
    try:
        bytes_written = 0
        async with aiofiles.open(temp_path, 'wb') as f:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                await f.write(chunk)
                bytes_written += len(chunk)
        return bytes_written
    except Exception as e:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise

# In /api/import endpoint
@app.post("/api/import")
async def import_file(
    file: UploadFile = File(...),
    table_name: str = Form("imported_table"),
    overwrite: bool = Form(False),
):
    if file.size and file.size > MAX_IMPORT_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_IMPORT_FILE_SIZE / 1024 / 1024:.0f}MB limit"
        )
    
    suffix = Path(file.filename).suffix.lower()
    safe_name = sanitize_table_name(table_name or "imported_table")
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
        
        # Use streaming instead of file.read()
        bytes_saved = await save_uploaded_file_streaming(file, tmp_path)
        
        # DuckDB reads temp file
        if suffix in (".csv", ".tsv"):
            con.execute(f"CREATE TABLE \"{safe_name}\" AS SELECT * FROM read_csv_auto('{tmp_path}')")
        # ... other formats
        
        os.unlink(tmp_path)
        return {"success": True, "table_name": safe_name, "rows": row_count}
        
    except Exception as e:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise HTTPException(status_code=500, detail=str(e))

# In /api/files/upload endpoint
@app.post("/api/files/upload")
async def files_upload(
    file: UploadFile = File(...),
    bucket: str = Form("duckdb-data"),
    key: str = Form(""),
):
    if file.size and file.size > MAX_MINIOS_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_MINIOS_FILE_SIZE / 1024 / 1024:.0f}MB limit"
        )
    
    suffix = Path(file.filename).suffix.lower()
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
        
        # Use streaming upload
        await save_uploaded_file_streaming(file, tmp_path)
        
        # Stream from temp file to MinIO
        with open(tmp_path, 'rb') as f:
            client.put_object(Bucket=bucket, Key=key, Body=f, StreamingBody=True)
        
        os.unlink(tmp_path)
        return {"success": True, "bucket": bucket, "key": key}
        
    except Exception as e:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 4: Fix Nginx Configuration
**File**: [nginx.conf](nginx.conf)
**Impact**: Align frontend limits with backend constraints
**Changes**:
- Update `client_max_body_size` to match backend limit (50MB for imports)
- Add proper timeout handling
- Add request size logging

**Code**:
```nginx
http {
    # ... existing config
    
    # Align with backend limits
    client_max_body_size 50M;  # Match MAX_IMPORT_FILE_SIZE
    
    # Timeouts for large uploads
    proxy_read_timeout 300s;
    proxy_connect_timeout 30s;
    proxy_send_timeout 300s;
    
    # Upstream backend
    upstream backend {
        server backend:9876;
    }
    
    server {
        listen 80;
        server_name _;
        
        # ... existing config
    }
}
```

### Step 5: Add Async Job Processing (Optional, for Future)
**Files**: [backend/worker.py](backend/worker.py), [backend/workflows.py](backend/workflows.py)
**Impact**: Support truly large files (>500MB) via background jobs
**When to implement**: After Steps 1-4 stabilize the system
**Approach**:
- Offload large imports to Temporal workflow tasks
- Frontend shows progress toast with status updates
- Prevents timeout on 300s nginx limit
- Allows cancellation of long-running imports

### Step 6: Improve Frontend Upload UX
**Files**: [src/components/FileManager.tsx](src/components/FileManager.tsx), [src/components/DuckDBFileAttacher.tsx](src/components/DuckDBFileAttacher.tsx), [src/components/CSVImporter.tsx](src/components/CSVImporter.tsx)
**Impact**: Better user feedback and error handling
**Changes**:
- Add client-side file size checks with warning dialogs
- Show upload progress indicators (percentage uploaded)
- Add error messages for size limit violations
- Implement retry capability for failed uploads
- Show estimated time remaining

**Code skeleton**:
```typescript
// In FileManager.tsx
const MAX_FILE_SIZE = 50 * 1024 * 1024; // Match backend

async function handleFileUpload(file: File) {
  if (file.size > MAX_FILE_SIZE) {
    toast.error(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      const percent = (e.loaded / e.total) * 100;
      setUploadProgress(percent);
    });
    
    xhr.onload = () => {
      setUploadProgress(0);
      toast.success('Upload complete');
    };
    
    xhr.onerror = () => {
      toast.error(`Upload failed: ${xhr.statusText}`);
    };
    
    xhr.open('POST', '/api/import');
    xhr.send(formData);
  } catch (error) {
    toast.error(`Upload error: ${error.message}`);
  }
}
```

---

## Implementation Priority

### Phase 1: Immediate Stability (Do First)
1. ✅ Step 1: Docker resource limits (5 min)
2. ✅ Step 2: Backend file size validation (15 min)
3. ✅ Step 4: Nginx configuration fix (5 min)

**Expected outcome**: Container won't crash on moderately large files (50-500MB range will be blocked)

### Phase 2: Memory Efficiency (Do Next)
4. ✅ Step 3: Streaming file upload (30 min)
6. ✅ Step 6: Frontend UX improvements (20 min)

**Expected outcome**: Large files can be handled without memory bloat; users get clear feedback

### Phase 3: Advanced Features (Optional, Do Later)
5. 🔄 Step 5: Async job processing via Temporal (1-2 hours)

**Expected outcome**: Support truly massive files (>1GB) via background processing

---

## Testing Strategy

### Test 1: Small file upload (< 10MB)
- Upload CSV/Parquet/DuckDB file
- Verify import succeeds
- Check memory usage stays low

### Test 2: Medium file upload (50MB)
- Upload large CSV
- Verify upload completes without timeout
- Monitor memory during upload

### Test 3: Oversized file (> 50MB with validation)
- Upload 100MB file
- Verify 413 error returned
- Check backend stays healthy

### Test 4: Concurrent uploads
- Upload 3 files simultaneously
- Verify all complete without crash
- Check memory stays under limit

### Test 5: Network interruption
- Start upload, kill connection mid-transfer
- Verify temp file cleanup
- Check backend doesn't leave orphaned files

---

## Success Criteria

- ✅ Container doesn't crash on 50MB+ file uploads
- ✅ Memory usage stays < 1GB during uploads
- ✅ Users get clear error messages for oversized files
- ✅ Streaming upload completes in reasonable time (<2 min for 50MB)
- ✅ Multiple concurrent uploads don't crash backend
- ✅ Temp files cleaned up on error

---

## Considerations & Trade-offs

### Container Memory: 512MB vs 1GB vs 2GB?
- **512MB**: Tight but scalable, supports ~50MB files max
- **1GB**: Balanced, supports ~100MB files, good for most use cases
- **2GB**: Loose, supports ~300MB+ files, less scalable
- **Recommendation**: Start with 1GB, monitor in production

### Streaming Chunk Size: 1MB vs 5MB vs 10MB?
- **1MB**: Slower I/O, more iterations, safer
- **5MB**: Balanced speed/memory (recommended)
- **10MB**: Fast but riskier, use only with >2GB container
- **Recommendation**: Use 5MB chunks

### Maximum File Sizes
- **Imports** (CSV/Parquet/JSON): 50MB (processed by DuckDB)
- **MinIO Storage** (for S3): 500MB (streamed to object store)
- **DuckDB file attachment**: 100MB (depends on container memory)
- **Recommendation**: Enforce in both Nginx and backend

### Async Job Processing
- **When needed**: If production requires >500MB file support
- **Implementation**: Use Temporal (already in docker-compose.yml)
- **Timeline**: Not needed for initial stabilization

---

## Files Affected

1. `docker-compose.yml` - Add resource limits, health checks
2. `backend/main.py` - Add validation, streaming, error handling
3. `nginx.conf` - Align max body size with backend
4. `src/components/FileManager.tsx` - Add client-side checks, progress UI
5. `src/components/DuckDBFileAttacher.tsx` - Add size validation
6. `src/components/CSVImporter.tsx` - Add progress tracking
7. `backend/requirements.txt` - Add `aiofiles` for async file I/O

---

## Rollout Plan

1. Deploy Step 1-4 changes to staging
2. Test with various file sizes
3. Verify memory usage
4. Deploy to production
5. Monitor for 24 hours
6. Roll out Steps 5-6 if needed
7. Consider async processing for future scale

---

## Success Metrics

- **Uptime**: 99.9%+ (no OOM crashes)
- **Upload success rate**: >99.5%
- **Memory stability**: Peaks at container limit, not exceeded
- **User experience**: Clear error messages, progress visibility
- **Performance**: 50MB file imports in <30 seconds
