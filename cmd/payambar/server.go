package main

import (
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path"
	"strings"
	"syscall"
	"time"

	"github.com/4xmen/payambar/internal/auth"
	"github.com/4xmen/payambar/internal/db"
	"github.com/4xmen/payambar/internal/handlers"
	"github.com/4xmen/payambar/internal/middlewares"
	"github.com/4xmen/payambar/internal/push"
	"github.com/4xmen/payambar/internal/ws"
	"github.com/4xmen/payambar/pkg/config"
	"github.com/gin-gonic/gin"
	"github.com/ulule/limiter/v3"
	"github.com/ulule/limiter/v3/drivers/store/memory"
)

func RunServer(cfg *config.Config) error {
	// Ensure data directories exist
	os.MkdirAll(cfg.FileStoragePath, 0755)
	os.MkdirAll("/data", 0755)
	// Initialize database
	database, err := db.New(cfg.DatabasePath)
	if err != nil {
		return fmt.Errorf("failed to initialize database: %w", err)
	}
	defer database.Close()

	// Initialize services
	authSvc := auth.New(database.GetConn(), cfg.JWTSecret)

	// Initialize WebSocket hub
	hub := ws.NewHub(database.GetConn())

	// Initialize push notifier (only if VAPID keys are configured)
	var pushNotifier *push.Notifier
	if cfg.VAPIDPublicKey != "" && cfg.VAPIDPrivateKey != "" {
		pushNotifier = push.NewNotifier(database.GetConn(), cfg.VAPIDPublicKey, cfg.VAPIDPrivateKey)
		hub.SetPushNotifier(pushNotifier)
		log.Println("Web Push notifications enabled")
	} else {
		log.Println("Web Push notifications disabled (no VAPID keys configured)")
	}

	go hub.Run()

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authSvc)
	msgHandler := handlers.NewMessageHandler(database.GetConn(), hub, cfg.FileStoragePath, cfg.MaxUploadSize, cfg.StunServers, cfg.TurnServer, cfg.TurnUsername, cfg.TurnPassword, pushNotifier)

	// Setup router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.SetTrustedProxies(cfg.TrustedProxies)
	router.Use(middlewares.ServerErrorLogger())
	router.Use(gin.Logger())
	router.Use(middlewares.PanicRecovery())
	router.Use(middlewares.Cors(cfg.CORSOrigins))
	router.Use(middlewares.Firewall())
	router.MaxMultipartMemory = cfg.MaxUploadSize

	// Public endpoints
	api := router.Group("/api")
	{
		loginLimiter := limiter.New(memory.NewStore(), limiter.Rate{Period: time.Minute, Limit: 5})
		registerLimiter := limiter.New(memory.NewStore(), limiter.Rate{Period: time.Minute, Limit: 2})

		// Auth endpoints
		api.POST("/auth/register", middlewares.RateLimitMiddleware(registerLimiter), authHandler.Register)
		api.POST("/auth/login", middlewares.RateLimitMiddleware(loginLimiter), authHandler.Login)

		// Public profile endpoint
		api.GET("/users/:username", msgHandler.GetUserProfile)

		// Push VAPID key (public)
		api.GET("/push/vapid-key", msgHandler.GetVAPIDKey)

		// Version endpoint (public)
		api.GET("/version", func(c *gin.Context) {
			c.JSON(200, gin.H{"version": Version})
		})
	}

	// Protected endpoints
	protected := api.Group("")
	protected.Use(authHandler.AuthMiddleware())
	{
		// Messages
		protected.GET("/messages", msgHandler.GetConversation)
		protected.GET("/conversations", msgHandler.GetConversations)
		protected.POST("/keys/devices", msgHandler.UpsertDeviceKey)
		protected.GET("/keys/devices/self", msgHandler.GetMyDeviceKeys)
		protected.GET("/keys/users/:id/devices", msgHandler.GetUserDeviceKeys)
		protected.GET("/users", msgHandler.GetUsers)
		protected.POST("/conversations", msgHandler.CreateConversation)
		protected.DELETE("/conversations/:id", msgHandler.DeleteConversation)
		protected.PUT("/messages/:id/delivered", msgHandler.MarkAsDelivered)
		protected.PUT("/messages/:id/read", msgHandler.MarkAsRead)
		protected.DELETE("/messages/:id", msgHandler.DeleteMessage)
		protected.POST("/upload", msgHandler.UploadFile)

		// Profile
		protected.GET("/profile", msgHandler.GetMyProfile)
		protected.PUT("/profile", msgHandler.UpdateProfile)
		protected.POST("/profile/avatar", msgHandler.UploadAvatar)
		protected.DELETE("/profile", msgHandler.DeleteAccount)

		// WebRTC
		protected.GET("/webrtc/config", msgHandler.GetWebRTCConfig)

		// Push notifications
		protected.POST("/push/subscribe", msgHandler.SubscribePush)
		protected.DELETE("/push/subscribe", msgHandler.UnsubscribePush)
	}

	// Serve uploaded files from configured storage path
	router.Static("/api/files", cfg.FileStoragePath)

	// WebSocket endpoint
	router.GET("/ws", authHandler.AuthMiddleware(), hub.HandleWebSocket)

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	router.GET("/status", handlers.NewStatusHandler(database.GetConn(), cfg).Handle)
	// Serve embedded static files
	serveStatics(router)

	// Start server
	addr := fmt.Sprintf("0.0.0.0:%s", cfg.Port)
	log.Printf("Payambar %s starting on %s", Version, addr)

	// Setup graceful shutdown
	sigint := make(chan os.Signal, 1)
	signal.Notify(sigint, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigint
		log.Println("\nShutting down gracefully...")
		os.Exit(0)
	}()

	if err := router.Run(addr); err != nil {
		return err
	}

	return nil
}

