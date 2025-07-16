# Developer Guide

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Build Process](#build-process)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/venera-ai/backend.git
cd venera-booking-service

# Install development tools
make tools

# Create environment configuration
# Create .env.yaml file in project root

# Start development server
make server

# Or use live reload for development
make air
```

**Access the application:**
- **Backend API**: http://localhost:8081
- **Health Check**: http://localhost:8081/health (planned)
- **API Documentation**: http://localhost:8081/docs (planned)

## Prerequisites

### System Requirements

- **Go**: 1.24.4 or higher
- **PostgreSQL**: 12.0 or higher
- **Make**: Build automation tool
- **Git**: Version control system

### Development Tools

- **Air**: Live reload for Go applications
- **golangci-lint**: Go code linter
- **goimports**: Go import formatter
- **gofumpt**: Go code formatter

### Optional Tools

- **Docker**: For containerized development
- **Postman**: API testing
- **pgAdmin**: PostgreSQL database management

## Installation

### 1. Environment Setup

```bash
# Install Go (if not already installed)
# Visit https://golang.org/dl/ for installation instructions

# Verify Go installation
go version

# Clone the repository
git clone https://github.com/venera-ai/backend.git
cd venera-booking-service
```

### 2. Dependencies Installation

```bash
# Install all dependencies and development tools
make tools

# This will:
# - Run go mod tidy
# - Install development tools (golangci-lint, goimports, gofumpt, air)
# - Tools will be installed in the bin/ folder
```

### 3. Database Setup

```bash
# Create PostgreSQL database
createdb venera_booking_dev

# Run database migrations
# (Migration system to be implemented)
# psql -d venera_booking_dev -f migrations/001_create_users_table.postgres.sql
```

### 4. Configuration

Create a `.env.yaml` file in the project root:

```yaml
# Database configuration
database:
  host: localhost
  port: 5432
  user: your_db_user
  password: your_db_password
  dbname: venera_booking_dev
  sslmode: disable

# Server configuration
server:
  host: localhost
  port: 8081

# Logging configuration
logger:
  level: info
  format: json

# Third-party API configuration
external_apis:
  healthcare_api:
    base_url: https://api.healthcare-provider.com
    api_key: your_api_key
    timeout: 30s
```

## Development Workflow

### Daily Development

```bash
# Start development server with live reload
make air

# Run tests (when implemented)
go test ./...

# Format code
gofumpt -w .

# Run linter
golangci-lint run

# Check imports
goimports -w .
```

### Feature Development

1. **Create feature branch**: `git checkout -b feature/appointment-booking`
2. **Develop feature**: Follow clean architecture patterns
3. **Write tests**: Add unit and integration tests
4. **Run quality checks**: `make tools && golangci-lint run`
5. **Create pull request**: Follow PR template
6. **Code review**: Address feedback
7. **Merge to main**: After approval

### Database Changes

```bash
# Create new migration file
touch migrations/002_create_appointments_table.postgres.sql

# Write migration SQL
# Run migration (manual for now)
psql -d venera_booking_dev -f migrations/002_create_appointments_table.postgres.sql

# Update model structs in internal/model/
# Update repository methods in internal/repository/
```

## Testing

### Test Types

- **Unit Tests**: Test individual functions and methods
- **Integration Tests**: Test service interactions
- **End-to-End Tests**: Test complete API workflows

### Running Tests

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run tests with verbose output
go test -v ./...

# Run specific test package
go test ./internal/service/...
```

### Test Coverage

- **Minimum Coverage**: 80%
- **Critical Components**: 90%
- **Test Types Required**: Unit tests for all services and repositories

## Build Process

### Development Build

```bash
# Build for development
go build -o bin/server cmd/server/main.go
```

### Production Build

```bash
# Build for production with optimizations
go build -ldflags="-s -w" -o bin/server cmd/server/main.go

# Or using CGO disabled for static binary
CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/server cmd/server/main.go
```

### Build Optimization

- **Binary Size**: Using ldflags for smaller binaries
- **Static Binary**: CGO_ENABLED=0 for containerized deployments
- **Multi-stage Docker**: Planned for containerized builds

## Common Tasks

### Code Quality

```bash
# Format code
gofumpt -w .

# Fix imports
goimports -w .

# Run linter
golangci-lint run

# Fix linting issues (some can be auto-fixed)
golangci-lint run --fix

# Type checking (Go native)
go vet ./...
```

### Database Operations

```bash
# Connect to database
psql -d venera_booking_dev

# Run migration
psql -d venera_booking_dev -f migrations/001_create_users_table.postgres.sql

# Seed database (to be implemented)
# go run scripts/seed.go

# Backup database
pg_dump venera_booking_dev > backup.sql
```

### Debugging

```bash
# Start with debug logging
LOG_LEVEL=debug make server

# View server logs
tail -f logs/server.log

# Run with race detector
go run -race cmd/server/main.go

# Profile application
go run -cpuprofile cpu.prof cmd/server/main.go
```

## Troubleshooting

### Common Issues

1. **Port already in use**: Change port in main.go or kill process using port 8081
2. **Database connection failed**: Check PostgreSQL service and credentials in .env.yaml
3. **Module not found**: Run `go mod tidy` to resolve dependencies

### Debug Commands

```bash
# Check Go environment
go env

# Check module dependencies
go mod graph

# Clean module cache
go clean -modcache

# Rebuild everything
go clean -cache && go build ./...
```

## Contributing

### Code Standards

- Follow [CODING-STANDARDS.md](./CODING-STANDARDS.md)
- Use [LLM-CONTEXT.md](./LLM-CONTEXT.md) for healthcare domain context

### Pull Request Process

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/your-feature`
3. **Write tests**: Ensure good test coverage
4. **Follow commit conventions**: Use conventional commits
5. **Submit pull request**: Include description and testing notes
6. **Address review feedback**: Make necessary changes

### Commit Convention

```
type(scope): description

Examples:
feat(auth): add user registration endpoint
fix(db): resolve connection pool leak
docs(readme): update installation instructions
refactor(service): improve user service structure
```

### Development Environment

The project includes `.vscode/` configuration for Visual Studio Code with:
- Go extension settings
- Linting configuration
- Debug configurations
- Recommended extensions

---

**Last Updated**: 2025-07-16
**Version**: 1.0.0
**Generated by**: Claude Code Assistant