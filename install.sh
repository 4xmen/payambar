#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="payambar"
REPO="4xmen/payambar"
INSTALL_DIR="/opt/${SERVICE_NAME}"
DATA_DIR="/opt/${SERVICE_NAME}/data"
UPLOAD_DIR="${DATA_DIR}/uploads"
ENV_DIR="/opt/${SERVICE_NAME}"
ENV_FILE="${ENV_DIR}/.env"
SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
TARGET_OS=""
TARGET_ARCH=""
ACTION="install"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[error] Required command '$1' not found. Install it and retry." >&2
    exit 1
  fi
}

ensure_root() {
  if [ "${EUID}" -ne 0 ]; then
    if [ -f "$0" ]; then
      exec sudo -E bash "$0" "$@"
    else
      echo "[error] This script must be run as root (or with sudo)." >&2
      echo "[error] Please re-run with: sudo bash ..." >&2
      exit 1
    fi
  fi
}

usage() {
  cat <<EOF
Usage: $0 [--install|--update]

Options:
  --install   Install or reinstall ${SERVICE_NAME} (default)
  --update    Update existing ${SERVICE_NAME} binary to latest release
  -h, --help  Show this help
EOF
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --install)
        ACTION="install"
        ;;
      --update)
        ACTION="update"
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "[error] Unknown argument: $1" >&2
        usage
        exit 1
        ;;
    esac
    shift
  done
}

detect_platform() {
  local raw_os raw_arch
  raw_os=$(uname -s | tr '[:upper:]' '[:lower:]')
  raw_arch=$(uname -m)

  case "${raw_os}" in
    linux)
      TARGET_OS="linux"
      ;;
    *)
      echo "[error] Unsupported OS '${raw_os}'. This installer currently supports Linux systemd hosts." >&2
      exit 1
      ;;
  esac

  case "${raw_arch}" in
    x86_64|amd64)
      TARGET_ARCH="amd64"
      ;;
    aarch64|arm64|armv8*)
      TARGET_ARCH="arm64"
      ;;
    *)
      echo "[error] Unsupported CPU architecture '${raw_arch}'." >&2
      exit 1
      ;;
  esac
}

ensure_update_target_exists() {
  if [ "${ACTION}" = "update" ] && [ ! -x "${INSTALL_DIR}/payambar" ]; then
    echo "[error] Update requested but ${INSTALL_DIR}/payambar is not installed." >&2
    echo "[error] Run with --install first." >&2
    exit 1
  fi
}

generate_jwt_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import secrets; print(secrets.token_hex(32))'
  else
    od -An -N32 -tx1 /dev/urandom 2>/dev/null | tr -d '[:space:]'
  fi
}

generate_vapid_keys() {
  # Generate VAPID keypair for Web Push notifications using openssl
  require_cmd openssl
  local tmpdir
  tmpdir=$(mktemp -d)
  openssl ecparam -genkey -name prime256v1 -noout -out "${tmpdir}/vapid_private.pem" 2>/dev/null
  # Extract raw private key (32 bytes) as base64url
  VAPID_PRIVATE_KEY=$(openssl ec -in "${tmpdir}/vapid_private.pem" -outform DER 2>/dev/null \
    | tail -c +8 | head -c 32 \
    | openssl base64 -A | tr '+/' '-_' | tr -d '=\r\n')
  # Extract raw public key (65 bytes, uncompressed) as base64url
  VAPID_PUBLIC_KEY=$(openssl ec -in "${tmpdir}/vapid_private.pem" -pubout -outform DER 2>/dev/null \
    | tail -c 65 \
    | openssl base64 -A | tr '+/' '-_' | tr -d '=\r\n')
  rm -rf "${tmpdir}"
}

is_elf_binary() {
  local file_path="$1"
  local magic
  magic=$(od -An -t x1 -N4 "${file_path}" 2>/dev/null | tr -d '[:space:]')
  [ "${magic}" = "7f454c46" ]
}

