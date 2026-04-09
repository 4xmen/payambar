package turnserver

import (
	"errors"
	"fmt"
	"net"

	"github.com/pion/logging"
	"github.com/pion/turn/v4"
)

// Config defines runtime options for the embedded TURN server.
type Config struct {
	ListenAddress string
	ListenPort    uint16
	RelayAddress  string
	RelayMinPort  uint16
	RelayMaxPort  uint16
	Realm         string
	ExternalIP    string
	Username      string
	Password      string
}

// Server wraps the Pion TURN server lifecycle.
type Server struct {
	cfg         Config
	server      *turn.Server
	udpListener net.PacketConn
	tcpListener net.Listener
}

func New(cfg Config) (*Server, error) {
	if cfg.ListenAddress == "" {
		return nil, errors.New("turn listen address is required")
	}
	if cfg.ListenPort == 0 {
		return nil, errors.New("turn listen port must be greater than zero")
	}
	if cfg.RelayMinPort == 0 || cfg.RelayMaxPort == 0 || cfg.RelayMinPort > cfg.RelayMaxPort {
		return nil, errors.New("invalid TURN relay port range")
	}
	if cfg.Realm == "" {
		return nil, errors.New("turn realm is required")
	}
	if cfg.Username == "" || cfg.Password == "" {
		return nil, errors.New("turn username and password are required")
	}
	if cfg.RelayAddress == "" {
		cfg.RelayAddress = "0.0.0.0"
	}

	return &Server{cfg: cfg}, nil
}

func (s *Server) Start() error {
	if s.server != nil {
		return nil
	}

	listenAddr := net.JoinHostPort(s.cfg.ListenAddress, fmt.Sprintf("%d", s.cfg.ListenPort))
	udpConn, err := net.ListenPacket("udp4", listenAddr)
	if err != nil {
		return fmt.Errorf("failed to listen TURN UDP on %s: %w", listenAddr, err)
	}

	tcpListener, err := net.Listen("tcp4", listenAddr)
	if err != nil {
		_ = udpConn.Close()
		return fmt.Errorf("failed to listen TURN TCP on %s: %w", listenAddr, err)
	}

	relayIP, err := resolveRelayIP(s.cfg.ExternalIP)
	if err != nil {
		_ = udpConn.Close()
		_ = tcpListener.Close()
		return err
	}

	relayGenerator := &turn.RelayAddressGeneratorPortRange{
		RelayAddress: relayIP,
		Address:      s.cfg.RelayAddress,
		MinPort:      s.cfg.RelayMinPort,
		MaxPort:      s.cfg.RelayMaxPort,
	}

	server, err := turn.NewServer(turn.ServerConfig{
		Realm:         s.cfg.Realm,
		LoggerFactory: logging.NewDefaultLoggerFactory(),
		AuthHandler: func(username, realm string, srcAddr net.Addr) ([]byte, bool) {
			if username != s.cfg.Username {
				return nil, false
			}
			return turn.GenerateAuthKey(username, realm, s.cfg.Password), true
		},
		PacketConnConfigs: []turn.PacketConnConfig{{
			PacketConn:            udpConn,
			RelayAddressGenerator: relayGenerator,
		}},
		ListenerConfigs: []turn.ListenerConfig{{
			Listener:              tcpListener,
			RelayAddressGenerator: relayGenerator,
		}},
	})
	if err != nil {
		_ = udpConn.Close()
		_ = tcpListener.Close()
		return fmt.Errorf("failed to create TURN server: %w", err)
	}

	s.server = server
	s.udpListener = udpConn
	s.tcpListener = tcpListener
	return nil
}

func (s *Server) Close() error {
	var closeErr error
	if s.server != nil {
		if err := s.server.Close(); err != nil {
			closeErr = err
		}
		s.server = nil
	}
	if s.udpListener != nil {
		_ = s.udpListener.Close()
		s.udpListener = nil
	}
	if s.tcpListener != nil {
		_ = s.tcpListener.Close()
		s.tcpListener = nil
	}
	return closeErr
}

func resolveRelayIP(externalIP string) (net.IP, error) {
	if externalIP != "" {
		ip := net.ParseIP(externalIP)
		if ip == nil {
			return nil, fmt.Errorf("invalid TURN_EXTERNAL_IP: %s", externalIP)
		}
		return ip, nil
	}

	ip, err := firstNonLoopbackIPv4()
	if err != nil {
		return nil, fmt.Errorf("TURN_EXTERNAL_IP is required for production deployments behind NAT: %w", err)
	}
	return ip, nil
}

func firstNonLoopbackIPv4() (net.IP, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			ip = ip.To4()
			if ip != nil {
				return ip, nil
			}
		}
	}

	return nil, errors.New("no non-loopback IPv4 address found")
}
