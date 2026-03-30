package middlewares

import (
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

var (
	blockedIPs = make(map[string]bool)
	mu         sync.RWMutex
)

var suspiciousExtensions = []string{
	".php", ".asp", ".aspx", ".jsp",
	".env", ".git", ".svn",
	".htaccess", ".htpasswd",
	".sql", ".bak", ".backup",
	".config", ".cfg", ".ini",
	".log", ".yaml", ".yml",
}

var suspiciousPaths = []string{
	"/.env", "/.git/", "/wp-admin",
	"/wp-content", "/phpmyadmin",
	"/wp-includes", "/shell",
	"/etc/passwd", "/proc/self",
	"/admin.php", "/config.php",
}

var suspiciousAgents = []string{
	"sqlmap", "nikto", "nmap", "masscan",
	"zgrab", "nuclei", "dirbuster", "gobuster",
	"libwww-perl", "python-requests", "scrapy",
	"go-http-client",
}

func blockIP(ip string) {
	mu.Lock()
	defer mu.Unlock()
	blockedIPs[ip] = true
}

func isBlocked(ip string) bool {
	mu.RLock()
	defer mu.RUnlock()
	return blockedIPs[ip]
}

func Firewall() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		path := strings.ToLower(c.Request.URL.Path)
		ua := strings.ToLower(c.Request.UserAgent())

		if strings.HasPrefix(path, "/api/files/") {
			c.Next()
			return
		}

		block := func() {
			blockIP(ip)
			log.Println("IP BLOCKED:", ip)
			c.AbortWithStatus(http.StatusForbidden)
		}

		if isBlocked(ip) {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}

		if strings.TrimSpace(ua) == "" {
			block()
			return
		}

		for _, bad := range suspiciousAgents {
			if strings.Contains(ua, bad) {
				block()
				return
			}
		}

		for _, ext := range suspiciousExtensions {
			if strings.HasSuffix(path, ext) {
				block()
				return
			}
		}

		for _, bad := range suspiciousPaths {
			if strings.Contains(path, bad) {
				block()
				return
			}
		}

		c.Next()
	}
}