fetch_latest_asset_url() {
  local url=""
  local api_response=""

  # Try fetching via GitHub API first
  api_response=$(curl -fsSL \
    -H "Accept: application/vnd.github+json" \
    -H "User-Agent: ${SERVICE_NAME}-installer" \
    "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null) || true

  if [ -n "${api_response}" ]; then
    url=$(echo "${api_response}" | TARGET_OS="${TARGET_OS}" TARGET_ARCH="${TARGET_ARCH}" python3 -c '
import json
import re
import sys
import os

try:
    data = json.load(sys.stdin)
    assets = data.get("assets") or []
    target_os = os.environ.get("TARGET_OS", "")
    target_arch = os.environ.get("TARGET_ARCH", "")
    patterns = [
        rf"{target_os}[-_.]?{target_arch}",
        rf"{target_os}.*{target_arch}",
        rf"{target_os}[-_.]?(x86_64|amd64|64)" if target_arch == "amd64" else rf"{target_os}[-_.]?(aarch64|arm64)",
    ]
    for pat in patterns:
        for asset in assets:
            name = asset.get("name", "")
            if re.search(pat, name, re.IGNORECASE):
                print(asset.get("browser_download_url", ""))
                sys.exit(0)
except Exception:
    pass
sys.exit(1)
' 2>/dev/null) || true
  fi

  # Fallback: construct standard release URL if GitHub API was empty, rate-limited, or failed
  if [ -z "${url}" ]; then
    local direct_url="https://github.com/${REPO}/releases/latest/download/${SERVICE_NAME}-${TARGET_OS}-${TARGET_ARCH}.zip"
    if curl -fsIL "${direct_url}" >/dev/null 2>&1; then
      url="${direct_url}"
    fi
  fi

  if [ -z "${url}" ]; then
    echo "[error] Could not find a release asset for ${TARGET_OS}/${TARGET_ARCH}." >&2
    exit 1
  fi

  echo "${url}"
}

download_and_extract() {
  local asset_url="$1"
  local workdir
  workdir=$(mktemp -d)
  local archive="${workdir}/release.bin"

  echo "[info] Downloading ${asset_url}" >&2
  curl -fL "${asset_url}" -o "${archive}"

  echo "[info] Extracting archive" >&2
  case "${asset_url}" in
    *.tar.gz|*.tgz)
      tar -xzf "${archive}" -C "${workdir}"
      ;;
    *.zip)
      if command -v unzip >/dev/null 2>&1; then
        unzip -q "${archive}" -d "${workdir}"
      elif command -v python3 >/dev/null 2>&1; then
        python3 -m zipfile -e "${archive}" "${workdir}"
      else
        require_cmd unzip
      fi
      ;;
    *)
      # Assume it's a raw binary
      cp "${archive}" "${workdir}/payambar"
      ;;
  esac

  local bin_path=""
  local candidates

  candidates=$(find "${workdir}" -maxdepth 5 -type f \( \
    -name "payambar-${TARGET_OS}-${TARGET_ARCH}" -o \
    -name "payambar" -o \
    -name "payambar*" \
  \) | sort)

  while IFS= read -r candidate; do
    [ -n "${candidate}" ] || continue
    case "${candidate}" in
      *.txt|*.md|*.sha256|*.sha512|*.sum|*.asc|*.sig|*.bin|*.zip|*.tar.gz|*.tgz)
        continue
        ;;
    esac
    if is_elf_binary "${candidate}"; then
      bin_path="${candidate}"
      break
    fi
  done <<EOF
${candidates}
EOF

  if [ -z "${bin_path}" ]; then
    echo "[error] Unable to locate payambar binary in downloaded asset." >&2
    echo "[error] Found files were not valid Linux ELF binaries for ${TARGET_OS}/${TARGET_ARCH}." >&2
    rm -rf "${workdir}"
    exit 1
  fi
  chmod +x "${bin_path}"

  echo "${bin_path}"
}

