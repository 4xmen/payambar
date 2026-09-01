package ws

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type PendingCall struct {
	Event     *MessageEvent
	CreatedAt time.Time
}

type Hub struct {
	clients      map[int]*Client
	pendingCalls map[int]*PendingCall
	broadcast    chan interface{}
	register     chan *Client
	unregister   chan *Client
	db           *sql.DB
	mu           sync.RWMutex
	pushNotifier PushNotifier
}

// PushNotifier sends push notifications to offline users.
type PushNotifier interface {
	SendNewMessageNotification(receiverID int, senderUsername string)
	SendIncomingCallNotification(receiverID int, senderUsername string, callerID int)
}

type Client struct {
	userID int
	conn   *websocket.Conn
	hub    *Hub
	send   chan interface{}
}

type InboundEvent struct {
	Type           string                 `json:"type"`
	MessageID      int                    `json:"message_id,omitempty"`
	ReceiverID     int                    `json:"receiver_id,omitempty"`
	ClientMsgID    string                 `json:"client_message_id,omitempty"`
	Content        string                 `json:"content,omitempty"`
	Encrypted      bool                   `json:"encrypted,omitempty"`
	E2EEVersion    int                    `json:"e2ee_v,omitempty"`
	Algorithm      string                 `json:"alg,omitempty"`
	SenderDeviceID string                 `json:"sender_device_id,omitempty"`
	KeyID          string                 `json:"key_id,omitempty"`
	IV             string                 `json:"iv,omitempty"`
	Ciphertext     string                 `json:"ciphertext,omitempty"`
	AAD            string                 `json:"aad,omitempty"`
	Payload        map[string]interface{} `json:"payload,omitempty"`
}

func parseInboundEvent(v interface{}) *InboundEvent {
	switch e := v.(type) {
	case *InboundEvent:
		return e
	case InboundEvent:
		return &e
	case map[string]interface{}:
		ev := &InboundEvent{}
		if t, ok := e["type"].(string); ok {
			ev.Type = t
		}
		if mid, ok := e["message_id"].(float64); ok {
			ev.MessageID = int(mid)
		} else if mid, ok := e["message_id"].(int); ok {
			ev.MessageID = mid
		}
		if rid, ok := e["receiver_id"].(float64); ok {
			ev.ReceiverID = int(rid)
		} else if rid, ok := e["receiver_id"].(int); ok {
			ev.ReceiverID = rid
		}
		if cmsg, ok := e["client_message_id"].(string); ok {
			ev.ClientMsgID = cmsg
		}
		if cnt, ok := e["content"].(string); ok {
			ev.Content = cnt
		}
		if enc, ok := e["encrypted"].(bool); ok {
			ev.Encrypted = enc
		}
		if e2eev, ok := e["e2ee_v"].(float64); ok {
			ev.E2EEVersion = int(e2eev)
		} else if e2eev, ok := e["e2ee_v"].(int); ok {
			ev.E2EEVersion = e2eev
		}
		if alg, ok := e["alg"].(string); ok {
			ev.Algorithm = alg
		}
		if sdev, ok := e["sender_device_id"].(string); ok {
			ev.SenderDeviceID = sdev
		}
		if kid, ok := e["key_id"].(string); ok {
			ev.KeyID = kid
		}
		if iv, ok := e["iv"].(string); ok {
			ev.IV = iv
		}
		if cipher, ok := e["ciphertext"].(string); ok {
			ev.Ciphertext = cipher
		}
		if aad, ok := e["aad"].(string); ok {
			ev.AAD = aad
		}
		if p, ok := e["payload"].(map[string]interface{}); ok {
			ev.Payload = p
		}
		return ev
	default:
		return nil
	}
}

type MessageEvent struct {
	Type           string                 `json:"type"` // "message", "status_update"
	MessageID      int                    `json:"message_id,omitempty"`
	ClientMsgID    string                 `json:"client_message_id,omitempty"`
	SenderID       int                    `json:"sender_id,omitempty"`
	ReceiverID     int                    `json:"receiver_id,omitempty"`
	Content        string                 `json:"content,omitempty"`
	Encrypted      bool                   `json:"encrypted,omitempty"`
	E2EEVersion    int                    `json:"e2ee_v,omitempty"`
	Algorithm      string                 `json:"alg,omitempty"`
	SenderDeviceID string                 `json:"sender_device_id,omitempty"`
	KeyID          string                 `json:"key_id,omitempty"`
	IV             string                 `json:"iv,omitempty"`
	Ciphertext     string                 `json:"ciphertext,omitempty"`
	AAD            string                 `json:"aad,omitempty"`
	Status         string                 `json:"status,omitempty"`
	CreatedAt      time.Time              `json:"created_at,omitempty"`
	DeliveredAt    *time.Time             `json:"delivered_at,omitempty"`
	ReadAt         *time.Time             `json:"read_at,omitempty"`
	FileName       string                 `json:"file_name,omitempty"`
	FileURL        string                 `json:"file_url,omitempty"`
	FileType       string                 `json:"file_content_type,omitempty"`
	Payload        map[string]interface{} `json:"payload,omitempty"`
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// In production, validate origin
		return true
	},
}

