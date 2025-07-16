# Codebase Reference

## Table of Contents

- [Overview](#overview)
- [Class Inventory](#class-inventory)
- [Function Catalog](#function-catalog)
- [Service Registry](#service-registry)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Constants & Configuration](#constants--configuration)
- [Utility Functions](#utility-functions)
- [Integration Points](#integration-points)

## Overview

This document provides a comprehensive reference to all classes, functions, and components in the Venera Healthcare Booking Service codebase. It is automatically generated and updated to reflect the current state of the code.

## Class Inventory

### Models

#### User
**Location**: `internal/model/user.go`
**Purpose**: Represents a patient user in the healthcare system

**Properties**:
- `Id`: ptypes.Undefineable[uuid.UUID] - Unique user identifier
- `Username`: ptypes.Undefineable[string] - User login name
- `Email`: ptypes.Undefineable[string] - User email address
- `Password`: ptypes.Undefineable[string] - Hashed password
- `Infos`: ptypes.Undefineable[string] - JSON string containing user information
- `CreatedAt`: ptypes.Undefineable[itypes.Time] - Account creation timestamp
- `UpdatedAt`: ptypes.Undefineable[itypes.Time] - Last update timestamp

**Usage Example**:
```go
user := model.User{
    Username: ptypes.NewUndefineable("patient123"),
    Email:    ptypes.NewUndefineable("patient@example.com"),
    Password: ptypes.NewUndefineable("hashedPassword"),
}
```

#### UserInfo
**Location**: `internal/model/user.go`
**Purpose**: Structured user information for healthcare context

**Properties**:
- `Address`: ptypes.Undefineable[string] - Patient address
- `Phone`: ptypes.Undefineable[string] - Patient phone number

### Services

#### User Service
**Location**: `internal/service/user.go`
**Purpose**: Business logic for user management operations

**Properties**:
- `postgresService`: *Postgres - Database service instance
- `userRepo`: *repository.User - User repository instance
- `sm`: *scope.SessionManager[*pool.PostgresTx] - Session manager

**Methods**:
- `NewUser(postgresService *Postgres, userRepo *repository.User)`: *User - Constructor
- `Add(ctx context.Context, body *dtoRequest.RegisterBody)`: (*model.User, *ptypes.ApiError) - Create new user

**Usage Example**:
```go
userService := service.NewUser(postgresService, userRepo)
user, err := userService.Add(ctx, registerBody)
```

#### Postgres Service
**Location**: `internal/service/postgres.go`
**Purpose**: Database connection and query execution service

**Properties**:
- `sm`: *scope.SessionManager[*pool.PostgresTx] - Session manager for database transactions

**Methods**:
- `NewPostgres(sm *scope.SessionManager[*pool.PostgresTx])`: *Postgres - Constructor
- `Query(ctx context.Context, query *postgres.SqlQuery)`: pgx.Rows - Execute database query

### Repositories

#### User Repository
**Location**: `internal/repository/user.go`
**Purpose**: Data access layer for user operations

**Properties**:
- `Sb`: *postgres.Sqlbuilder - SQL query builder instance
- `BaseRepo`: *Postgres[model.User] - Base repository with generic operations

**Methods**:
- `NewUser()`: *User - Constructor
- `GetByUsername(username string)`: *postgres.SqlQuery - Find user by username
- `GetByUserId(userId string)`: *postgres.SqlQuery - Find user by ID

**Usage Example**:
```go
userRepo := repository.NewUser()
query := userRepo.GetByUsername("patient123")
```

#### Postgres Repository
**Location**: `internal/repository/postgres.go`
**Purpose**: Generic repository with common database operations

**Methods**:
- `NewPostgres[T](sb *postgres.Sqlbuilder)`: *Postgres[T] - Generic constructor
- `Insert(entity *T, fields []string, returning bool)`: *postgres.SqlQuery - Insert operation
- `GetByCondition(cond postgres.SqlCondition)`: *postgres.SqlQuery - Conditional query

## Function Catalog

### Authentication Functions

#### Auth Router Functions
**Location**: `internal/router/auth.go`

#### NewAuth
**Purpose**: Creates authentication router with user service dependency
**Signature**: `func NewAuth(userService *service.User) *Auth`
**Returns**: *Auth - Configured authentication router

**Parameters**:
- `userService`: *service.User - User service for authentication operations

**Usage Example**:
```go
authRouter := router.NewAuth(userService)
```

#### login
**Purpose**: Handles user login requests (placeholder implementation)
**Signature**: `func (o *Auth) login(w http.ResponseWriter, r *http.Request)`
**Returns**: void - Writes response to HTTP writer

**Parameters**:
- `w`: http.ResponseWriter - HTTP response writer
- `r`: *http.Request - HTTP request object

#### register
**Purpose**: Handles user registration requests
**Signature**: `func (o *Auth) register(w http.ResponseWriter, r *http.Request)`
**Returns**: void - Writes JSON response to HTTP writer

**Parameters**:
- `w`: http.ResponseWriter - HTTP response writer
- `r`: *http.Request - HTTP request object

**Usage Example**:
```go
// POST /auth/register
// Body: {"username": "patient123", "email": "patient@example.com", "password": "password123"}
```

### Validation Functions

#### RegisterBodyDto
**Location**: `internal/dto/request/register.go`
**Purpose**: Validates registration request body
**Signature**: `func RegisterBodyDto(body *RegisterBody) *ptypes.ApiError`
**Returns**: *ptypes.ApiError - Validation error or nil if valid

**Parameters**:
- `body`: *RegisterBody - Registration request data

**Usage Example**:
```go
err := dtoRequest.RegisterBodyDto(body)
if err != nil {
    err.Response(w)
    return
}
```

### Utility Functions

#### CopyWithoutStrict
**Location**: `pkg/dataUtil/copy.go`
**Purpose**: Copies data between structs without strict type checking
**Signature**: `func CopyWithoutStrict(dst, src interface{}) error`
**Returns**: error - Copy operation error or nil

#### ExcludeFields
**Location**: `pkg/dataUtil/filterField.go`
**Purpose**: Removes specified fields from struct
**Signature**: `func ExcludeFields(obj interface{}, fields []string)`
**Returns**: void - Modifies object in place

**Usage Example**:
```go
dataUtil.ExcludeFields(&user, []string{"password"})
```

## Service Registry

### Authentication Services

#### Auth Service
**Location**: `internal/router/auth.go`
**Purpose**: HTTP request handling for authentication operations
**Dependencies**: service.User

**Public Methods**:
- `login(w http.ResponseWriter, r *http.Request)`: void - Handle login requests
- `register(w http.ResponseWriter, r *http.Request)`: void - Handle registration requests

**Configuration**:
```go
authRouter := router.NewAuth(userService)
r.Mount("/auth", authRouter.Router)
```

**Usage Example**:
```go
userService := service.NewUser(postgresService, userRepo)
authRouter := router.NewAuth(userService)
```

### Data Services

#### User Service
**Location**: `internal/service/user.go`
**Purpose**: Business logic for user management
**Dependencies**: service.Postgres, repository.User

**Public Methods**:
- `Add(ctx context.Context, body *dtoRequest.RegisterBody)`: (*model.User, *ptypes.ApiError) - Create user

**Configuration**:
```go
postgresService := service.NewPostgres(dbScopes.CoreSm)
userRepo := repository.NewUser()
userService := service.NewUser(postgresService, userRepo)
```

**Usage Example**:
```go
user, err := userService.Add(ctx, registerBody)
if err != nil {
    err.Response(w)
    return
}
```

## API Endpoints

### Authentication Endpoints

#### GET /auth/login
**Purpose**: User login endpoint (placeholder)
**Authentication**: None required
**Rate Limit**: Not implemented

**Parameters**: None

**Response Example**:
```json
{
    "message": "Login endpoint - implementation pending"
}
```

#### POST /auth/register
**Purpose**: Register new user account
**Authentication**: None required
**Rate Limit**: Not implemented

**Parameters**:
- `username`: string - User login name (required)
- `email`: string - User email address (required)
- `password`: string - User password (required, min 8 chars)
- `userInfos`: array - Additional user information (optional)

**Request Example**:
```json
{
    "username": "patient123",
    "email": "patient@example.com",
    "password": "securePassword123",
    "userInfos": [
        {
            "address": "123 Main St",
            "phone": "12345678",
            "birthdate": "1990-01-01"
        }
    ]
}
```

**Response Example**:
```json
{
    "statusCode": 201,
    "code": 201,
    "message": "Created",
    "data": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "username": "patient123",
        "email": "patient@example.com",
        "createdAt": "2025-07-16T10:30:45Z",
        "updatedAt": "2025-07-16T10:30:45Z"
    }
}
```

**Error Responses**:
- `400`: Validation errors (duplicate username/email, invalid format)
- `500`: Internal server error

## Database Schema

### Tables

#### users
**Purpose**: Store patient user accounts and information

**Columns**:
- `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid() - Unique user identifier
- `username`: VARCHAR(50) NOT NULL UNIQUE - User login name
- `email`: VARCHAR(255) NOT NULL UNIQUE - User email address
- `password`: VARCHAR(255) NOT NULL - Hashed password
- `infos`: JSONB NOT NULL DEFAULT '[]'::jsonb - Additional user information
- `createdAt`: TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP - Creation time
- `updatedAt`: TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP - Last update time

**Indexes**:
- `users_pkey`: PRIMARY KEY (id) - Primary key index
- `users_username_key`: UNIQUE (username) - Username uniqueness
- `users_email_key`: UNIQUE (email) - Email uniqueness

**Relationships**:
- None currently defined (appointments table to be added)

**Triggers**:
- `update_users_updatedAt`: Automatically updates `updatedAt` on row modification

## Constants & Configuration

### Application Constants

```go
// Database configuration
consts.Db.CoreSchema = "public"

// Message constants
consts.Message.CREATED = "Created"
consts.Message.BAD_REQUEST = "Bad Request"

// Common patterns
consts.Common.EMAIL_REGEX = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
consts.Common.USERNAME_REGEX = regexp.MustCompile(`^[a-zA-Z0-9_]{3,50}$`)
consts.Common.PASSWORD_REGEX = regexp.MustCompile(`^.{8,}$`)
```

### Environment Variables

```bash
# Database configuration
DB_HOST=localhost           # Database host
DB_PORT=5432               # Database port
DB_USER=postgres           # Database user
DB_PASSWORD=password       # Database password
DB_NAME=venera_booking_dev # Database name

# Server configuration
SERVER_HOST=localhost      # Server host
SERVER_PORT=8081          # Server port

# Logging configuration
LOG_LEVEL=info            # Logging level
LOG_FORMAT=json           # Log format
```

### Configuration Files

- **.env.yaml**: Environment-specific configuration
- **go.mod**: Go module dependencies
- **Makefile**: Build and development commands

## Utility Functions

### Data Utilities

#### CopyWithoutStrict
**Location**: `pkg/dataUtil/copy.go`
**Purpose**: Copy data between structs with flexible type conversion
**Usage**: `dataUtil.CopyWithoutStrict(&dst, &src)`

```go
user := model.User{}
err := dataUtil.CopyWithoutStrict(&user, registerBody)
```

#### ExcludeFields
**Location**: `pkg/dataUtil/filterField.go`
**Purpose**: Remove sensitive fields from response objects
**Usage**: `dataUtil.ExcludeFields(&obj, []string{"password"})`

```go
dataUtil.ExcludeFields(&user, []string{"password"})
```

### Database Utilities

#### NewUndefineable
**Location**: `pkg/ptypes/undefineable.go`
**Purpose**: Create undefineable type for optional fields
**Usage**: `ptypes.NewUndefineable(value)`

```go
username := ptypes.NewUndefineable("patient123")
```

### Validation Utilities

#### ValidateSchemaFirstError
**Location**: `pkg/validator/validator.go`
**Purpose**: Validate struct against schema, return first error
**Usage**: `validator.ValidateSchemaFirstError(obj, schema)`

```go
errorDetail := validator.ValidateSchemaFirstError(body, registerBodySchema)
```

## Integration Points

### External APIs
- **Third-party Healthcare APIs**: Planned integration for appointment booking
- **Email Service**: Planned integration for user notifications
- **Payment Gateway**: Planned integration for appointment payments

### Message Queues
- **Appointment Queue**: Planned for appointment processing
- **Notification Queue**: Planned for user notifications

### Caching
- **User Cache**: Planned for user session management
- **Appointment Cache**: Planned for appointment availability

### Database Connections
- **Primary Database**: PostgreSQL with connection pooling via pgx/v5
- **Session Management**: Database transaction session management
- **Migration System**: SQL-based database schema migrations

---

**Last Updated**: 2025-07-16
**Version**: 1.0.0
**Generated by**: Claude Code Assistant