setup_user_and_dirs() {
  if ! getent group "${SERVICE_NAME}" >/dev/null 2>&1 && ! id -g "${SERVICE_NAME}" >/dev/null 2>&1; then
    groupadd --system "${SERVICE_NAME}" 2>/dev/null || true
  fi

  if ! id -u "${SERVICE_NAME}" >/dev/null 2>&1; then
    local nologin_shell="/usr/sbin/nologin"
    if [ ! -x "${nologin_shell}" ]; then
      nologin_shell="/sbin/nologin"
      if [ ! -x "${nologin_shell}" ]; then
        nologin_shell="/bin/false"
      fi
    fi
    useradd --system --no-create-home --shell "${nologin_shell}" -g "${SERVICE_NAME}" "${SERVICE_NAME}" 2>/dev/null || \
    useradd --system --no-create-home --shell "${nologin_shell}" "${SERVICE_NAME}" 2>/dev/null || \
    useradd --system "${SERVICE_NAME}"
  fi

  install -d -m 755 "${INSTALL_DIR}" "${DATA_DIR}" "${UPLOAD_DIR}" "${ENV_DIR}"
  chown -R "${SERVICE_NAME}:${SERVICE_NAME}" "${DATA_DIR}" "${UPLOAD_DIR}"
}

install_binary() {
  local src_bin="$1"
  install -m 755 "${src_bin}" "${INSTALL_DIR}/payambar"
  chown "root:root" "${INSTALL_DIR}/payambar"
}

write_env_file() {
  if [ ! -f "${ENV_FILE}" ]; then
    generate_vapid_keys
    cat >"${ENV_FILE}" <<EOF
PORT=8080
ENVIRONMENT=production
DATABASE_PATH=${DATA_DIR}/payambar.db
FILE_STORAGE_PATH=${UPLOAD_DIR}
JWT_SECRET=$(generate_jwt_secret)
CORS_ORIGINS=*
MAX_UPLOAD_SIZE=10485760
STUN_SERVERS=stun:stun.l.google.com:19302
TURN_SERVER=
TURN_USERNAME=
TURN_PASSWORD=
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
EOF
    chmod 640 "${ENV_FILE}"
    chown "root:${SERVICE_NAME}" "${ENV_FILE}" 2>/dev/null || chown "root:root" "${ENV_FILE}"
  fi
}

write_systemd_unit() {
  if [ -f "${SYSTEMD_UNIT}" ]; then
    echo "[info] Systemd unit ${SYSTEMD_UNIT} already exists, keeping existing configuration."
    return
  fi
  cat >"${SYSTEMD_UNIT}" <<EOF
[Unit]
Description=Payambar messenger server
After=network.target

[Service]
User=${SERVICE_NAME}
Group=${SERVICE_NAME}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${INSTALL_DIR}/payambar
Restart=on-failure
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
}

start_service() {
  touch "${DATA_DIR}/payambar.db"
  chown -R "${SERVICE_NAME}:${SERVICE_NAME}" "${DATA_DIR}" "${UPLOAD_DIR}"
  systemctl enable "${SERVICE_NAME}"
  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    systemctl restart "${SERVICE_NAME}"
  else
    systemctl start "${SERVICE_NAME}"
  fi
}

print_port_hint() {
  local port="8080"
  if [ -f "${ENV_FILE}" ]; then
    port=$(grep -E '^PORT=' "${ENV_FILE}" | tail -n1 | cut -d'=' -f2- || echo "8080")
  fi
  echo "[info] Payambar is starting. Expected listening port: ${port}"
  echo "[info] Open: http://<server-ip>:${port}"
}

main() {
  parse_args "$@"
  ensure_root "$@"
  require_cmd curl
  require_cmd systemctl
  require_cmd tar
  if [ "${ACTION}" = "install" ]; then
    require_cmd openssl
  fi
  detect_platform
  ensure_update_target_exists

  echo "[info] Action: ${ACTION}"
  echo "[info] Detected platform: ${TARGET_OS}/${TARGET_ARCH}"

  local asset_url
  asset_url=$(fetch_latest_asset_url)
  local bin_path
  bin_path=$(download_and_extract "${asset_url}")

  if [ "${ACTION}" = "update" ]; then
    echo "[info] Updating binary only — preserving existing config and service."
    install_binary "${bin_path}"
    systemctl daemon-reload
    start_service
    print_port_hint
  else
    setup_user_and_dirs
    install_binary "${bin_path}"
    write_env_file
    write_systemd_unit
    start_service
    print_port_hint
  fi
}

main "$@"