func NewHub(db *sql.DB) *Hub {
	return &Hub{
		clients:      make(map[int]*Client),
		pendingCalls: make(map[int]*PendingCall),
		broadcast:    make(chan interface{}, 256),
		register:     make(chan *Client),
		unregister:   make(chan *Client),
		db:           db,
	}
}

// SetPushNotifier sets the push notifier on the hub.
func (h *Hub) SetPushNotifier(pn PushNotifier) {
	h.pushNotifier = pn
}

// IsUserOnline checks if a user is currently connected
func (h *Hub) IsUserOnline(userID int) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.clients[userID]
	return ok
}

// BroadcastMessage allows handlers to broadcast a message event to connected clients
func (h *Hub) BroadcastMessage(messageID, senderID, receiverID int, content, status, fileName, fileURL, fileType string) {
	msg := &MessageEvent{
		Type:       "message",
		MessageID:  messageID,
		SenderID:   senderID,
		ReceiverID: receiverID,
		Content:    content,
		Status:     status,
		CreatedAt:  time.Now(),
		FileName:   fileName,
		FileURL:    fileURL,
		FileType:   fileType,
	}
	h.broadcast <- msg
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.userID] = client
			var pendingOffer *MessageEvent
			if pending, ok := h.pendingCalls[client.userID]; ok {
				if time.Since(pending.CreatedAt) < 45*time.Second {
					pendingOffer = pending.Event
				}
				delete(h.pendingCalls, client.userID)
			}
			h.mu.Unlock()
			log.Printf("User %d connected (total: %d)", client.userID, len(h.clients))
			if pendingOffer != nil {
				select {
				case client.send <- pendingOffer:
					log.Printf("Delivered pending call offer to user %d from user %d", client.userID, pendingOffer.SenderID)
				default:
				}
			}

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.userID]; ok {
				delete(h.clients, client.userID)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("User %d disconnected (total: %d)", client.userID, len(h.clients))

		case message := <-h.broadcast:
			h.broadcast_message(message)
		}
	}
}

func (h *Hub) broadcast_message(message interface{}) {
	switch msg := message.(type) {
	case *MessageEvent:
		if msg.Type == "message" {
			// Check if receiver is connected
			h.mu.RLock()
			receiverOnline := false
			if client, ok := h.clients[msg.ReceiverID]; ok {
				receiverOnline = true
				select {
				case client.send <- msg:
				default:
					log.Printf("Message channel full for user %d", msg.ReceiverID)
				}
			}
			// Also send to sender so they get the canonical message id
			if sender, ok := h.clients[msg.SenderID]; ok {
				select {
				case sender.send <- msg:
				default:
				}
			}
			h.mu.RUnlock()

			if !receiverOnline && h.pushNotifier != nil {
				// Receiver is offline — fetch sender username and send push notification asynchronously
				receiverID := msg.ReceiverID
				senderID := msg.SenderID
				pn := h.pushNotifier
				dbConn := h.db
				go func(rID, sID int) {
					var senderUsername string
					if dbConn != nil {
						_ = dbConn.QueryRow("SELECT username FROM users WHERE id = ?", sID).Scan(&senderUsername)
					}
					if senderUsername == "" {
						senderUsername = "someone"
					}
					pn.SendNewMessageNotification(rID, senderUsername)
				}(receiverID, senderID)
			}
		} else if msg.Type == "status_update" {
			// Broadcast status updates to both sender and receiver when available
			h.mu.RLock()
			if client, ok := h.clients[msg.SenderID]; ok {
				select {
				case client.send <- msg:
				default:
				}
			}
			if client, ok := h.clients[msg.ReceiverID]; ok {
				select {
				case client.send <- msg:
				default:
				}
			}
			h.mu.RUnlock()
		} else {
			// WebRTC signaling - forward to receiver if online
			h.mu.Lock()
			client, receiverOnline := h.clients[msg.ReceiverID]
			if receiverOnline {
				select {
				case client.send <- msg:
				default:
				}
			}

			if msg.Type == "call_offer" {
				if !receiverOnline {
					h.pendingCalls[msg.ReceiverID] = &PendingCall{
						Event:     msg,
						CreatedAt: time.Now(),
					}
				}
			} else if msg.Type == "call_hangup" || msg.Type == "call_reject" {
				delete(h.pendingCalls, msg.ReceiverID)
				delete(h.pendingCalls, msg.SenderID)
			}
			h.mu.Unlock()

			// If receiver is offline and it's a call offer, send incoming call push notification asynchronously
			if msg.Type == "call_offer" && !receiverOnline && h.pushNotifier != nil {
				receiverID := msg.ReceiverID
				senderID := msg.SenderID
				pn := h.pushNotifier
				dbConn := h.db
				go func(rID, sID int) {
					var senderUsername string
					if dbConn != nil {
						_ = dbConn.QueryRow("SELECT username FROM users WHERE id = ?", sID).Scan(&senderUsername)
					}
					if senderUsername == "" {
						senderUsername = "someone"
					}
					pn.SendIncomingCallNotification(rID, senderUsername, sID)
				}(receiverID, senderID)
			}
		}
	}
}

