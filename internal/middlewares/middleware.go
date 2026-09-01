package middlewares

import (
	"bytes"
	"fmt"
	"log"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/4xmen/payambar/pkg/i18n"
	"github.com/gin-gonic/gin"
	"github.com/ulule/limiter/v3"
)

type responseBodyWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w responseBodyWriter) Write(b []byte) (int, error) {
	if w.body.Len() < 512 {
		toWrite := len(b)
		if rem := 512 - w.body.Len(); rem < toWrite {
			toWrite = rem
		}
		w.body.Write(b[:toWrite])
	}
	return w.ResponseWriter.Write(b)
}

func (w responseBodyWriter) WriteString(s string) (int, error) {
	if w.body.Len() < 512 {
		toWrite := len(s)
		if rem := 512 - w.body.Len(); rem < toWrite {
			toWrite = rem
		}
		w.body.WriteString(s[:toWrite])
	}
	return w.ResponseWriter.WriteString(s)
}

func RateLimitMiddleware(limiterInstance *limiter.Limiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		limiterContext, err := limiterInstance.Get(c.Request.Context(), c.ClientIP())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.Translate("rate limiter error")})
			c.Abort()
			return
		}

		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", limiterContext.Limit))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", limiterContext.Remaining))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", limiterContext.Reset))

		if limiterContext.Reached {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": i18n.Translate("rate limit exceeded")})
			c.Abort()
			return
		}

		c.Next()
	}
}

func ServerErrorLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		blw := &responseBodyWriter{body: bytes.NewBuffer(nil), ResponseWriter: c.Writer}
		c.Writer = blw

		c.Next()

		if c.Writer.Status() >= http.StatusInternalServerError {
			log.Printf(
				"HTTP %d %s %s ip=%s duration=%s errors=%q response=%q",
				c.Writer.Status(),
				c.Request.Method,
				c.Request.URL.Path,
				c.ClientIP(),
				time.Since(start).Truncate(time.Millisecond),
				c.Errors.ByType(gin.ErrorTypeAny).String(),
				strings.TrimSpace(blw.body.String()),
			)
		}
	}
}

func PanicRecovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		log.Printf(
			"panic recovered method=%s path=%s ip=%s error=%v\n%s",
			c.Request.Method,
			c.Request.URL.Path,
			c.ClientIP(),
			recovered,
			debug.Stack(),
		)
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": i18n.Translate("internal server error")})
	})
}

func Cors(CORSOrigins string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", CORSOrigins)
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
