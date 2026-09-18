#!/usr/bin/env bash
#
# setup-oracle-vm.sh -- one-command setup for the Veer tutor's self-hosted
# tiny model on an Oracle Cloud Always Free VM (Ampere A1, ARM64).
#
# What it does:
#   1. Installs llama.cpp (prebuilt ARM64 release; --build-from-source to
#      compile instead)
#   2. Downloads Llama 3.2 3B Instruct (Q4_K_M, ~2 GB, resumable)
#   3. Runs it as a systemd service on 127.0.0.1:8080, API-key protected
#   4. Installs cloudflared and exposes the model through a Cloudflare
#      Tunnel -- no open inbound ports, automatic TLS
#   5. Self-tests: 401 without the key, 200 with it
#
# Usage:
#   sudo bash setup-oracle-vm.sh [--build-from-source]
#   # If it stops and asks for tunnel login (one interactive step):
#   cloudflared tunnel login
#   cloudflared tunnel create veer-llm
#   sudo bash setup-oracle-vm.sh        # re-run: finishes the wiring
#
set -euo pipefail

MODEL_REPO="bartowski/Llama-3.2-3B-Instruct-GGUF"
MODEL_FILE="Llama-3.2-3B-Instruct-Q4_K_M.gguf"
MODEL_ALIAS="veer-tutor"
INSTALL_DIR="/opt/veer-tutor"
CONF_DIR="/etc/veer-tutor"
SERVICE_USER="llm"
LLAMA_PORT="8080"
THREADS="4"
CTX="4096"

BUILD_FROM_SOURCE=0
[ "${1:-}" = "--build-from-source" ] && BUILD_FROM_SOURCE=1

log() { echo "[veer-tutor] $*"; }
die() { echo "[veer-tutor] ERROR: $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "run as root: sudo bash $0"
[ "$(uname -m)" = "aarch64" ] || die "this script targets ARM64 (Oracle A1); found $(uname -m)"

# ---- OS -------------------------------------------------------------------
. /etc/os-release 2>/dev/null || die "cannot detect OS"
case "${ID:-}" in
  ubuntu) PKG="apt-get" ;;
  ol)     PKG="dnf" ;;
  *) die "unsupported distro '${ID:-unknown}' (need Ubuntu or Oracle Linux)" ;;
esac
$PKG update -y
$PKG install -y curl tar openssl ca-certificates

# ---- user & dirs ------------------------------------------------------------
id "$SERVICE_USER" >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$INSTALL_DIR/bin" "$INSTALL_DIR/models" "$CONF_DIR"
chmod 700 "$CONF_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# ---- llama.cpp --------------------------------------------------------------
build_from_source() {
  log "building llama.cpp from source (takes ~20-30 min on this VM)..."
  $PKG install -y git cmake build-essential
  rm -rf /tmp/llama.cpp
  git clone --depth 1 https://github.com/ggerganov/llama.cpp /tmp/llama.cpp
  cmake -S /tmp/llama.cpp -B /tmp/llama.cpp/build -DCMAKE_BUILD_TYPE=Release
  cmake --build /tmp/llama.cpp/build --config Release -j"$THREADS" --target llama-server
  cp /tmp/llama.cpp/build/bin/llama-server "$INSTALL_DIR/bin/"
  chmod +x "$INSTALL_DIR/bin/llama-server"
  rm -rf /tmp/llama.cpp
}

install_llamacpp() {
  [ -x "$INSTALL_DIR/bin/llama-server" ] && { log "llama-server already installed"; return; }
  [ "$BUILD_FROM_SOURCE" = "1" ] && { build_from_source; return; }
  log "fetching latest llama.cpp ARM64 release..."
  TAG="$(curl -fsSL https://api.github.com/repos/ggerganov/llama.cpp/releases/latest \
    | grep -m1 '"tag_name"' | cut -d'"' -f4)"
  [ -n "$TAG" ] || die "could not determine latest llama.cpp release"
  ASSET="llama-${TAG}-bin-ubuntu-arm64.zip"
  URL="https://github.com/ggerganov/llama.cpp/releases/download/${TAG}/${ASSET}"
  log "downloading $ASSET ..."
  $PKG install -y unzip
  if curl -fsSL --retry 3 --retry-all-errors -o /tmp/llama.zip "$URL"; then
    unzip -o -j /tmp/llama.zip "*/llama-server" -d "$INSTALL_DIR/bin/"
    chmod +x "$INSTALL_DIR/bin/llama-server"
    rm -f /tmp/llama.zip
    log "llama.cpp $TAG installed"
  else
    die "prebuilt download failed; re-run with: sudo bash $0 --build-from-source"
  fi
}
install_llamacpp

# ---- model ------------------------------------------------------------------
MODEL_PATH="$INSTALL_DIR/models/$MODEL_FILE"
if [ ! -s "$MODEL_PATH" ] || [ "$(stat -c%s "$MODEL_PATH")" -lt 1000000000 ]; then
  log "downloading $MODEL_FILE (~2 GB, resumable)..."
  curl -fSL --retry 3 --retry-all-errors -C - -o "$MODEL_PATH" \
    "https://huggingface.co/${MODEL_REPO}/resolve/main/${MODEL_FILE}"
