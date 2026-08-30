.PHONY: build build-frontend build-backend build-all clean run dev docker-build docker-run test fmt

# Build frontend to cmd/payambar/static/
build-frontend:
	@echo "Building frontend..."
	mkdir -p cmd/payambar/static
	rm -rf cmd/payambar/static/*
	cd frontend && npm run build
	cp -R frontend/dist/* cmd/payambar/static/
	# Inject build hash into sw.js so browsers detect frontend changes
	$(eval BUILD_HASH := $(shell find frontend/dist -type f -exec shasum -a 256 {} + | shasum -a 256 | cut -c1-12))
	sed -i.bak "s/__BUILD_HASH__/$(BUILD_HASH)/g" cmd/payambar/static/sw.js cmd/payambar/static/index.html 2>/dev/null || true
	rm -f cmd/payambar/static/*.bak
	@echo "Frontend built in cmd/payambar/static/ (hash: $(BUILD_HASH))"

# Version defaults to 'dev'; override with: make build-backend VERSION=v1.2.0
VERSION ?= dev

# Build backend with embedded frontend (current OS)
build-backend: build-frontend
	@echo "Building backend (version: $(VERSION))..."
	mkdir -p bin
	go build -ldflags "-X main.Version=$(VERSION)" -tags=nomsgpack -o bin/payambar ./cmd/payambar


# Build all (current OS only)
build-all: build-backend
	@echo "Build complete: bin/payambar"


# Run locally
run: build-backend
	DATABASE_PATH=/tmp/payambar.db bin/payambar

# Dev (with frontend assets copied)
dev: build-frontend
	DATABASE_PATH=./data/payambar.db \
	TURN_ENABLED=true \
	STUN_SERVERS= \
	VAPID_PUBLIC_KEY=BK-m223f6sYwqN2cgyv7e5HSLMlXqEUyPuPUz4LVwlqVsjWQVLe7d_Gi9LVVtzb37yv1pPv9kbqiRFheGlcCOnk \
	VAPID_PRIVATE_KEY=xDf-gMEdudmVDlRDY5B5u9p6u2Yte_r78_sjm0BOdoY \
	go run ./cmd/payambar

# Clean
clean:
	rm -rf bin/
	rm -rf cmd/payambar/static
	rm -rf data/

# Docker build
docker-build:
	docker build -t payambar:latest .

# Docker run
docker-run:
	docker run -p 8080:8080 \
		-e DATABASE_PATH=/data/payambar.db \
		-e JWT_SECRET=your-secret-key \
		-v payambar_data:/data \
		payambar:latest

# Run all tests
test:
	@echo "Running Go tests..."
	go test -v -race -coverprofile=coverage.out ./...
	@echo "Coverage report:"
	go tool cover -func=coverage.out
	@echo "Running frontend tests..."
	cd frontend && npm ci && npm test


# Format code
fmt:
	@echo "Formatting code..."
	gofmt -w -s .