func (h *Hub) HandleWebSocket(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": __("unauthorized")})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Upgrade error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": __("websocket upgrade failed")})
		return
	}

	client := &Client{
		userID: userID.(int),
		conn:   conn,
		hub:    h,
		send:   make(chan interface{}, 256),
	}

	h.register <- client

	go client.readPump()
	go client.writePump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var event InboundEvent
		if err := json.Unmarshal(data, &event); err != nil {
			continue
		}

		switch event.Type {
		case "message":
			c.handleMessageEvent(&event)
		case "mark_delivered":
			c.handleMarkDelivered(&event)
		case "mark_read":
			c.handleMarkRead(&event)
		case "call_offer", "call_answer", "ice_candidate", "call_reject", "call_hangup":
			c.handleSignalingEvent(&event)
		}
	}
}

func (c *Client) handleMessageEvent(rawEvent interface{}) {
	event := parseInboundEvent(rawEvent)
	if event == nil || event.ReceiverID <= 0 {
		return
	}

	clientMsgID := event.ClientMsgID
	encrypted := event.Encrypted

	var (
		content        string
		e2eeVersion    int
		algorithm      string
		senderDeviceID string
		keyID          string
		iv             string
		ciphertext     string
		aad            string
	)

	if encrypted {
		e2eeVersion = event.E2EEVersion
		algorithm = event.Algorithm
		senderDeviceID = event.SenderDeviceID
		keyID = event.KeyID
		iv = event.IV
		ciphertext = event.Ciphertext
		aad = event.AAD
		if e2eeVersion <= 0 || algorithm == "" || senderDeviceID == "" || keyID == "" || iv == "" || ciphertext == "" {
			return
		}
		content = ""
	} else {
		content = event.Content
		if content == "" {
			return
		}
	}

	// Save message to database
	result, err := c.hub.db.Exec(`
		INSERT INTO messages (sender_id, receiver_id, content, encrypted, e2ee_v, alg, sender_device_id, key_id, iv, ciphertext, aad, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', CURRENT_TIMESTAMP)
	`, c.userID, event.ReceiverID, content, encrypted, e2eeVersion, algorithm, senderDeviceID, keyID, iv, ciphertext, aad)

	if err != nil {
		log.Printf("Failed to save message: %v", err)
		return
	}

	msgID, _ := result.LastInsertId()

	// Broadcast to hub
	msg := &MessageEvent{
		Type:           "message",
		MessageID:      int(msgID),
		SenderID:       c.userID,
		ReceiverID:     event.ReceiverID,
		ClientMsgID:    clientMsgID,
		Content:        content,
		Encrypted:      encrypted,
		E2EEVersion:    e2eeVersion,
		Algorithm:      algorithm,
		SenderDeviceID: senderDeviceID,
		KeyID:          keyID,
		IV:             iv,
		Ciphertext:     ciphertext,
		AAD:            aad,
		Status:         "sent",
		CreatedAt:      time.Now(),
	}

	c.hub.broadcast <- msg
}

func (c *Client) handleSignalingEvent(rawEvent interface{}) {
	event := parseInboundEvent(rawEvent)
	if event == nil || event.ReceiverID <= 0 {
		return
	}

	msg := &MessageEvent{
		Type:       event.Type,
		SenderID:   c.userID,
		ReceiverID: event.ReceiverID,
		Payload:    event.Payload,
	}

	c.hub.broadcast <- msg
}

func (c *Client) handleMarkDelivered(rawEvent interface{}) {
	event := parseInboundEvent(rawEvent)
	if event == nil || event.MessageID <= 0 {
		return
	}

	// Update database and retrieve sender_id in a single query
	var senderID int
	err := c.hub.db.QueryRow(`
		UPDATE messages 
		SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
		WHERE id = ? AND receiver_id = ? AND status = 'sent'
		RETURNING sender_id
	`, event.MessageID, c.userID).Scan(&senderID)

	if err != nil {
		return
	}

	// Broadcast status update
	msg := &MessageEvent{
		Type:       "status_update",
		MessageID:  event.MessageID,
		Status:     "delivered",
		SenderID:   senderID,
		ReceiverID: c.userID,
	}

	c.hub.broadcast <- msg
}

func (c *Client) handleMarkRead(rawEvent interface{}) {
	event := parseInboundEvent(rawEvent)
	if event == nil || event.MessageID <= 0 {
		return
	}

	// Update database and retrieve sender_id in a single query
	var senderID int
	err := c.hub.db.QueryRow(`
		UPDATE messages 
		SET status = 'read', read_at = CURRENT_TIMESTAMP
		WHERE id = ? AND receiver_id = ? AND status != 'read'
		RETURNING sender_id
	`, event.MessageID, c.userID).Scan(&senderID)

	if err != nil {
		return
	}

	// Broadcast status update
	msg := &MessageEvent{
		Type:       "status_update",
		MessageID:  event.MessageID,
		Status:     "read",
		SenderID:   senderID,
		ReceiverID: c.userID,
	}

	c.hub.broadcast <- msg
}

func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}

			data, _ := json.Marshal(message)
			w.Write(data)

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
