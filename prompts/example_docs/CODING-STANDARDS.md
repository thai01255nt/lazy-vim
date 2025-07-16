# Coding Standards

## Table of Contents

- [Naming Conventions](#naming-conventions)
- [File Organization](#file-organization)
- [Code Structure](#code-structure)
- [Error Handling](#error-handling)
- [Logging Standards](#logging-standards)
- [Security Practices](#security-practices)
- [Performance Guidelines](#performance-guidelines)
- [Testing Standards](#testing-standards)
- [Documentation Requirements](#documentation-requirements)
- [Code Review Guidelines](#code-review-guidelines)

## Naming Conventions

### Variables and Functions
- **Pattern**: camelCase for private, PascalCase for public
- **Examples**:
  - ✅ `userService`, `getUserByID`, `CreateUser`
  - ❌ `user_service`, `get_user_by_id`, `create_user`

### Classes and Interfaces
- **Pattern**: PascalCase with descriptive names
- **Examples**:
  - ✅ `UserService`, `PostgresRepository`, `AuthMiddleware`
  - ❌ `userservice`, `postgres_repository`, `auth_middleware`

### Files and Directories
- **Pattern**: snake_case for files, camelCase for directories
- **Examples**:
  - ✅ `user_service.go`, `auth_middleware.go`, `internal/service/`
  - ❌ `UserService.go`, `AuthMiddleware.go`, `internal/Service/`

### Constants and Enums
- **Pattern**: PascalCase for public constants, camelCase for private
- **Examples**:
  - ✅ `MaxRetryAttempts`, `DefaultTimeout`, `envKeyDatabaseURL`
  - ❌ `MAX_RETRY_ATTEMPTS`, `default_timeout`, `ENV_KEY_DATABASE_URL`

### Database and API Naming
- **Tables**: snake_case with plural nouns (`users`, `appointments`)
- **Columns**: snake_case (`created_at`, `user_id`, `appointment_time`)
- **Endpoints**: kebab-case with REST conventions (`/api/v1/users`, `/auth/login`)

## File Organization

### Project Structure

```
venera-booking-service/
├── cmd/                    # Application entry points
│   └── server/
│       └── main.go
├── internal/              # Private application code
│   ├── consts/           # Application constants
│   ├── dto/              # Data transfer objects
│   │   ├── request/
│   │   └── response/
│   ├── middleware/       # HTTP middleware
│   ├── model/           # Domain models
│   ├── repository/      # Data access layer
│   ├── router/          # HTTP route handlers
│   ├── service/         # Business logic layer
│   └── util/            # Internal utilities
├── pkg/                  # Public library code
│   ├── dataUtil/        # Data manipulation utilities
│   ├── db/              # Database utilities
│   ├── ptypes/          # Public types
│   └── validator/       # Validation utilities
├── migrations/          # Database migrations
├── scripts/             # Build and deployment scripts
└── docs/               # Documentation
```

### File Organization Rules
1. **Separate concerns**: Each package has single responsibility
2. **Layer separation**: Clear boundaries between layers (router -> service -> repository)
3. **Public vs Private**: Use `internal/` for application-specific code, `pkg/` for reusable libraries

### Import Organization
```go
// 1. Standard library imports
import (
    "context"
    "fmt"
    "net/http"
)

// 2. Third-party library imports
import (
    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"
    "github.com/rs/zerolog"
)

// 3. Internal imports (absolute)
import (
    "github.com/venera-ai/backend/internal/consts"
    "github.com/venera-ai/backend/internal/service"
    "github.com/venera-ai/backend/pkg/ptypes"
)
```

## Code Structure

### Function Structure

```go
/**
 * AddUser creates a new user in the system
 * @param ctx context.Context - Request context for cancellation
 * @param req dtoRequest.RegisterBody - User registration data
 * @returns model.User - Created user object
 * @throws error - Validation or database errors
 */
func (s *User) Add(ctx context.Context, req dtoRequest.RegisterBody) (model.User, error) {
    // 1. Input validation
    if err := validateUserInput(req); err != nil {
        return model.User{}, err
    }

    // 2. Business logic
    hashedPassword, err := hashPassword(req.Password)
    if err != nil {
        return model.User{}, err
    }

    // 3. Data persistence
    user := model.User{
        Username: ptypes.NewUndefineable(req.Username),
        Email:    ptypes.NewUndefineable(req.Email),
        Password: ptypes.NewUndefineable(hashedPassword),
    }

    return s.userRepo.Create(ctx, user)
}
```

### Struct Structure

```go
/**
 * User represents a patient user in the healthcare system
 */
type User struct {
    // Primary identifiers
    Id        ptypes.Undefineable[uuid.UUID]   `json:"id,omitzero"`
    Username  ptypes.Undefineable[string]      `json:"username,omitzero"`
    Email     ptypes.Undefineable[string]      `json:"email,omitzero"`
    
    // Security fields
    Password  ptypes.Undefineable[string]      `json:"password,omitzero"`
    
    // Additional information
    Infos     ptypes.Undefineable[string]      `json:"infos,omitzero"`
    
    // Timestamps
    CreatedAt ptypes.Undefineable[itypes.Time] `json:"createdAt,omitzero"`
    UpdatedAt ptypes.Undefineable[itypes.Time] `json:"updatedAt,omitzero"`
}
```

### Service Structure

```go
// Service layer pattern
type User struct {
    postgresService *Postgres
    userRepo        *repository.User
}

func NewUser(postgresService *Postgres, userRepo *repository.User) *User {
    return &User{
        postgresService: postgresService,
        userRepo:        userRepo,
    }
}

func (s *User) methodName(ctx context.Context, params ParamType) (ReturnType, error) {
    // Implementation
}
```

## Error Handling

### Error Types

- **ValidationError**: Input validation failures
- **BusinessLogicError**: Business rule violations
- **DatabaseError**: Database operation failures
- **ExternalAPIError**: Third-party service failures

### Error Handling Pattern

```go
func (s *User) Add(ctx context.Context, req dtoRequest.RegisterBody) (model.User, error) {
    // Validation
    if err := validateUserInput(req); err != nil {
        consts.Logger.Error().Err(err).Msg("User validation failed")
        return model.User{}, ptypes.NewApiError(
            400,
            40001,
            "Validation failed",
            err.Error(),
        )
    }

    // Business logic
    user, err := s.userRepo.Create(ctx, userModel)
    if err != nil {
        consts.Logger.Error().Err(err).Msg("Failed to create user")
        return model.User{}, ptypes.NewApiError(
            500,
            50001,
            "Internal server error",
            "Failed to create user account",
        )
    }

    return user, nil
}
```

### Custom Error Response Format

```go
type ApiError struct {
    StatusCode int    `json:"-"`
    Code       int    `json:"code"`
    Message    string `json:"message"`
    Details    string `json:"details,omitempty"`
}

func (e ApiError) Error() string {
    return e.Message
}

func (e ApiError) Response(w http.ResponseWriter) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(e.StatusCode)
    json.NewEncoder(w).Encode(e)
}
```

## Logging Standards

### Log Levels

- **Error**: System errors, failed operations
- **Warn**: Recoverable issues, deprecated usage
- **Info**: General application flow, successful operations
- **Debug**: Detailed diagnostic information

### Logging Pattern

```go
import "github.com/venera-ai/backend/internal/consts"

// Info logging
consts.Logger.Info().
    Str("operation", "user_registration").
    Str("user_id", user.Id.String()).
    Msg("User registered successfully")

// Error logging
consts.Logger.Error().
    Err(err).
    Str("operation", "database_query").
    Str("query", "INSERT INTO users").
    Msg("Database operation failed")

// Debug logging
consts.Logger.Debug().
    Interface("request", req).
    Str("handler", "register").
    Msg("Processing registration request")
```

### Log Format

```
2025-07-16T10:30:45Z INF User registered successfully operation=user_registration user_id=123e4567-e89b-12d3-a456-426614174000
2025-07-16T10:30:46Z ERR Database operation failed error="connection timeout" operation=database_query query="INSERT INTO users"
```

### What to Log

- **✅ Do Log**: 
  - User actions (login, registration, booking)
  - External API calls
  - Database operations
  - Error conditions
  - Performance metrics

- **❌ Don't Log**: 
  - Passwords or sensitive data
  - Personal health information
  - API keys or secrets
  - Large request/response bodies

## Security Practices

### Input Validation

```go
import "github.com/venera-ai/backend/pkg/validator"

func validateUserInput(req dtoRequest.RegisterBody) error {
    v := validator.New()
    
    // Username validation
    if err := v.ValidateString(req.Username, validator.Option{
        MinLength: 3,
        MaxLength: 50,
        Pattern:   "^[a-zA-Z0-9_]+$",
    }); err != nil {
        return fmt.Errorf("username validation failed: %w", err)
    }
    
    // Email validation
    if err := v.ValidateEmail(req.Email); err != nil {
        return fmt.Errorf("email validation failed: %w", err)
    }
    
    return nil
}
```

### Password Security

```go
import "golang.org/x/crypto/bcrypt"

func hashPassword(password string) (string, error) {
    bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    if err != nil {
        return "", err
    }
    return string(bytes), nil
}

func checkPasswordHash(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}
```

### Environment Variables

```go
// ✅ Secure environment variable usage
func initDatabaseConfig() DatabaseConfig {
    return DatabaseConfig{
        Host:     os.Getenv("DB_HOST"),
        Port:     os.Getenv("DB_PORT"),
        User:     os.Getenv("DB_USER"),
        Password: os.Getenv("DB_PASSWORD"),
        Name:     os.Getenv("DB_NAME"),
    }
}

// ❌ Never hardcode secrets
const DatabasePassword = "hardcoded_password" // Never do this!
```

## Performance Guidelines

### Database Queries

```go
// ✅ Efficient query with context
func (r *User) FindByEmail(ctx context.Context, email string) (model.User, error) {
    query := `SELECT id, username, email, created_at, updated_at 
              FROM users 
              WHERE email = $1 
              LIMIT 1`
    
    var user model.User
    err := r.db.QueryRowContext(ctx, query, email).Scan(
        &user.Id,
        &user.Username,
        &user.Email,
        &user.CreatedAt,
        &user.UpdatedAt,
    )
    
    return user, err
}

// ❌ Inefficient query without pagination
func (r *User) GetAllUsers() ([]model.User, error) {
    query := `SELECT * FROM users` // No LIMIT, potential performance issue
    // ...
}
```

### Resource Management

```go
// ✅ Proper resource cleanup
func (s *User) processLargeFile(filename string) error {
    file, err := os.Open(filename)
    if err != nil {
        return err
    }
    defer file.Close() // Always close resources
    
    // Process file
    return nil
}

// ✅ Context with timeout
func (s *User) callExternalAPI(ctx context.Context, url string) error {
    ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
    defer cancel()
    
    req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
    if err != nil {
        return err
    }
    
    // Make request
    return nil
}
```

## Testing Standards

### Test File Organization

```
internal/
├── service/
│   ├── user.go
│   └── user_test.go
├── repository/
│   ├── user.go
│   └── user_test.go
└── router/
    ├── auth.go
    └── auth_test.go
```

### Test Structure

```go
package service

import (
    "context"
    "testing"
    
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
)

func TestUser_Add(t *testing.T) {
    // Arrange
    mockRepo := &MockUserRepository{}
    userService := NewUser(nil, mockRepo)
    
    req := dtoRequest.RegisterBody{
        Username: "testuser",
        Email:    "test@example.com",
        Password: "password123",
    }
    
    expectedUser := model.User{
        Username: ptypes.NewUndefineable("testuser"),
        Email:    ptypes.NewUndefineable("test@example.com"),
    }
    
    mockRepo.On("Create", mock.Anything, mock.Anything).Return(expectedUser, nil)
    
    // Act
    result, err := userService.Add(context.Background(), req)
    
    // Assert
    assert.NoError(t, err)
    assert.Equal(t, expectedUser.Username, result.Username)
    assert.Equal(t, expectedUser.Email, result.Email)
    mockRepo.AssertExpectations(t)
}
```

### Test Coverage Requirements

- **Minimum Coverage**: 80%
- **Critical Components**: 90%
- **Test Types Required**: Unit tests for all services, integration tests for repositories

## Documentation Requirements

### Function Documentation

```go
/**
 * Add creates a new user account in the healthcare system
 *
 * This function validates user input, hashes the password, and creates
 * a new user record in the database. It follows HIPAA guidelines for
 * patient data handling.
 *
 * @param ctx context.Context - Request context for cancellation and tracing
 * @param req dtoRequest.RegisterBody - User registration data including username, email, and password
 * @returns model.User - The created user object with generated ID and timestamps
 * @throws error - Returns validation errors (400) or database errors (500)
 *
 * @example
 * user, err := userService.Add(ctx, dtoRequest.RegisterBody{
 *     Username: "patient123",
 *     Email: "patient@example.com",
 *     Password: "securepassword",
 * })
 */
func (s *User) Add(ctx context.Context, req dtoRequest.RegisterBody) (model.User, error) {
    // Implementation
}
```

### Package Documentation

```go
/**
 * Package service implements the business logic layer for the healthcare booking system.
 * 
 * This package contains services that orchestrate between the presentation layer (routers)
 * and the data access layer (repositories). All business rules and healthcare-specific
 * logic should be implemented here.
 */
package service
```

## Code Review Guidelines

### Pre-Review Checklist

- [ ] Code follows Go naming conventions
- [ ] Proper error handling with logging
- [ ] Input validation for all public functions
- [ ] Security best practices followed
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] No hardcoded secrets or sensitive data

### Review Focus Areas

1. **Logic & Correctness**: Verify business logic implementation
2. **Code Quality**: Check for readability, maintainability, and Go idioms
3. **Security**: Ensure proper input validation and secret handling
4. **Performance**: Check for efficient database queries and resource usage
5. **Testing**: Verify adequate test coverage and quality

### Approval Criteria

- **Code Quality**: Follows established patterns and conventions
- **Test Coverage**: Minimum 80% coverage for new code
- **Documentation**: All public functions and types documented
- **Security**: No security vulnerabilities or sensitive data exposure

---

**Last Updated**: 2025-07-16
**Version**: 1.0.0
**Generated by**: Claude Code Assistant