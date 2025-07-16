# LLM Context & Development Patterns

## Table of Contents

- [Project Context](#project-context)
- [Domain Terminology](#domain-terminology)
- [Code Patterns to Follow](#code-patterns-to-follow)
- [Common Workflows](#common-workflows)
- [Reusable Components](#reusable-components)
- [Business Rules & Constraints](#business-rules--constraints)
- [Error Handling Patterns](#error-handling-patterns)
- [Development Guidelines](#development-guidelines)
- [Quick Reference](#quick-reference)

## Project Context

### AI Development Guidelines
This document provides context for AI assistants working on the Venera Healthcare Booking Service codebase. Always refer to this file for:
- **Healthcare-specific terminology** and business concepts
- **Go code patterns** that should be consistently followed
- **Reusable functions** and components to avoid duplication
- **Business rules** specific to healthcare booking systems
- **Security considerations** for handling patient data

### Key Principles for AI Development
1. **Reuse First**: Always check existing services and utilities before implementing new ones
2. **Follow Clean Architecture**: Maintain clear separation between layers (router -> service -> repository)
3. **Healthcare Compliance**: Ensure all code follows healthcare data protection guidelines
4. **Security First**: Always validate inputs and protect sensitive patient information
5. **Maintain Consistency**: Use established patterns for error handling, logging, and responses

## Domain Terminology

### Healthcare Business Terms
- **Patient**: End user who books medical appointments (stored in users table)
  - **Usage**: Primary user entity in the system
  - **Related Code**: `model.User`, `service.User`, `repository.User`

- **Appointment**: Medical consultation booking between patient and healthcare provider
  - **Usage**: Core business entity for booking management
  - **Related Code**: Planned `model.Appointment`, `service.Appointment` (to be implemented)

- **Healthcare Provider**: Medical professional or facility offering services
  - **Usage**: Service provider in the booking system
  - **Related Code**: Future `model.Provider` (to be implemented)

- **Time Slot**: Available time periods for appointment booking
  - **Usage**: Availability management for appointment scheduling
  - **Related Code**: Future `model.TimeSlot` (to be implemented)

- **Booking**: The act of reserving an appointment slot
  - **Usage**: Core business process of the application
  - **Related Code**: Future booking workflow services

### Technical Terms
- **Session Manager**: Database transaction management system
  - **Usage**: `scope.SessionManager[*pool.PostgresTx]` for database operations
  - **Related Code**: `pkg/db/scope/base.go`

- **Undefineable**: Custom type for optional/nullable fields
  - **Usage**: `ptypes.Undefineable[T]` for all optional model fields
  - **Related Code**: `pkg/ptypes/undefineable.go`

- **SQL Builder**: Query construction utility for PostgreSQL
  - **Usage**: Dynamic query building in repositories
  - **Related Code**: `pkg/sqlbuilder/postgres/`

### Common Abbreviations
- **DTO**: Data Transfer Object (request/response structures)
- **API**: Application Programming Interface
- **UUID**: Universally Unique Identifier
- **JSONB**: JSON Binary format in PostgreSQL
- **HIPAA**: Health Insurance Portability and Accountability Act

## Code Patterns to Follow

### Service Layer Pattern
```go
// ✅ Always use this pattern for service classes
type User struct {
    postgresService *Postgres
    userRepo        *repository.User
    sm              *scope.SessionManager[*pool.PostgresTx]
}

func NewUser(postgresService *Postgres, userRepo *repository.User) *User {
    return &User{
        postgresService: postgresService,
        userRepo:        userRepo,
        sm:              postgresService.sm,
    }
}

func (s *User) Add(ctx context.Context, body *dtoRequest.RegisterBody) (*model.User, *ptypes.ApiError) {
    // 1. Input validation (via DTO validation)
    if err := dtoRequest.RegisterBodyDto(body); err != nil {
        return nil, err
    }

    // 2. Business logic transformation
    user := model.User{}
    if err := dataUtil.CopyWithoutStrict(&user, body); err != nil {
        panic(err) // Internal error, should not happen
    }

    // 3. Session management
    _, cleanup := s.sm.GetSession(ctx)
    var cleanupErr error
    defer cleanup(&cleanupErr, middleware.CreateLogEvent(ctx, zerolog.InfoLevel))

    // 4. Repository operation
    insertQuery := s.userRepo.BaseRepo.Insert(&user, nil, true)
    userRows := s.postgresService.Query(ctx, insertQuery)
    defer userRows.Close()

    // 5. Result processing
    users, databaseErr := ScanPgxRows[model.User](userRows)
    if databaseErr != nil {
        return nil, s.handleDatabaseError(databaseErr)
    }

    return &users[0], nil
}
```

### Repository Pattern
```go
// ✅ Always use this pattern for data access
type User struct {
    Sb       *postgres.Sqlbuilder
    BaseRepo *Postgres[model.User]
}

func NewUser() *User {
    sb := postgres.NewBaseQueryBuilder(consts.Db.CoreSchema, "users")
    return &User{
        Sb:       sb,
        BaseRepo: NewPostgres[model.User](sb),
    }
}

func (r *User) GetByUsername(username string) *postgres.SqlQuery {
    cond := postgres.SqlCondition{
        Logical: "and",
        Conditions: []any{
            postgres.ConditionItem{
                Field: "username",
                Op:    postgres.OpEq,
                Value: username,
            },
        },
    }
    return r.BaseRepo.GetByCondition(cond)
}
```

### Router Pattern
```go
// ✅ Always use this pattern for API endpoints
type Auth struct {
    Router      *chi.Mux
    UserService *service.User
}

func NewAuth(userService *service.User) *Auth {
    r := chi.NewRouter()
    router := &Auth{
        Router:      r,
        UserService: userService,
    }
    
    // Register routes
    r.Get("/login", router.login)
    r.Post("/register", router.register)
    
    return router
}

func (a *Auth) register(w http.ResponseWriter, r *http.Request) {
    // 1. Parse request body
    body, err := util.GetRequestBody[dtoRequest.RegisterBody](r)
    if err != nil {
        err.Response(w)
        return
    }

    // 2. Validate input
    if err := dtoRequest.RegisterBodyDto(body); err != nil {
        err.Response(w)
        return
    }

    // 3. Service call
    user, err := a.UserService.Add(r.Context(), body)
    if err != nil {
        err.Response(w)
        return
    }

    // 4. Response formatting
    dataUtil.ExcludeFields(&user, []string{"password"})
    res := ptypes.NewApiResponse(201, 201, consts.Message.CREATED, user)
    res.Response(w)
}
```

### Error Handling Pattern
```go
// ✅ Always use this pattern for error handling
func (s *User) handleDatabaseError(databaseErr error) *ptypes.ApiError {
    if pgErr, ok := databaseErr.(*pgconn.PgError); ok {
        // Handle specific PostgreSQL errors
        if strings.Contains(pgErr.Message, "username") {
            return ptypes.NewApiError(
                400, 400,
                consts.Message.BAD_REQUEST,
                &ptypes.ErrorDetail{"username": "Username already exists"},
            )
        } else if strings.Contains(pgErr.Message, "email") {
            return ptypes.NewApiError(
                400, 400,
                consts.Message.BAD_REQUEST,
                &ptypes.ErrorDetail{"email": "Email already exists"},
            )
        }
    }
    
    // Log and return generic error
    consts.Logger.Error().Err(databaseErr).Msg("Database operation failed")
    return ptypes.NewApiError(
        500, 500,
        consts.Message.INTERNAL_SERVER_ERROR,
        nil,
    )
}
```

## Common Workflows

### User Registration Flow
```go
// 1. Request validation
body, err := util.GetRequestBody[dtoRequest.RegisterBody](r)
if err != nil {
    err.Response(w)
    return
}

// 2. DTO validation
if err := dtoRequest.RegisterBodyDto(body); err != nil {
    err.Response(w)
    return
}

// 3. Service processing
user, err := userService.Add(r.Context(), body)
if err != nil {
    err.Response(w)
    return
}

// 4. Response sanitization
dataUtil.ExcludeFields(&user, []string{"password"})

// 5. Response formatting
res := ptypes.NewApiResponse(201, 201, consts.Message.CREATED, user)
res.Response(w)
```

### Database Operation Flow
```go
// 1. Session management
_, cleanup := s.sm.GetSession(ctx)
var cleanupErr error
defer cleanup(&cleanupErr, middleware.CreateLogEvent(ctx, zerolog.InfoLevel))

// 2. Query building
insertQuery := s.userRepo.BaseRepo.Insert(&user, nil, true)

// 3. Query execution
userRows := s.postgresService.Query(ctx, insertQuery)
defer userRows.Close()

// 4. Result scanning
users, databaseErr := ScanPgxRows[model.User](userRows)
if databaseErr != nil {
    cleanupErr = errors.New("") // Mark transaction for rollback
    return nil, s.handleDatabaseError(databaseErr)
}

return &users[0], nil
```

### Healthcare API Integration Flow (Future)
```go
// 1. External API request preparation
apiClient := external.NewHealthcareAPIClient(config)
request := external.AppointmentRequest{
    PatientID:    userID,
    ProviderID:   providerID,
    RequestedTime: appointmentTime,
}

// 2. External API call with timeout
ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
defer cancel()

response, err := apiClient.BookAppointment(ctx, request)
if err != nil {
    return nil, s.handleExternalAPIError(err)
}

// 3. Response processing and local storage
appointment := s.mapExternalToInternal(response)
return s.appointmentRepo.Save(ctx, appointment)
```

## Reusable Components

### Utility Functions
```go
// ✅ Always use these existing utilities

// Data transformation
dataUtil.CopyWithoutStrict(&dst, &src) // Copy between structs
dataUtil.ExcludeFields(&obj, []string{"password"}) // Remove sensitive fields

// Request handling
util.GetRequestBody[T](r) // Parse JSON request body

// Type utilities
ptypes.NewUndefineable(value) // Create optional field
ptypes.NewApiResponse(httpCode, statusCode, message, data) // Create API response
ptypes.NewApiError(httpCode, statusCode, message, details) // Create API error
```

### Common Services
```go
// ✅ Always use these existing services

// Database service
postgresService := service.NewPostgres(sessionManager)
userRows := postgresService.Query(ctx, query)

// User service
userService := service.NewUser(postgresService, userRepo)
user, err := userService.Add(ctx, registerBody)

// Repository services
userRepo := repository.NewUser()
query := userRepo.GetByUsername("patient123")
```

### Middleware Components
```go
// ✅ Always use these existing middleware

// Request middleware
r.Use(imiddleware.RequestID)      // Generate request ID
r.Use(imiddleware.Logger)         // Log requests
r.Use(imiddleware.CustomRecoverer) // Panic recovery
r.Use(imiddleware.PreserveOriginalBody) // Preserve request body
r.Use(imiddleware.MaxBytesBody(1024 * 1024)) // Limit request size

// Database middleware
r.Use(scope.SessionID) // Database session management
```

### Database Helpers
```go
// ✅ Always use these existing database helpers

// Query builders
sb := postgres.NewBaseQueryBuilder(schema, table)
baseRepo := repository.NewPostgres[T](sb)

// Condition building
cond := postgres.SqlCondition{
    Logical: "and",
    Conditions: []any{
        postgres.ConditionItem{
            Field: "username",
            Op:    postgres.OpEq,
            Value: username,
        },
    },
}

// Session management
_, cleanup := sm.GetSession(ctx)
defer cleanup(&cleanupErr, middleware.CreateLogEvent(ctx, zerolog.InfoLevel))
```

## Business Rules & Constraints

### Healthcare Data Validation Rules
1. **Patient Username**: Must be unique, 3-50 characters, alphanumeric and underscore only
   - **Implementation**: `validator.New(obj, "Username").NotUndefine().NotNull()`
   - **Error Message**: "Username must be unique and 3-50 characters"

2. **Patient Email**: Must be unique, valid email format
   - **Implementation**: `validator.New(obj, "Email").NotUndefine().NotNull()`
   - **Error Message**: "Email must be unique and valid format"

3. **Patient Password**: Minimum 8 characters, required for security
   - **Implementation**: `validator.New(obj, "Password").NotUndefine().NotNull().GteString(8)`
   - **Error Message**: "Password must be at least 8 characters"

4. **Phone Number**: Exactly 8 digits for healthcare contact
   - **Implementation**: `validator.New(obj, "Phone").NotUndefine().NotNull().GteString(8).LteString(8)`
   - **Error Message**: "Phone number must be exactly 8 digits"

### Business Logic Constraints
1. **User Registration**: Only patients can register through public API
   - **Code Example**: Registration creates users with default patient role

2. **Appointment Booking**: Requires valid patient account and available time slot
   - **Code Example**: Future appointment service will validate patient and slot availability

3. **Healthcare Provider Integration**: All appointments must sync with external healthcare APIs
   - **Code Example**: Future integration layer for third-party healthcare systems

### Security Constraints
1. **Password Storage**: Never store plain text passwords
2. **Sensitive Data**: Always exclude password from API responses
3. **Session Management**: Use proper database transaction handling
4. **Input Validation**: Always validate all user inputs before processing

## Error Handling Patterns

### Error Types and Responses
```go
// ✅ Use these error types consistently

// Validation errors (400)
ptypes.NewApiError(400, 400, consts.Message.BAD_REQUEST, &ptypes.ErrorDetail{
    "username": "Username already exists",
})

// Authentication errors (401)
ptypes.NewApiError(401, 401, consts.Message.UNAUTHORIZED, nil)

// Not found errors (404)
ptypes.NewApiError(404, 404, consts.Message.NOT_FOUND, nil)

// Server errors (500)
ptypes.NewApiError(500, 500, consts.Message.INTERNAL_SERVER_ERROR, nil)
```

### Logging Patterns
```go
// ✅ Use these logging patterns

// Info logging
consts.Logger.Info().
    Str("operation", "user_registration").
    Str("user_id", user.Id.String()).
    Msg("User registered successfully")

// Error logging
consts.Logger.Error().
    Err(err).
    Str("operation", "database_query").
    Str("query", query.String()).
    Msg("Database operation failed")

// Debug logging
consts.Logger.Debug().
    Interface("request", request).
    Str("endpoint", "/auth/register").
    Msg("Processing registration request")
```

## Development Guidelines

### Code Implementation Rules
1. **Always validate input** using DTO validation patterns
2. **Always use session management** for database operations
3. **Always handle errors** with proper error types and logging
4. **Always exclude sensitive data** from API responses
5. **Always use structured logging** with context information

### Testing Requirements
1. **Unit tests** for all service methods
2. **Integration tests** for repository operations
3. **API tests** for endpoint validation
4. **Mock external dependencies** in tests
5. **Test healthcare-specific scenarios** (duplicate emails, invalid phone numbers)

### Performance Considerations
1. **Use connection pooling** for database operations
2. **Implement proper indexes** for user queries (username, email)
3. **Use session management** for transaction efficiency
4. **Implement caching** for frequently accessed data
5. **Optimize JSON handling** for user information storage

### Security Best Practices
1. **Validate all inputs** before processing
2. **Use parameterized queries** to prevent SQL injection
3. **Implement proper authentication** for all endpoints
4. **Log security events** for audit trails
5. **Follow HIPAA guidelines** for patient data handling

## Quick Reference

### Most Common Functions
```go
// Input validation
dtoRequest.RegisterBodyDto(body) // Validate registration request

// Data transformation
dataUtil.CopyWithoutStrict(&dst, &src) // Copy between structs
dataUtil.ExcludeFields(&obj, []string{"password"}) // Remove sensitive fields

// Error handling
ptypes.NewApiError(httpCode, statusCode, message, details) // Create API error

// Database operations
userRepo.BaseRepo.Insert(&user, nil, true) // Insert with returning
userRepo.GetByUsername(username) // Query by username

// Response formatting
ptypes.NewApiResponse(201, 201, consts.Message.CREATED, user) // Success response
```

### Environment Variables
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=venera_booking_dev

# Server
SERVER_HOST=localhost
SERVER_PORT=8081

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Healthcare API (future)
HEALTHCARE_API_URL=https://api.healthcare-provider.com
HEALTHCARE_API_KEY=your_api_key
```

### Common Commands
```bash
# Development
make tools      # Install development tools
make server     # Start server
make air        # Start with live reload
make tidy       # Tidy go modules

# Testing
go test ./...                    # Run all tests
go test -cover ./...            # Run with coverage
go test ./internal/service/...  # Run specific package tests

# Database
psql -d venera_booking_dev                                    # Connect to database
psql -d venera_booking_dev -f migrations/001_create_users_table.postgres.sql  # Run migration

# Quality
golangci-lint run    # Run linter
gofumpt -w .        # Format code
goimports -w .      # Fix imports
```

### Key Configuration Files
- **.env.yaml**: Environment configuration
- **go.mod**: Go module dependencies
- **Makefile**: Build and development commands
- **migrations/**: Database schema migrations

---

**Important Notes for AI Development:**

1. **Healthcare Context**: This is a healthcare booking system - always consider patient privacy and data protection
2. **Clean Architecture**: Maintain clear separation between router, service, and repository layers
3. **Existing Patterns**: Always check existing code patterns before implementing new features
4. **Security First**: All patient data must be handled securely with proper validation
5. **Database Sessions**: Always use session management for database operations
6. **Error Handling**: Use consistent error handling patterns with proper logging
7. **Testing**: Write comprehensive tests for all healthcare-related functionality

**Last Updated**: 2025-07-16
**Version**: 1.0.0
**Generated by**: Claude Code Assistant