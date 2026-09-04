package imgutil

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/disintegration/imaging"
)

func createTestImage(width, height int, c color.Color) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, c)
		}
	}
	return img
}

func createTestTransparentPNG(width, height int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			if (x+y)%2 == 0 {
				img.Set(x, y, color.RGBA{R: 255, G: 0, B: 0, A: 128}) // transparent
			} else {
				img.Set(x, y, color.RGBA{R: 0, G: 255, B: 0, A: 255})
			}
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

func createTestJPEG(width, height int) []byte {
	img := createTestImage(width, height, color.RGBA{R: 100, G: 150, B: 200, A: 255})
	var buf bytes.Buffer
	_ = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95})
	return buf.Bytes()
}

func TestIsImage(t *testing.T) {
	tests := []struct {
		contentType string
		filename    string
		expected    bool
	}{
		{"image/jpeg", "test.jpg", true},
		{"image/png", "test.png", true},
		{"image/webp", "photo.webp", true},
		{"application/octet-stream", "photo.jpg", true},
		{"application/octet-stream", "photo.PNG", true},
		{"application/pdf", "document.pdf", false},
		{"audio/mp3", "song.mp3", false},
		{"text/plain", "readme.txt", false},
	}

	for _, tt := range tests {
		got := IsImage(tt.contentType, tt.filename)
		if got != tt.expected {
			t.Errorf("IsImage(%q, %q) = %v, want %v", tt.contentType, tt.filename, got, tt.expected)
		}
	}
}

func TestCompressChatImage_ResizeLarge(t *testing.T) {
	// Create large 2400x1600 JPEG
	largeJPEG := createTestJPEG(2400, 1600)
	r := bytes.NewReader(largeJPEG)

	compressed, newFilename, newContentType, err := CompressChatImage(r, "my_vacation_photo.jpeg", "image/jpeg")
	if err != nil {
		t.Fatalf("CompressChatImage failed: %v", err)
	}

	if newContentType != "image/jpeg" {
		t.Errorf("expected content type image/jpeg, got %s", newContentType)
	}
	if newFilename != "my_vacation_photo.jpeg" {
		t.Errorf("expected filename preserved, got %s", newFilename)
	}

	// Verify dimensions of compressed image
	decoded, err := imaging.Decode(bytes.NewReader(compressed))
	if err != nil {
		t.Fatalf("failed to decode compressed image: %v", err)
	}

	bounds := decoded.Bounds()
	if bounds.Dx() > MaxChatImageDimension || bounds.Dy() > MaxChatImageDimension {
		t.Errorf("compressed image exceeds max dimension %d: got %dx%d", MaxChatImageDimension, bounds.Dx(), bounds.Dy())
	}
	if bounds.Dx() != MaxChatImageDimension {
		t.Errorf("expected width to be resized to %d, got %d", MaxChatImageDimension, bounds.Dx())
	}
}

func TestCompressChatImage_TransparentPNG(t *testing.T) {
	// Transparent PNG should remain PNG
	transPNG := createTestTransparentPNG(200, 200)
	r := bytes.NewReader(transPNG)

	compressed, newFilename, newContentType, err := CompressChatImage(r, "sticker.png", "image/png")
	if err != nil {
		t.Fatalf("CompressChatImage failed: %v", err)
	}

	if newContentType != "image/png" {
		t.Errorf("expected image/png for transparent image, got %s", newContentType)
	}
	if newFilename != "sticker.png" {
		t.Errorf("expected sticker.png, got %s", newFilename)
	}
	if len(compressed) == 0 {
		t.Error("compressed data is empty")
	}
}

func TestCompressChatImage_OpaquePNGConvertsToJPEG(t *testing.T) {
	// Opaque PNG should convert to JPEG for high compression
	opaqueImg := createTestImage(500, 500, color.RGBA{R: 200, G: 50, B: 50, A: 255})
	var buf bytes.Buffer
	_ = png.Encode(&buf, opaqueImg)

	r := bytes.NewReader(buf.Bytes())
	compressed, newFilename, newContentType, err := CompressChatImage(r, "screenshot.png", "image/png")
	if err != nil {
		t.Fatalf("CompressChatImage failed: %v", err)
	}

	if newContentType != "image/jpeg" {
		t.Errorf("expected image/jpeg for opaque image, got %s", newContentType)
	}
	if newFilename != "screenshot.jpg" {
		t.Errorf("expected screenshot.jpg, got %s", newFilename)
	}
	if len(compressed) == 0 {
		t.Error("compressed data is empty")
	}
}

func TestCompressAvatar(t *testing.T) {
	rawJPEG := createTestJPEG(800, 600)
	r := bytes.NewReader(rawJPEG)

	compressed, err := CompressAvatar(r)
	if err != nil {
		t.Fatalf("CompressAvatar failed: %v", err)
	}

	decoded, err := imaging.Decode(bytes.NewReader(compressed))
	if err != nil {
		t.Fatalf("failed to decode avatar: %v", err)
	}

	bounds := decoded.Bounds()
	if bounds.Dx() != AvatarDimension || bounds.Dy() != AvatarDimension {
		t.Errorf("expected avatar dimensions %dx%d, got %dx%d", AvatarDimension, AvatarDimension, bounds.Dx(), bounds.Dy())
	}
}
