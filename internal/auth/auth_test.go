package auth

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/mattn/go-sqlite3"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	_, err = db.Exec(`
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatalf("failed to create users table: %v", err)
	}
	return db
}

func TestNew(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	svc := New(db, "secret-key")
	if svc == nil {
		t.Fatal("expected non-nil service")
	}
	if svc.jwtSecret != "secret-key" {
		t.Errorf("expected secret-key, got %s", svc.jwtSecret)
	}
}

func TestRegister(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	svc := New(db, "test-secret")

	tests := []struct {
		name      string
		username  string
		password  string
		wantErr   bool
		errSubstr string
	}{
		{
			name:     "valid registration",
			username: "alice",
			password: "password123",
			wantErr:  false,
		},
		{
			name:      "short username",
			username:  "al",
			password:  "password123",
			wantErr:   true,
			errSubstr: "between 3 and 32 characters",
		},
		{
			name:      "long username",
			username:  strings.Repeat("a", 33),
			password:  "password123",
			wantErr:   true,
			errSubstr: "between 3 and 32 characters",
		},
		{
			name:      "invalid characters in username",
			username:  "alice@wonderland",
			password:  "password123",
			wantErr:   true,
			errSubstr: "letters, numbers, and underscores",
		},
		{
			name:      "short password",
			username:  "bob_123",
			password:  "12345",
			wantErr:   true,
			errSubstr: "at least 6 characters",
		},
		{
			name:      "duplicate username",
			username:  "alice",
			password:  "anotherpassword",
			wantErr:   true,
			errSubstr: "already exists",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, err := svc.Register(tt.username, tt.password)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.errSubstr)
				}
				if !strings.Contains(err.Error(), tt.errSubstr) {
					t.Fatalf("expected error containing %q, got %v", tt.errSubstr, err)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if id <= 0 {
					t.Fatalf("expected positive user ID, got %d", id)
				}
			}
		})
	}
}

func TestLogin(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	svc := New(db, "test-secret")

	// Pre-populate user
	userID, err := svc.Register("testlogin", "secret123")
	if err != nil {
		t.Fatalf("setup registration failed: %v", err)
	}

	tests := []struct {
		name      string
		username  string
		password  string
		wantErr   bool
		errSubstr string
	}{
		{
			name:     "successful login",
			username: "testlogin",
			password: "secret123",
			wantErr:  false,
		},
		{
			name:      "wrong password",
			username:  "testlogin",
			password:  "wrongpass",
			wantErr:   true,
			errSubstr: "invalid username or password",
		},
		{
			name:      "nonexistent user",
			username:  "nobody",
			password:  "secret123",
			wantErr:   true,
			errSubstr: "invalid username or password",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, id, err := svc.Login(tt.username, tt.password)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.errSubstr)
				}
				if !strings.Contains(err.Error(), tt.errSubstr) {
					t.Fatalf("expected error containing %q, got %v", tt.errSubstr, err)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if id != userID {
					t.Fatalf("expected user ID %d, got %d", userID, id)
				}
				if token == "" {
					t.Fatal("expected non-empty JWT token")
				}
			}
		})
	}
}

func TestGenerateAndValidateToken(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	svc := New(db, "valid-secret-key-123")

	t.Run("valid token", func(t *testing.T) {
		token, err := svc.GenerateToken(42, "tester")
		if err != nil {
			t.Fatalf("GenerateToken failed: %v", err)
		}

		claims, err := svc.ValidateToken(token)
		if err != nil {
			t.Fatalf("ValidateToken failed: %v", err)
		}
		if claims.UserID != 42 {
			t.Errorf("expected UserID 42, got %d", claims.UserID)
		}
		if claims.Username != "tester" {
			t.Errorf("expected Username 'tester', got %q", claims.Username)
		}
	})

	t.Run("token with wrong secret", func(t *testing.T) {
		otherSvc := New(db, "different-secret-key")
		token, err := otherSvc.GenerateToken(42, "tester")
		if err != nil {
			t.Fatalf("GenerateToken failed: %v", err)
		}

		_, err = svc.ValidateToken(token)
		if err == nil {
			t.Fatal("expected validation error for mismatched secret, got nil")
		}
	})

	t.Run("malformed token string", func(t *testing.T) {
		_, err := svc.ValidateToken("invalid.token.string")
		if err == nil {
			t.Fatal("expected error for malformed token, got nil")
		}
	})

	t.Run("expired token", func(t *testing.T) {
		expiredClaims := Claims{
			UserID:   10,
			Username: "expired_user",
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
				IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			},
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, expiredClaims)
		signed, err := tok.SignedString([]byte("valid-secret-key-123"))
		if err != nil {
			t.Fatalf("failed to sign expired token: %v", err)
		}

		_, err = svc.ValidateToken(signed)
		if err == nil {
			t.Fatal("expected error for expired token, got nil")
		}
	})
}

func TestGetUserByUsername(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	svc := New(db, "test-secret")

	createdID, err := svc.Register("findme", "password123")
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	t.Run("found user", func(t *testing.T) {
		id, err := svc.GetUserByUsername("findme")
		if err != nil {
			t.Fatalf("GetUserByUsername failed: %v", err)
		}
		if id != createdID {
			t.Fatalf("expected ID %d, got %d", createdID, id)
		}
	})

	t.Run("user not found", func(t *testing.T) {
		_, err := svc.GetUserByUsername("ghost")
		if err == nil {
			t.Fatal("expected error for non-existent user, got nil")
		}
	})
}

func TestUserExists(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	svc := New(db, "test-secret")

	createdID, err := svc.Register("existing", "password123")
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	t.Run("existing user returns true", func(t *testing.T) {
		exists, err := svc.UserExists(createdID)
		if err != nil {
			t.Fatalf("UserExists failed: %v", err)
		}
		if !exists {
			t.Fatal("expected user to exist")
		}
	})

	t.Run("non-existing user returns false", func(t *testing.T) {
		exists, err := svc.UserExists(999999)
		if err != nil {
			t.Fatalf("UserExists failed: %v", err)
		}
		if exists {
			t.Fatal("expected user to NOT exist")
		}
	})

	t.Run("context cancellation", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel() // immediately cancelled
		_, err := svc.UserExistsContext(ctx, createdID)
		if err == nil {
			t.Fatal("expected error with cancelled context, got nil")
		}
	})
}
