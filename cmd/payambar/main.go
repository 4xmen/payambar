package main

import (
	"embed"
	"log"

	"github.com/4xmen/payambar/pkg/config"
)

// Version is set at build time via -ldflags.
var Version = "dev"

//go:embed static/*
var staticFS embed.FS

func main() {

	cfg := config.Load()

	if err := RunServer(cfg); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