else
  log "model already present"
fi
chown "$SERVICE_USER:$SERVICE_USER" "$MODEL_PATH"

# ---- api key ----------------------------------------------------------------
ENV_FILE="$CONF_DIR/model.env"
if [ ! -s "$ENV_FILE" ]; then
  printf 'MODEL_API_KEY=%s\n' "$(openssl rand -hex 32)" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log "generated a new model API key"
fi
KEY="$(sed -n 's/^MODEL_API_KEY=//p' "$ENV_FILE")"
[ -n "$KEY" ] || die "could not read API key from $ENV_FILE"

# ---- systemd: model server ---------------------------------------------------
cat > /etc/systemd/system/veer-llm.service <<EOF
[Unit]
Description=Veer tutor model server (llama.cpp, self-hosted)
After=network-online.target
Wants=network-online.target

[Service]
User=$SERVICE_USER
EnvironmentFile=$ENV_FILE
ExecStart=/bin/sh -c 'exec $INSTALL_DIR/bin/llama-server -m $MODEL_PATH --alias $MODEL_ALIAS --host 127.0.0.1 --port $LLAMA_PORT -c $CTX -t $THREADS --api-key "\$MODEL_API_KEY"'
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now veer-llm.service

# ---- self-test ---------------------------------------------------------------
log "waiting for the model to load (first start takes a minute or two)..."
READY=0
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$LLAMA_PORT/health" \
      -H "Authorization: Bearer $KEY" 2>/dev/null; then
    READY=1
    break
  fi
  sleep 5
done
[ "$READY" = "1" ] || die "model server did not become ready (check: journalctl -u veer-llm)"

CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$LLAMA_PORT/health" || true)"
[ "$CODE" = "401" ] || die "expected 401 without API key, got $CODE -- is --api-key supported by this llama.cpp build?"
log "self-test passed: 401 without key, 200 with key"

# ---- cloudflared ---------------------------------------------------------------
if ! command -v cloudflared >/dev/null 2>&1; then
  log "installing cloudflared..."
  case "$PKG" in
    apt-get)
      curl -fsSL -o /tmp/cloudflared.deb \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
      dpkg -i /tmp/cloudflared.deb || apt-get install -f -y
      ;;
    dnf)
      curl -fsSL -o /tmp/cloudflared.rpm \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.rpm
      dnf install -y /tmp/cloudflared.rpm
      ;;
  esac
fi

TUN_JSON="$(ls /root/.cloudflared/*.json /home/*/.cloudflared/*.json 2>/dev/null | head -1 || true)"
if [ -z "$TUN_JSON" ]; then
  cat <<EOF

[veer-tutor] Model server is running locally. One interactive step remains
[veer-tutor] (Cloudflare needs you to approve the tunnel in a browser, once):
[veer-tutor]
[veer-tutor]     cloudflared tunnel login
[veer-tutor]     cloudflared tunnel create veer-llm
[veer-tutor]
[veer-tutor] Then re-run this script to finish the wiring:
[veer-tutor]
[veer-tutor]     sudo bash $0
EOF
  exit 0
fi

TUN_ID="$(basename "$TUN_JSON" .json)"
cp "$TUN_JSON" "$CONF_DIR/tunnel.json"
chmod 600 "$CONF_DIR/tunnel.json"
cat > "$CONF_DIR/cloudflared.yml" <<EOF
tunnel: $TUN_ID
credentials-file: $CONF_DIR/tunnel.json
ingress:
  - service: http://127.0.0.1:$LLAMA_PORT
EOF
cat > /etc/systemd/system/veer-tunnel.service <<EOF
[Unit]
Description=Cloudflare Tunnel for the Veer tutor model
After=network-online.target veer-llm.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/cloudflared tunnel --config $CONF_DIR/cloudflared.yml run
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now veer-tunnel.service
sleep 8
if systemctl is-active --quiet veer-tunnel.service; then
  log "tunnel is running"
else
  die "tunnel failed to start (check: journalctl -u veer-tunnel)"
fi

PUBLIC_URL="https://${TUN_ID}.cfargotunnel.com"
cat <<EOF

================================================================
 Veer tutor model server is LIVE through the tunnel.

 Public model URL : ${PUBLIC_URL}
 Model API key    : ${KEY}
                    (also stored root-only in ${ENV_FILE})

 Next steps (your assistant can do these with the two values):
   1. wrangler secret put MODEL_API_KEY      # paste the key above
   2. In worker/wrangler.toml [vars]:
        MODEL_BASE_URL = "${PUBLIC_URL}/v1"
   3. wrangler deploy, then set VITE_QA_API_BASE to the Worker
      URL, redeploy the site, and smoke-test Veer.

 Security: the model answers only with the API key, and the only
 way in is the tunnel -- no open ports on this VM.
================================================================
EOF
