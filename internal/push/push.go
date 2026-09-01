package push

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// Notifier sends Web Push notifications to subscribed users.
type Notifier struct {
	db              *sql.DB
	vapidPublicKey  string
	vapidPrivateKey string
	lastMessagePush map[string]time.Time
	mu              sync.Mutex
}

// Subscription represents a stored Web Push subscription.
type Subscription struct {
	Endpoint  string `json:"endpoint"`
	KeyP256dh string `json:"p256dh"`
	KeyAuth   string `json:"auth"`
}

// NewNotifier creates a push Notifier. Returns nil if VAPID keys are empty.
func NewNotifier(db *sql.DB, vapidPublicKey, vapidPrivateKey string) *Notifier {
	if vapidPublicKey == "" || vapidPrivateKey == "" {
		return nil
	}
	return &Notifier{
		db:              db,
		vapidPublicKey:  vapidPublicKey,
		vapidPrivateKey: vapidPrivateKey,
		lastMessagePush: make(map[string]time.Time),
	}
}

// VAPIDPublicKey returns the public VAPID key for the frontend.
func (n *Notifier) VAPIDPublicKey() string {
	return n.vapidPublicKey
}

// payload is the JSON structure sent inside the push notification.
type payload struct {
	Type           string `json:"type,omitempty"`
	Title          string `json:"title"`
	Body           string `json:"body"`
	URL            string `json:"url"`
	CallerID       int    `json:"caller_id,omitempty"`
	CallerUsername string `json:"caller_username,omitempty"`
	SenderUsername string `json:"sender_username,omitempty"`
}

// SendNewMessageNotification sends a push notification to all subscriptions of receiverID (throttled to 1 per 25s per sender).
func (n *Notifier) SendNewMessageNotification(receiverID int, senderUsername string) {
	if n == nil {
		return
	}

	key := fmt.Sprintf("%d:%s", receiverID, senderUsername)
	n.mu.Lock()
	if n.lastMessagePush == nil {
		n.lastMessagePush = make(map[string]time.Time)
	}
	now := time.Now()
	// Periodic cleanup of expired entries if map gets large
	if len(n.lastMessagePush) > 200 {
		for k, t := range n.lastMessagePush {
			if now.Sub(t) > 30*time.Second {
				delete(n.lastMessagePush, k)
			}
		}
	}
	if last, ok := n.lastMessagePush[key]; ok && now.Sub(last) < 25*time.Second {
		n.mu.Unlock()
		return
	}
	n.lastMessagePush[key] = now
	n.mu.Unlock()

	n.sendToUser(receiverID, payload{
		Type:           "message",
		Title:          "پیام جدید",
		Body:           "پیام جدید از " + senderUsername,
		SenderUsername: senderUsername,
		URL:            "/",
	}, 86400, webpush.UrgencyNormal)
}

// SendIncomingCallNotification sends an urgent push notification for an incoming call.
func (n *Notifier) SendIncomingCallNotification(receiverID int, callerUsername string, callerID int) {
	n.sendToUser(receiverID, payload{
		Type:           "incoming_call",
		Title:          "📞 تماس صوتی ورودی",
		Body:           "تماس از طرف " + callerUsername,
		CallerUsername: callerUsername,
		CallerID:       callerID,
		URL:            fmt.Sprintf("/?call_from=%d", callerID),
	}, 45, webpush.UrgencyHigh)
}

func (n *Notifier) sendToUser(receiverID int, p payload, ttl int, urgency webpush.Urgency) {
	if n == nil {
		return
	}

	rows, err := n.db.Query(
		"SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL",
		receiverID,
	)
	if err != nil {
		log.Printf("push: failed to query subscriptions for user %d: %v", receiverID, err)
		return
	}
	defer rows.Close()

	data, _ := json.Marshal(p)
	var subs []Subscription
	for rows.Next() {
		var sub Subscription
		if err := rows.Scan(&sub.Endpoint, &sub.KeyP256dh, &sub.KeyAuth); err == nil {
			subs = append(subs, sub)
		}
	}
	if err := rows.Err(); err != nil {
		log.Printf("push: error iterating subscriptions for user %d: %v", receiverID, err)
		return
	}

	if len(subs) == 0 {
		return
	}

	log.Printf("push: sending %s notification to %d subscription(s) for user %d", p.Type, len(subs), receiverID)
	for _, sub := range subs {
		go n.sendToSubscriptionWithOptions(sub, data, ttl, urgency)
	}
}

func (n *Notifier) sendToSubscriptionWithOptions(sub Subscription, data []byte, ttl int, urgency webpush.Urgency) {
	s := &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.KeyP256dh,
			Auth:   sub.KeyAuth,
		},
	}

	httpClient := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := webpush.SendNotification(data, s, &webpush.Options{
		HTTPClient:      httpClient,
		VAPIDPublicKey:  n.vapidPublicKey,
		VAPIDPrivateKey: n.vapidPrivateKey,
		Subscriber:      "mailto:push@payambar.local",
		TTL:             ttl,
		Urgency:         urgency,
	})
	if err != nil {
		log.Printf("error: push failed to send: %v", err)
		return
	}
	defer resp.Body.Close()

	log.Printf("push: sent to %s — status %d", sub.Endpoint, resp.StatusCode)

	// 410 Gone or 404 means the subscription is expired — clean it up
	if resp.StatusCode == 410 || resp.StatusCode == 404 {
		n.db.Exec("DELETE FROM push_subscriptions WHERE endpoint = ?", sub.Endpoint)
		log.Printf("push: removed expired subscription %s (status %d)", sub.Endpoint, resp.StatusCode)
	}
}