func serveStatics(router *gin.Engine) {
	staticAssets, err := fs.Sub(staticFS, "static")
	if err != nil {
		log.Printf("Warning: Could not embed static files: %v", err)
		router.NoRoute(func(c *gin.Context) {
			c.JSON(404, gin.H{"error": __("not found")})
		})
	}

	router.GET("/favicon.svg", serveIcon("favicon.svg", "image/svg+xml"))
	router.GET("/favicon-96.png", serveIcon("favicon-96.png", "image/png"))
	router.GET("/favicon-192.png", serveIcon("favicon-192.png", "image/png"))
	router.GET("/favicon-512.png", serveIcon("favicon-512.png", "image/png"))
	router.GET("/favicon-maskable-192.png", serveIcon("favicon-maskable-192.png", "image/png"))
	router.GET("/favicon-maskable-512.png", serveIcon("favicon-maskable-512.png", "image/png"))
	router.GET("/apple-touch-icon.png", serveIcon("apple-touch-icon.png", "image/png"))
	router.GET("/screenshot-540.png", serveIcon("screenshot-540.png", "image/png"))
	router.GET("/screenshot-1280.png", serveIcon("screenshot-1280.png", "image/png"))

	// Serve manifest.json
	router.GET("/manifest.json", func(c *gin.Context) {
		data, err := fs.ReadFile(staticFS, "static/manifest.json")
		if err != nil {
			c.JSON(404, gin.H{"error": __("not found")})
			return
		}
		c.Header("Cache-Control", "public, max-age=3600")
		c.Data(http.StatusOK, "application/json", data)
	})

	// Serve service worker
	router.GET("/sw.js", func(c *gin.Context) {
		data, err := fs.ReadFile(staticFS, "static/sw.js")
		if err != nil {
			c.JSON(404, gin.H{"error": __("not found")})
			return
		}
		c.Header("Cache-Control", "public, max-age=3600")
		c.Data(http.StatusOK, "application/javascript", data)
	})

	// Serve static files (CSS, JS with cache)
	router.GET("/styles.css", func(c *gin.Context) {
		data, err := fs.ReadFile(staticFS, "static/styles.css")
		if err != nil {
			c.JSON(404, gin.H{"error": __("not found")})
			return
		}
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Data(http.StatusOK, "text/css; charset=utf-8", data)
	})

	router.GET("/app.js", func(c *gin.Context) {
		data, err := fs.ReadFile(staticFS, "static/app.js")
		if err != nil {
			c.JSON(404, gin.H{"error": __("not found")})
			return
		}
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Data(http.StatusOK, "application/javascript; charset=utf-8", data)
	})

	router.GET("/vue.global.prod.js", func(c *gin.Context) {
		data, err := fs.ReadFile(staticFS, "static/vue.global.prod.js")
		if err != nil {
			c.JSON(404, gin.H{"error": __("not found")})
			return
		}
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Data(http.StatusOK, "application/javascript; charset=utf-8", data)
	})

	// Serve fonts
	router.GET("/fonts/*filepath", func(c *gin.Context) {
		file := strings.TrimPrefix(c.Param("filepath"), "/")
		data, err := fs.ReadFile(staticFS, path.Join("static/fonts", file))
		if err != nil {
			c.JSON(404, gin.H{"error": __("not found")})
			return
		}
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Data(http.StatusOK, "font/woff2", data)
	})

	// Serve index.html for all other routes (SPA)
	router.NoRoute(func(c *gin.Context) {
		if !shouldServeSPA(c) {
			c.JSON(http.StatusNotFound, gin.H{"error": __("not found")})
			return
		}

		data, err := fs.ReadFile(staticFS, "static/index.html")
		if err != nil {
			c.JSON(404, gin.H{"error": __("not found")})
			return
		}
		c.Header("Cache-Control", "public, max-age=3600")
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	})

	// Ensure staticAssets is used (required by Go compiler)
	_ = staticAssets
}

// Serve PWA icons
func serveIcon(filename string, mimeType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		data, err := fs.ReadFile(staticFS, "static/"+filename)
		if err != nil {
			c.JSON(404, gin.H{"error": __("not found")})
			return
		}
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Data(http.StatusOK, mimeType, data)
	}
}
func shouldServeSPA(c *gin.Context) bool {
	if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
		return false
	}

	accept := c.GetHeader("Accept")
	if !strings.Contains(accept, "text/html") {
		return false
	}

	reqPath := c.Request.URL.Path
	if reqPath == "" {
		return false
	}

	// Do not SPA-fallback unknown file-like paths (common scanner probes).
	if ext := strings.ToLower(path.Ext(reqPath)); ext != "" {
		return false
	}

	return true
}
