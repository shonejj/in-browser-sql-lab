#!/bin/bash
# DuckDB Lab - Quick Command Reference

# ============================================================================
# MAIN BUILD COMMANDS
# ============================================================================

# Full clean rebuild (recommended first time)
build_fresh() {
  echo "🧹 Cleaning up old containers and volumes..."
  docker compose down -v
  docker system prune -f
  echo "🏗️ Building fresh..."
  docker compose up -d --build
  echo "✅ Build complete! Access at http://localhost:3000"
}

# Quick rebuild without removing volumes
build_quick() {
  echo "🏗️ Quick rebuild (keeping data)..."
  docker compose up -d --build
}

# Rebuild only frontend
build_frontend() {
  echo "🎨 Rebuilding frontend only..."
  docker compose up -d --build frontend
}

# Rebuild only backend
build_backend() {
  echo "⚙️ Rebuilding backend only..."
  docker compose up -d --build backend
}

# ============================================================================
# STATUS & MONITORING
# ============================================================================

# Check all containers
status() {
  echo "📊 Container Status:"
  docker compose ps
}

# View all logs
logs_all() {
  docker compose logs -f
}

# Frontend logs only
logs_frontend() {
  docker compose logs frontend -f
}

# Backend logs only
logs_backend() {
  docker compose logs backend -f
}

# MySQL logs
logs_mysql() {
  docker compose logs mysql -f
}

# ============================================================================
# START/STOP COMMANDS
# ============================================================================

# Start all services
start() {
  echo "▶️ Starting services..."
  docker compose up -d
  echo "✅ Services started!"
}

# Stop all services (keep data)
stop() {
  echo "⏹️ Stopping services..."
  docker compose down
  echo "✅ Services stopped!"
}

# Remove everything including data
clean() {
  echo "🧹 Removing all containers and data..."
  docker compose down -v
  docker system prune -f
  echo "✅ Clean complete!"
}

# ============================================================================
# UTILITY COMMANDS
# ============================================================================

# View image sizes
sizes() {
  echo "📦 Image sizes:"
  docker images | grep ducketl
}

# Connect to backend shell
shell_backend() {
  docker compose exec backend /bin/bash
}

# Connect to frontend shell
shell_frontend() {
  docker compose exec frontend /bin/sh
}

# Execute DuckDB query via backend
query() {
  if [ -z "$1" ]; then
    echo "Usage: query 'SELECT * FROM tables'"
  else
    docker compose exec backend python -c "import duckdb; print(duckdb.query('$1').df())"
  fi
}

# ============================================================================
# TESTING
# ============================================================================

# Test backend API
test_backend() {
  echo "🧪 Testing backend API..."
  curl -s http://localhost:9876/docs | grep -q "DuckDB Lab" && echo "✅ Backend OK" || echo "❌ Backend Error"
}

# Test MySQL connection
test_mysql() {
  echo "🧪 Testing MySQL..."
  docker compose exec mysql mysql -uroot -pduckdblab -e "SELECT VERSION();" && echo "✅ MySQL OK" || echo "❌ MySQL Error"
}

# Test MinIO
test_minio() {
  echo "🧪 Testing MinIO..."
  curl -s -I http://localhost:9000/ | head -1 && echo "✅ MinIO OK" || echo "❌ MinIO Error"
}

# ============================================================================
# USAGE
# ============================================================================

show_help() {
  cat << 'EOF'
🚀 DuckDB Lab - Command Reference

MAIN COMMANDS:
  build_fresh       - Full clean rebuild (recommended)
  build_quick       - Quick rebuild keeping data
  build_frontend    - Rebuild frontend only
  build_backend     - Rebuild backend only

STATUS:
  status            - Show container status
  logs_all          - View all logs
  logs_frontend     - Frontend logs
  logs_backend      - Backend logs
  logs_mysql        - MySQL logs

CONTROL:
  start             - Start all services
  stop              - Stop all services
  clean             - Remove everything including data

UTILITIES:
  shell_backend     - Shell into backend container
  shell_frontend    - Shell into frontend container
  sizes             - Show Docker image sizes

TESTING:
  test_backend      - Test backend API
  test_mysql        - Test MySQL
  test_minio        - Test MinIO

ACCESS POINTS:
  Frontend:         http://localhost:3000
  Backend API:      http://localhost:9876
  phpMyAdmin:       http://localhost:8080 (root:duckdblab)
  MinIO Console:    http://localhost:9001 (minioadmin:minioadmin123)

EXAMPLES:
  $ build_fresh
  $ status
  $ logs_backend
  $ query "SELECT * FROM trains LIMIT 5"

EOF
}

# Show help if no argument
if [ $# -eq 0 ]; then
  show_help
fi
