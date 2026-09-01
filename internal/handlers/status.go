package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/4xmen/payambar/pkg/config"
	"github.com/gin-gonic/gin"
)

type appStatusHandler struct {
	db                 *sql.DB
	cfg                *config.Config
	GeneratedAt        time.Time
	Environment        string
	Port               string
	DatabasePath       string
	FileStoragePath    string
	Users              int64
	Conversations      int64
	Messages           int64
	UnreadMessages     int64
	Files              int64
	UploadedBytes      int64
	UploadedBytesHuman string
	MessagesLast24h    int64
	LatestMessageAt    string
	DBSize             int64
	DBSizeHuman        string
	DBWALSize          int64
	DBSHMSize          int64
	UploadDirSize      int64
	UploadDirSizeHuman string
	UploadFileCount    int64
	DBWarning          []string
	StorageWarnings    []string
}

func NewStatusHandler(db *sql.DB, cfg *config.Config) *appStatusHandler {
	return &appStatusHandler{
		db:  db,
		cfg: cfg,
	}
}

func (status *appStatusHandler) Handle(c *gin.Context) {
	status.GeneratedAt = time.Now()
	status.Environment = status.cfg.Environment
	status.Port = status.cfg.Port
	status.DatabasePath = status.cfg.DatabasePath
	status.FileStoragePath = status.cfg.FileStoragePath

	if size, err := fileSize(status.cfg.DatabasePath); err == nil {
		status.DBSize = size
		status.DBSizeHuman = formatBytes(size)
	} else {
		status.StorageWarnings = append(status.StorageWarnings, fmt.Sprintf("database file: %v", err))
	}

	if size, err := fileSize(status.cfg.DatabasePath + "-wal"); err == nil {
		status.DBWALSize = size
	}

	if size, err := fileSize(status.cfg.DatabasePath + "-shm"); err == nil {
		status.DBSHMSize = size
	}

	if bytes, files, err := dirUsage(status.cfg.FileStoragePath); err == nil {
		status.UploadDirSize = bytes
		status.UploadDirSizeHuman = formatBytes(bytes)
		status.UploadFileCount = files
	} else {
		status.StorageWarnings = append(status.StorageWarnings, fmt.Sprintf("upload dir: %v", err))
	}

	if status.db == nil {
		status.DBWarning = append(status.DBWarning, "database unavailable: connection is nil")
	} else {
		ctx := c.Request.Context()
		var err error
		if err = status.db.PingContext(ctx); err != nil {
			status.DBWarning = append(status.DBWarning, fmt.Sprintf("database unavailable: %v", err))
		}

		if status.Users, err = queryInt64(ctx, status.db, "SELECT COUNT(*) FROM users"); err != nil {
			status.DBWarning = append(status.DBWarning, fmt.Sprintf("could not read database stats: %v", err))
		}

		if status.Conversations, err = queryInt64(ctx, status.db, "SELECT COUNT(*) FROM conversations"); err != nil {
			status.DBWarning = append(status.DBWarning, fmt.Sprintf("could not read database stats: %v", err))
		}

		if status.Messages, err = queryInt64(ctx, status.db, "SELECT COUNT(*) FROM messages"); err != nil {
			status.DBWarning = append(status.DBWarning, fmt.Sprintf("could not read database stats: %v", err))
		}

		if status.UnreadMessages, err = queryInt64(ctx, status.db, "SELECT COUNT(*) FROM messages WHERE read_at IS NULL"); err != nil {
			status.DBWarning = append(status.DBWarning, fmt.Sprintf("could not read database stats: %v", err))
		}

		if status.Files, err = queryInt64(ctx, status.db, "SELECT COUNT(*) FROM files"); err != nil {
			status.DBWarning = append(status.DBWarning, fmt.Sprintf("could not read database stats: %v", err))
		}

		if status.UploadedBytes, err = queryInt64(ctx, status.db, "SELECT COALESCE(SUM(file_size), 0) FROM files"); err != nil {
			status.DBWarning = append(status.DBWarning, fmt.Sprintf("could not read database stats: %v", err))
		}

		status.UploadedBytesHuman = formatBytes(status.UploadedBytes)

		if status.MessagesLast24h, err = queryInt64(ctx, status.db, "SELECT COUNT(*) FROM messages WHERE created_at >= datetime('now', '-1 day')"); err != nil {
			status.DBWarning = append(status.DBWarning, fmt.Sprintf("could not read database stats: %v", err))
		}

		if status.LatestMessageAt, err = queryString(ctx, status.db, "SELECT COALESCE(MAX(created_at), '') FROM messages"); err != nil {
			status.DBWarning = append(status.DBWarning, fmt.Sprintf("could not read database stats: %v", err))
		}
	}

	c.JSON(http.StatusOK, status)

}

func queryInt64(ctx context.Context, db *sql.DB, query string) (int64, error) {
	var value int64
	if err := db.QueryRowContext(ctx, query).Scan(&value); err != nil {
		return 0, err
	}
	return value, nil
}

func queryString(ctx context.Context, db *sql.DB, query string) (string, error) {
	var value string
	if err := db.QueryRowContext(ctx, query).Scan(&value); err != nil {
		return "", err
	}
	return value, nil
}

func fileSize(path string) (int64, error) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	if info.IsDir() {
		return 0, fmt.Errorf("%s is a directory", path)
	}
	return info.Size(), nil
}

func dirUsage(root string) (int64, int64, error) {
	var totalBytes int64
	var totalFiles int64

	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return err
		}

		totalBytes += info.Size()
		totalFiles++
		return nil
	})
	if err != nil {
		return 0, 0, err
	}

	return totalBytes, totalFiles, nil
}

func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
