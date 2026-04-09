package config

import "testing"

func TestLoadTurnConfigDefaults(t *testing.T) {
	t.Setenv("TURN_ENABLED", "")
	t.Setenv("TURN_LISTEN_PORT", "")
	t.Setenv("TURN_RELAY_MIN_PORT", "")
	t.Setenv("TURN_RELAY_MAX_PORT", "")

	cfg := Load()
	if cfg.TurnEnabled {
		t.Fatal("expected TURN to be disabled by default")
	}
	if cfg.TurnListenPort != 3478 {
		t.Fatalf("expected default TURN listen port 3478, got %d", cfg.TurnListenPort)
	}
	if cfg.TurnRelayMinPort != 49152 || cfg.TurnRelayMaxPort != 49252 {
		t.Fatalf("unexpected default relay range: %d-%d", cfg.TurnRelayMinPort, cfg.TurnRelayMaxPort)
	}
}

func TestLoadTurnConfigFromEnv(t *testing.T) {
	t.Setenv("TURN_ENABLED", "true")
	t.Setenv("TURN_REALM", "example.org")
	t.Setenv("TURN_EXTERNAL_IP", "203.0.113.10")
	t.Setenv("TURN_ADVERTISED_HOST", "turn.example.org")
	t.Setenv("TURN_LISTEN_ADDRESS", "127.0.0.1")
	t.Setenv("TURN_LISTEN_PORT", "4488")
	t.Setenv("TURN_RELAY_ADDRESS", "127.0.0.1")
	t.Setenv("TURN_RELAY_MIN_PORT", "50000")
	t.Setenv("TURN_RELAY_MAX_PORT", "50050")

	cfg := Load()
	if !cfg.TurnEnabled {
		t.Fatal("expected TURN to be enabled")
	}
	if cfg.TurnRealm != "example.org" {
		t.Fatalf("unexpected TURN realm: %s", cfg.TurnRealm)
	}
	if cfg.TurnExternalIP != "203.0.113.10" {
		t.Fatalf("unexpected TURN external IP: %s", cfg.TurnExternalIP)
	}
	if cfg.TurnAdvertisedHost != "turn.example.org" {
		t.Fatalf("unexpected TURN advertised host: %s", cfg.TurnAdvertisedHost)
	}
	if cfg.TurnListenAddress != "127.0.0.1" || cfg.TurnListenPort != 4488 {
		t.Fatalf("unexpected TURN listen endpoint: %s:%d", cfg.TurnListenAddress, cfg.TurnListenPort)
	}
	if cfg.TurnRelayAddress != "127.0.0.1" {
		t.Fatalf("unexpected TURN relay address: %s", cfg.TurnRelayAddress)
	}
	if cfg.TurnRelayMinPort != 50000 || cfg.TurnRelayMaxPort != 50050 {
		t.Fatalf("unexpected TURN relay range: %d-%d", cfg.TurnRelayMinPort, cfg.TurnRelayMaxPort)
	}
}
