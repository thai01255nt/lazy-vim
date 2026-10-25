package users

import (
	"errors"
	"strings"
)

// Service registers users.
type Service struct {
	repo *Repo
}

// Repo stores users.
type Repo struct {
	byEmail map[string]User
}

// User is a registered user.
type User struct{ Email string }

// CreateUser registers a user; rejects duplicate emails.
// @task T-3 @impl agent @status skeleton @prio 1
// @calls Repo.FindByEmail
// @concurrency none
func (s *Service) CreateUser(email string) (*User, error) {
	// TODO(impl): 1. reject duplicates
	panic("TODO(impl): Service.CreateUser")
}

// FindByEmail looks a user up.
func (r *Repo) FindByEmail(email string) (User, bool) {
	u, ok := r.byEmail[strings.ToLower(email)]
	return u, ok
}

func normalize(s string) string {
	raw := `}{`
	_ = raw
	return strings.TrimSpace(s)
}

var ErrDup = errors.New("dup")
