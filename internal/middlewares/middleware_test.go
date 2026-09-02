package middlewares

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ulule/limiter/v3"
	"github.com/ulule/limiter/v3/drivers/store/memory"
)

func TestRateLimitMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	rate := limiter.Rate{
		Period: 1 * time.Minute,
		Limit:  2,
	}
	instance := limiter.New(memory.NewStore(), rate)

	router := gin.New()
	router.Use(RateLimitMiddleware(instance))
	router.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// First request: OK (limit 2, remaining 1)
	req1 := httptest.NewRequest(http.MethodGet, "/test", nil)
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("first request code = %d, want %d", w1.Code, http.StatusOK)
	}
	if w1.Header().Get("X-RateLimit-Limit") != "2" {
		t.Errorf("expected X-RateLimit-Limit 2, got %s", w1.Header().Get("X-RateLimit-Limit"))
	}
	if w1.Header().Get("X-RateLimit-Remaining") != "1" {
		t.Errorf("expected X-RateLimit-Remaining 1, got %s", w1.Header().Get("X-RateLimit-Remaining"))
	}

	// Second request: OK (limit 2, remaining 0)
	req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("second request code = %d, want %d", w2.Code, http.StatusOK)
	}
	if w2.Header().Get("X-RateLimit-Remaining") != "0" {
		t.Errorf("expected X-RateLimit-Remaining 0, got %s", w2.Header().Get("X-RateLimit-Remaining"))
	}

	// Third request: 429 Too Many Requests
	req3 := httptest.NewRequest(http.MethodGet, "/test", nil)
	w3 := httptest.NewRecorder()
	router.ServeHTTP(w3, req3)
	if w3.Code != http.StatusTooManyRequests {
		t.Fatalf("third request code = %d, want %d", w3.Code, http.StatusTooManyRequests)
	}
}

func TestPanicRecovery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(PanicRecovery())
	router.GET("/panic", func(c *gin.Context) {
		panic("something went catastrophically wrong")
	})

	req := httptest.NewRequest(http.MethodGet, "/panic", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 on panic, got %d", w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["error"] == "" {
		t.Error("expected error message in JSON response")
	}
}

func TestCors(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(Cors("https://example.com"))
	router.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, "pong")
	})

	t.Run("options preflight request", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/ping", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNoContent {
			t.Fatalf("expected 204 for OPTIONS, got %d", w.Code)
		}
		if w.Header().Get("Access-Control-Allow-Origin") != "https://example.com" {
			t.Errorf("unexpected origin header: %s", w.Header().Get("Access-Control-Allow-Origin"))
		}
		if w.Header().Get("Access-Control-Allow-Credentials") != "true" {
			t.Errorf("unexpected credentials header: %s", w.Header().Get("Access-Control-Allow-Credentials"))
		}
	})

	t.Run("regular get request", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/ping", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 for GET, got %d", w.Code)
		}
		if w.Header().Get("Access-Control-Allow-Origin") != "https://example.com" {
			t.Errorf("unexpected origin header: %s", w.Header().Get("Access-Control-Allow-Origin"))
		}
	})
}

func TestServerErrorLogger(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(ServerErrorLogger())
	router.GET("/server-error", func(c *gin.Context) {
		c.String(http.StatusInternalServerError, "database connection failed")
	})

	req := httptest.NewRequest(http.MethodGet, "/server-error", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}
