package config

import (
	"os"
	"strconv"
	"strings"

	_ "github.com/joho/godotenv/autoload"
)

type Config struct {
	Port               string
	Environment        string
	DatabasePath       string
	JWTSecret          string
	CORSOrigins        string
	TrustedProxies     []string
	MaxUploadSize      int64
	FileStoragePath    string
	StunServers        string
	TurnEnabled        bool
	TurnServer         string
	TurnRealm          string
	TurnExternalIP     string
	TurnAdvertisedHost string
	TurnListenAddress  string
	TurnListenPort     uint16
	TurnRelayAddress   string
	TurnRelayMinPort   uint16
	TurnRelayMaxPort   uint16
	TurnUsername       string
	TurnPassword       string
	VAPIDPublicKey     string
	VAPIDPrivateKey    string
}

func Load() *Config {

	return &Config{
		Port:               getEnv("PORT", "8080"),
		Environment:        getEnv("ENVIRONMENT", "development"),
		DatabasePath:       getEnv("DATABASE_PATH", "./data/payambar.db"),
		JWTSecret:          getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
		CORSOrigins:        getEnv("CORS_ORIGINS", "*"),
		TrustedProxies:     strings.Split(getEnv("TRUSTED_PROXIES", ""), ","),
		MaxUploadSize:      parseInt64(getEnv("MAX_UPLOAD_SIZE", "10485760")), // 10MB default
		FileStoragePath:    getEnv("FILE_STORAGE_PATH", "./data/uploads"),
		StunServers:        getEnv("STUN_SERVERS", "stun:stun.l.google.com:19302"),
		TurnEnabled:        parseBool(getEnv("TURN_ENABLED", "false")),
		TurnServer:         getEnv("TURN_SERVER", ""),
		TurnRealm:          getEnv("TURN_REALM", "payambar.local"),
		TurnExternalIP:     getEnv("TURN_EXTERNAL_IP", ""),
		TurnAdvertisedHost: getEnv("TURN_ADVERTISED_HOST", ""),
		TurnListenAddress:  getEnv("TURN_LISTEN_ADDRESS", "0.0.0.0"),
		TurnListenPort:     parseUint16(getEnv("TURN_LISTEN_PORT", "3478"), 3478),
		TurnRelayAddress:   getEnv("TURN_RELAY_ADDRESS", "0.0.0.0"),
		TurnRelayMinPort:   parseUint16(getEnv("TURN_RELAY_MIN_PORT", "49152"), 49152),
		TurnRelayMaxPort:   parseUint16(getEnv("TURN_RELAY_MAX_PORT", "49252"), 49252),
		TurnUsername:       getEnv("TURN_USERNAME", ""),
		TurnPassword:       getEnv("TURN_PASSWORD", ""),
		VAPIDPublicKey:     getEnv("VAPID_PUBLIC_KEY", ""),
		VAPIDPrivateKey:    getEnv("VAPID_PRIVATE_KEY", ""),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func parseInt64(s string) int64 {
	val, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 10485760 // 10MB default
	}
	return val
}

func parseBool(s string) bool {
	val, err := strconv.ParseBool(s)
	if err != nil {
		return false
	}
	return val
}

func parseUint16(s string, fallback uint16) uint16 {
	val, err := strconv.ParseUint(s, 10, 16)
	if err != nil {
		return fallback
	}
	return uint16(val)
}
