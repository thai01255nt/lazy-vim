# Dependencies Guide

## Table of Contents

- [Core Dependencies](#core-dependencies)
- [Development Dependencies](#development-dependencies)
- [External Services](#external-services)
- [Environment Setup](#environment-setup)
- [Configuration Management](#configuration-management)
- [Version Management](#version-management)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Core Dependencies

### Runtime Dependencies

#### Go v1.24.4
**Purpose**: Main runtime environment for the healthcare booking service
**Documentation**: https://golang.org/doc/
**License**: BSD-3-Clause

**Installation**:
```bash
# Download and install Go 1.24.4
wget https://go.dev/dl/go1.24.4.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.24.4.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin
```

**Configuration**:
```bash
# Verify installation
go version
# Should output: go version go1.24.4 linux/amd64
```

#### Chi Router v5.2.1
**Purpose**: HTTP router and middleware for REST API endpoints
**Documentation**: https://github.com/go-chi/chi
**License**: MIT

**Installation**:
```bash
go get github.com/go-chi/chi/v5@v5.2.1
```

**Configuration**:
```go
import "github.com/go-chi/chi/v5"

r := chi.NewRouter()
r.Use(middleware.Logger)
r.Use(middleware.Recoverer)
```

**Usage Examples**:
```go
// Basic routing
r.Get("/health", healthHandler)
r.Post("/auth/register", registerHandler)

// Route groups
r.Route("/api/v1", func(r chi.Router) {
    r.Mount("/users", userRouter)
    r.Mount("/appointments", appointmentRouter)
})
```

#### pgx/v5 v5.7.5
**Purpose**: PostgreSQL driver and toolkit for database operations
**Documentation**: https://github.com/jackc/pgx
**License**: MIT

**Installation**:
```bash
go get github.com/jackc/pgx/v5@v5.7.5
```

**Configuration**:
```go
import "github.com/jackc/pgx/v5/pgxpool"

config, err := pgxpool.ParseConfig(databaseURL)
if err != nil {
    log.Fatal("Failed to parse database config:", err)
}

pool, err := pgxpool.NewWithConfig(context.Background(), config)
if err != nil {
    log.Fatal("Failed to create connection pool:", err)
}
defer pool.Close()
```

**Usage Examples**:
```go
// Query execution
rows, err := pool.Query(ctx, "SELECT id, username FROM users WHERE active = $1", true)
if err != nil {
    return err
}
defer rows.Close()

// Transaction handling
tx, err := pool.Begin(ctx)
if err != nil {
    return err
}
defer tx.Rollback(ctx)

// Commit transaction
if err := tx.Commit(ctx); err != nil {
    return err
}
```

#### Zerolog v1.34.0
**Purpose**: Structured logging library for application monitoring
**Documentation**: https://github.com/rs/zerolog
**License**: MIT

**Installation**:
```bash
go get github.com/rs/zerolog@v1.34.0
```

**Configuration**:
```go
import "github.com/rs/zerolog"

logger := zerolog.New(os.Stdout).With().
    Timestamp().
    Str("service", "venera-booking").
    Logger()

// Set global logger
zerolog.SetGlobalLevel(zerolog.InfoLevel)
```

**Usage Examples**:
```go
// Structured logging
logger.Info().
    Str("operation", "user_registration").
    Str("user_id", userID).
    Dur("duration", duration).
    Msg("User registered successfully")

// Error logging
logger.Error().
    Err(err).
    Str("operation", "database_query").
    Msg("Failed to execute query")
```

#### Viper v1.20.1
**Purpose**: Configuration management with support for multiple formats
**Documentation**: https://github.com/spf13/viper
**License**: MIT

**Installation**:
```bash
go get github.com/spf13/viper@v1.20.1
```

**Configuration**:
```go
import "github.com/spf13/viper"

viper.SetConfigName("config")
viper.SetConfigType("yaml")
viper.AddConfigPath(".")
viper.AddConfigPath("./config")

if err := viper.ReadInConfig(); err != nil {
    log.Fatal("Error reading config file:", err)
}
```

**Usage Examples**:
```go
// Reading configuration
dbHost := viper.GetString("database.host")
dbPort := viper.GetInt("database.port")
logLevel := viper.GetString("logging.level")

// Setting defaults
viper.SetDefault("server.port", 8080)
viper.SetDefault("database.max_connections", 10)
```

#### UUID v1.6.0
**Purpose**: UUID generation for unique identifiers
**Documentation**: https://github.com/google/uuid
**License**: BSD-3-Clause

**Installation**:
```bash
go get github.com/google/uuid@v1.6.0
```

**Usage Examples**:
```go
import "github.com/google/uuid"

// Generate new UUID
id := uuid.New()
fmt.Println(id.String()) // Output: 123e4567-e89b-12d3-a456-426614174000

// Parse UUID from string
parsedID, err := uuid.Parse("123e4567-e89b-12d3-a456-426614174000")
if err != nil {
    log.Fatal("Invalid UUID:", err)
}
```

## Development Dependencies

### Build Tools

#### Make
**Purpose**: Build automation and task management
**Configuration File**: `Makefile`

**Scripts**:
```bash
# Install development tools
make tools

# Start development server
make server

# Start with live reload
make air

# Tidy go modules
make tidy
```

#### Air (Live Reload)
**Purpose**: Live reloading for Go applications during development
**Installation**: Installed via `make tools`

**Configuration**:
```toml
# .air.toml
root = "."
tmp_dir = "build/air"

[build]
  cmd = "go build -o ./build/air/main ./cmd/server"
  bin = "build/air/main"
  full_bin = "./build/air/main"
  include_ext = ["go", "tpl", "tmpl", "html"]
  exclude_dir = ["assets", "tmp", "vendor", "build"]
  include_dir = []
  exclude_file = []
  log = "build-errors.log"
  delay = 1000
  stop_on_error = true
  send_interrupt = false
  kill_delay = 500
```

**Common Commands**:
```bash
# Start with live reload
air

# Start with custom config
air -c .air.toml
```

### Code Quality Tools

#### golangci-lint
**Purpose**: Go linter aggregator for code quality checks
**Installation**: Installed via `make tools`

**Configuration**:
```yaml
# .golangci.yml
linters:
  enable:
    - errcheck
    - gosimple
    - govet
    - ineffassign
    - staticcheck
    - typecheck
    - unused
    - varcheck
    - deadcode
    - structcheck

issues:
  exclude-use-default: false
  max-per-linter: 0
  max-same-issues: 0
```

**Common Commands**:
```bash
# Run all linters
golangci-lint run

# Run specific linter
golangci-lint run --enable=errcheck

# Fix auto-fixable issues
golangci-lint run --fix
```

#### goimports
**Purpose**: Go import formatter and organizer
**Installation**: Installed via `make tools`

**Usage**:
```bash
# Format imports in all Go files
goimports -w .

# Check import formatting
goimports -d .

# Format specific file
goimports -w internal/service/user.go
```

#### gofumpt
**Purpose**: Stricter Go code formatter
**Installation**: Installed via `make tools`

**Usage**:
```bash
# Format all Go files
gofumpt -w .

# Check formatting
gofumpt -d .

# Format specific file
gofumpt -w internal/service/user.go
```

## External Services

### Database Services

#### PostgreSQL
**Purpose**: Primary database for storing user accounts and healthcare data
**Version**: 12.0 or higher
**Connection**: Via pgx/v5 driver with connection pooling

**Configuration**:
```yaml
# .env.yaml
database:
  host: localhost
  port: 5432
  user: postgres
  password: your_password
  dbname: venera_booking_dev
  sslmode: disable
  max_connections: 25
  min_connections: 5
  max_connection_lifetime: 1h
  max_connection_idle_time: 30m
```

**Common Operations**:
```go
// Connection pool setup
config, err := pgxpool.ParseConfig(databaseURL)
config.MaxConns = 25
config.MinConns = 5
config.MaxConnLifetime = time.Hour
config.MaxConnIdleTime = 30 * time.Minute

pool, err := pgxpool.NewWithConfig(ctx, config)
```

### API Services (Planned)

#### Third-party Healthcare API
**Purpose**: Integration with external healthcare providers for appointment booking
**Base URL**: TBD
**Authentication**: API Key authentication

**Configuration**:
```yaml
# .env.yaml
external_apis:
  healthcare_api:
    base_url: https://api.healthcare-provider.com
    api_key: your_api_key
    timeout: 30s
    retry_attempts: 3
    retry_delay: 1s
```

**Integration Example**:
```go
type HealthcareAPIClient struct {
    baseURL    string
    apiKey     string
    httpClient *http.Client
}

func (c *HealthcareAPIClient) GetAvailableSlots(ctx context.Context, date time.Time) ([]TimeSlot, error) {
    // Implementation for external API call
}
```

### Cloud Services (Planned)

#### Email Service
**Purpose**: User notification and communication
**Service Type**: SMTP/SendGrid/AWS SES
**Region**: TBD

**Configuration**:
```yaml
# .env.yaml
email:
  provider: smtp
  host: smtp.gmail.com
  port: 587
  username: your_email@gmail.com
  password: your_app_password
  from: noreply@venera-booking.com
```

## Environment Setup

### Development Environment

```bash
# Install Go 1.24.4
curl -LO https://go.dev/dl/go1.24.4.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.24.4.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin

# Install PostgreSQL
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb venera_booking_dev

# Clone and setup project
git clone https://github.com/venera-ai/backend.git
cd venera-booking-service
make tools
```

### Production Environment

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Install Docker (optional)
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Setup production database
sudo -u postgres createdb venera_booking_prod
sudo -u postgres psql -c "CREATE USER venera_app WITH PASSWORD 'secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE venera_booking_prod TO venera_app;"

# Build production binary
CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/server cmd/server/main.go
```

### Environment Variables

```bash
# Development environment
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=your_password
export DB_NAME=venera_booking_dev
export SERVER_PORT=8081
export LOG_LEVEL=debug

# Production environment
export DB_HOST=prod-db-host
export DB_PORT=5432
export DB_USER=venera_app
export DB_PASSWORD=secure_production_password
export DB_NAME=venera_booking_prod
export SERVER_PORT=8080
export LOG_LEVEL=info
export SSL_MODE=require
```

## Configuration Management

### Configuration Files

#### .env.yaml
**Purpose**: Environment-specific configuration
**Format**: YAML

```yaml
# Database configuration
database:
  host: ${DB_HOST:localhost}
  port: ${DB_PORT:5432}
  user: ${DB_USER:postgres}
  password: ${DB_PASSWORD:}
  dbname: ${DB_NAME:venera_booking_dev}
  sslmode: ${SSL_MODE:disable}
  max_connections: ${DB_MAX_CONNECTIONS:25}

# Server configuration
server:
  host: ${SERVER_HOST:localhost}
  port: ${SERVER_PORT:8081}
  read_timeout: ${READ_TIMEOUT:30s}
  write_timeout: ${WRITE_TIMEOUT:30s}

# Logging configuration
logging:
  level: ${LOG_LEVEL:info}
  format: ${LOG_FORMAT:json}
  output: ${LOG_OUTPUT:stdout}

# External services
external_apis:
  healthcare_api:
    base_url: ${HEALTHCARE_API_URL:}
    api_key: ${HEALTHCARE_API_KEY:}
    timeout: ${API_TIMEOUT:30s}
```

#### go.mod
**Purpose**: Go module dependencies
**Format**: Go module format

```go
module github.com/venera-ai/backend

go 1.24.4

require (
    github.com/go-chi/chi/v5 v5.2.1
    github.com/google/uuid v1.6.0
    github.com/jackc/pgx/v5 v5.7.5
    github.com/rs/zerolog v1.34.0
    github.com/spf13/viper v1.20.1
)
```

### Environment-Specific Configuration

#### Development
```yaml
database:
  host: localhost
  port: 5432
  dbname: venera_booking_dev
  sslmode: disable

logging:
  level: debug
  format: console

server:
  port: 8081
```

#### Production
```yaml
database:
  host: prod-db-cluster.example.com
  port: 5432
  dbname: venera_booking_prod
  sslmode: require
  max_connections: 100

logging:
  level: info
  format: json
  output: /var/log/venera-booking/app.log

server:
  port: 8080
  read_timeout: 30s
  write_timeout: 30s
```

## Version Management

### Dependency Updates

```bash
# Check for outdated dependencies
go list -u -m all

# Update all dependencies
go get -u all

# Update specific dependency
go get -u github.com/go-chi/chi/v5

# Security audit
go list -json -m all | nancy sleuth
```

### Version Pinning Strategy

- **Major versions**: Manual updates with thorough testing
- **Minor versions**: Automated updates with CI/CD validation
- **Patch versions**: Automatic updates for security patches

### Breaking Changes

- **Chi Router v5**: Breaking changes from v4 in middleware handling
- **pgx/v5**: Breaking changes from v4 in connection pooling and context handling
- **Zerolog**: Minor breaking changes in hook system

## Security Considerations

### Dependency Security

```bash
# Check for known vulnerabilities
go list -json -m all | nancy sleuth

# Update vulnerable dependencies
go get -u github.com/vulnerable/package

# Use go mod tidy to clean up
go mod tidy
```

### Known Vulnerabilities

- **Go Standard Library**: Keep Go version updated for security patches
- **Third-party Dependencies**: Regular security audits with nancy or similar tools

### Security Best Practices

1. **Pin Dependencies**: Use exact versions in go.mod for production
2. **Regular Updates**: Schedule regular dependency updates
3. **Security Scanning**: Integrate security scanning in CI/CD pipeline
4. **Minimal Dependencies**: Only include necessary dependencies
5. **Vendor Directory**: Consider using vendor directory for critical dependencies

## Troubleshooting

### Common Issues

#### Module Not Found
**Description**: Go modules not properly initialized or dependencies missing
**Solution**: Run `go mod tidy` and ensure proper module path

**Commands**:
```bash
go mod tidy
go mod download
go clean -modcache
```

#### Database Connection Failed
**Description**: Cannot connect to PostgreSQL database
**Solution**: Check database configuration and ensure PostgreSQL is running

**Commands**:
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql -h localhost -U postgres -d venera_booking_dev

# Check configuration
cat .env.yaml | grep -A 10 database
```

#### Build Errors
**Description**: Go build failures due to missing dependencies or version conflicts
**Solution**: Clean build cache and rebuild dependencies

**Commands**:
```bash
go clean -cache
go clean -modcache
go mod download
go build ./...
```

### Debugging Commands

```bash
# Check Go environment
go env

# Check module dependencies
go mod graph

# Verify module integrity
go mod verify

# Check build constraints
go list -tags dev ./...

# Profile application
go build -race ./...
```

### Performance Optimization

- **Connection Pooling**: Optimize PostgreSQL connection pool settings
- **Query Optimization**: Use proper indexes and query optimization
- **Memory Management**: Monitor memory usage with pprof
- **Concurrent Processing**: Use goroutines for concurrent operations

---

**Last Updated**: 2025-07-16
**Version**: 1.0.0
**Generated by**: Claude Code Assistant