package handlers

import (
	"net/http"
	"strings"

	"github.com/4xmen/payambar/internal/auth"
	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	authSvc *auth.Service
}

func NewAuthHandler(authSvc *auth.Service) *AuthHandler {
	return &AuthHandler{authSvc: authSvc}
}

type RegisterRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type AuthResponse struct {
	Token    string `json:"token"`
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
}

// Register creates a new user account
func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": __("invalid request")})
		return
	}

	userID, err := h.authSvc.Register(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": __(err.Error())})
		return
	}

	// Generate token
	token, err := h.authSvc.GenerateToken(userID, req.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": __("failed to generate token")})
		return
	}

	c.JSON(http.StatusCreated, AuthResponse{
		Token:    token,
		UserID:   userID,
		Username: req.Username,
	})
}

// Login authenticates a user and returns a token
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": __("invalid request")})
		return
	}

	token, userID, err := h.authSvc.Login(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": __(err.Error())})
		return
	}

	c.JSON(http.StatusOK, AuthResponse{
		Token:    token,
		UserID:   userID,
		Username: req.Username,
	})
}

// AuthMiddleware validates JWT token
func (h *AuthHandler) AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token, _ := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
		if token == "" {
			token = c.Query("token")
		}

		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": __("missing authorization token")})
			c.Abort()
			return
		}

		claims, err := h.authSvc.ValidateToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": __("invalid token")})
			c.Abort()
			return
		}

		exists, err := h.authSvc.UserExists(claims.UserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": __("failed to validate user")})
			c.Abort()
			return
		}
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": __("user not found")})
			c.Abort()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Next()
	}
}
