package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestFirewall(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name       string
		path       string
		userAgent  string
		wantStatus int
	}{
		{
			name:       "valid request allowed",
			path:       "/api/messages",
			userAgent:  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
			wantStatus: http.StatusOK,
		},
		{
			name:       "api files prefix allowed even without user agent",
			path:       "/api/files/avatar.png",
			userAgent:  "",
			wantStatus: http.StatusOK,
		},
		{
			name:       "empty user agent blocked",
			path:       "/api/users",
			userAgent:  "",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "suspicious agent sqlmap blocked",
			path:       "/api/users",
			userAgent:  "sqlmap/1.5#stable",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "suspicious extension .env blocked",
			path:       "/app.env",
			userAgent:  "Mozilla/5.0",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "suspicious extension .php blocked",
			path:       "/admin.php",
			userAgent:  "Mozilla/5.0",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "suspicious path wp-admin blocked",
			path:       "/wp-admin/index.php",
			userAgent:  "Mozilla/5.0",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "suspicious path .git blocked",
			path:       "/.git/config",
			userAgent:  "Mozilla/5.0",
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Clear blocked IPs before each test run
			mu.Lock()
			blockedIPs = make(map[string]time.Time)
			mu.Unlock()

			router := gin.New()
			router.Use(Firewall())
			router.Any("/*path", func(c *gin.Context) {
				c.Status(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			req.Header.Set("User-Agent", tt.userAgent)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("Firewall() code = %d, want %d", w.Code, tt.wantStatus)
			}
		})
	}
}

func TestFirewallBlockedIPPersists(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mu.Lock()
	blockedIPs = make(map[string]time.Time)
	mu.Unlock()

	router := gin.New()
	router.Use(Firewall())
	router.Any("/*path", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	// First request with malicious path blocks the IP
	req1 := httptest.NewRequest(http.MethodGet, "/.env", nil)
	req1.Header.Set("User-Agent", "Mozilla/5.0")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	if w1.Code != http.StatusForbidden {
		t.Fatalf("first request code = %d, want %d", w1.Code, http.StatusForbidden)
	}

	// Subsequent legitimate request from same IP is blocked immediately
	req2 := httptest.NewRequest(http.MethodGet, "/api/messages", nil)
	req2.Header.Set("User-Agent", "Mozilla/5.0")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	if w2.Code != http.StatusForbidden {
		t.Fatalf("subsequent request code = %d, want %d", w2.Code, http.StatusForbidden)
	}
}
