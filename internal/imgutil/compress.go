package imgutil

import (
	"bytes"
	"image"
	"image/color"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"path/filepath"
	"strings"

	"github.com/disintegration/imaging"
	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
)

const (
	// MaxChatImageDimension is the max width or height for uploaded chat images
	MaxChatImageDimension = 1920
	// ChatJPEGQuality is the default quality for compressed chat JPEG images
	ChatJPEGQuality = 80
	// AvatarDimension is the width and height for square user avatars
	AvatarDimension = 256
	// AvatarJPEGQuality is the JPEG quality for user avatars
	AvatarJPEGQuality = 85
)

// IsImage returns true if content-type or filename extension indicates an image
func IsImage(contentType string, filename string) bool {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if strings.HasPrefix(ct, "image/") {
		return true
	}

	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff":
		return true
	default:
		return false
	}
}

// IsAnimatedGIF returns true if the content is an animated GIF with multiple frames
func IsAnimatedGIF(contentType string, filename string) bool {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	ext := strings.ToLower(filepath.Ext(filename))
	return ct == "image/gif" || ext == ".gif"
}

// isOpaque checks whether an image has no transparency (alpha is 100% everywhere)
func isOpaque(img image.Image) bool {
	bounds := img.Bounds()
	switch m := img.(type) {
	case *image.RGBA:
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			for x := bounds.Min.X; x < bounds.Max.X; x++ {
				if m.RGBAAt(x, y).A < 255 {
					return false
				}
			}
		}
		return true
	case *image.NRGBA:
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			for x := bounds.Min.X; x < bounds.Max.X; x++ {
				if m.NRGBAAt(x, y).A < 255 {
					return false
				}
			}
		}
		return true
	default:
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			for x := bounds.Min.X; x < bounds.Max.X; x++ {
				c := color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
				if c.A < 255 {
					return false
				}
			}
		}
		return true
	}
}

// replaceExt changes a filename extension (e.g. photo.png -> photo.jpg)
func replaceExt(filename, newExt string) string {
	ext := filepath.Ext(filename)
	if ext == "" {
		return filename + newExt
	}
	return strings.TrimSuffix(filename, ext) + newExt
}

// CompressChatImage decodes, auto-orients, resizes (if needed), and compresses chat images.
// It returns compressed data, updated filename, and updated contentType.
func CompressChatImage(r io.Reader, filename string, contentType string) ([]byte, string, string, error) {
	// Decode with automatic EXIF orientation
	img, err := imaging.Decode(r, imaging.AutoOrientation(true))
	if err != nil {
		return nil, filename, contentType, err
	}

	// Resize if dimension exceeds MaxChatImageDimension
	bounds := img.Bounds()
	if bounds.Dx() > MaxChatImageDimension || bounds.Dy() > MaxChatImageDimension {
		img = imaging.Fit(img, MaxChatImageDimension, MaxChatImageDimension, imaging.Lanczos)
	}

	ext := strings.ToLower(filepath.Ext(filename))
	ct := strings.ToLower(strings.TrimSpace(contentType))

	// Check if PNG has transparency
	if (ext == ".png" || ct == "image/png") && !isOpaque(img) {
		// Preserve PNG for transparent images (stickers, logos, transparent graphics)
		var buf bytes.Buffer
		err = imaging.Encode(&buf, img, imaging.PNG)
		if err != nil {
			return nil, filename, contentType, err
		}
		return buf.Bytes(), filename, "image/png", nil
	}

	// For opaque images (JPEG, opaque PNG, BMP, WebP, TIFF), compress as JPEG quality 80
	var buf bytes.Buffer
	err = imaging.Encode(&buf, img, imaging.JPEG, imaging.JPEGQuality(ChatJPEGQuality))
	if err != nil {
		return nil, filename, contentType, err
	}

	newFilename := filename
	if ext != ".jpg" && ext != ".jpeg" {
		newFilename = replaceExt(filename, ".jpg")
	}

	return buf.Bytes(), newFilename, "image/jpeg", nil
}

// CompressAvatar crops and resizes an avatar to AvatarDimension x AvatarDimension JPEG.
func CompressAvatar(r io.Reader) ([]byte, error) {
	// Decode with automatic EXIF orientation
	img, err := imaging.Decode(r, imaging.AutoOrientation(true))
	if err != nil {
		return nil, err
	}

	// Center crop and resize to square avatar
	avatar := imaging.Fill(img, AvatarDimension, AvatarDimension, imaging.Center, imaging.Lanczos)

	var buf bytes.Buffer
	err = imaging.Encode(&buf, avatar, imaging.JPEG, imaging.JPEGQuality(AvatarJPEGQuality))
	if err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}
