# Levi operations — deploy checklist

Captured from the 2026-05-26/27 working session that took the OPEA instance through the kimi adapter port, real-world quota event, fallback validation, and two disk-runaway incidents.

This complements `docs/codebase-review-2026-05-27.md` (F6, F8).

## Host setup (one-time, per instance)

### 1. Workspace static preview (`agi.openscan.ai/preview/`)

Allow nginx (`www-data`) to traverse into `/root` so it can serve agent workspaces from `/root/.paperclip/instances/default/workspaces/`:

```bash
chmod o+x /root      # traverse-only, NOT read; safe pattern
```

Add to the agi.openscan.ai nginx server block (HTTPS):

```nginx
# Block dotfile access (.git, .env, etc.) under /preview/ and elsewhere.
location ~ /\.(?!well-known) {
    access_log off; log_not_found off; deny all; return 404;
}

# /preview/paperclip/ -> Paperclip itself
location = /preview/paperclip/ { return 302 /; }
location = /preview/paperclip  { return 302 /; }

# /preview/<agent-uuid>/... -> the agent's workspace
location /preview/ {
    alias /root/.paperclip/instances/default/workspaces/;
    autoindex on;
    autoindex_exact_size off;
    autoindex_localtime on;
    try_files $uri $uri/ $uri/index.html =404;
    add_header Access-Control-Allow-Origin "*";
}
```

Reload nginx via the master PID (the manually-started master cannot be reloaded via systemctl):

```bash
kill -HUP "$(pgrep -f 'nginx: master')"
```

The Preview button on each agent header (PR #44) links here.

### 2. Kimi CLI install + config (for the fallback path in PR #26)

Install Kimi CLI 1.44+ (requires Python ≥ 3.12):

```bash
python3 -m venv /root/.kimi-venv
/root/.kimi-venv/bin/pip install --upgrade pip kimi-cli
ln -sf /root/.kimi-venv/bin/kimi /usr/local/bin/kimi
```

Configure with an API key from `kimi.com/code/console`:

```bash
umask 077
mkdir -p ~/.kimi
cat > ~/.kimi/config.toml <<EOF
default_model = "kimi-for-coding"

[providers.kimi-for-coding]
type      = "kimi"
base_url  = "https://api.kimi.com/coding/v1"
api_key   = "sk-kimi-..."

[models.kimi-for-coding]
provider          = "kimi-for-coding"
model             = "kimi-for-coding"
max_context_size  = 262144
EOF
chmod 600 ~/.kimi/config.toml
```

Smoke test:

```bash
kimi --print --yolo --afk -p "Reply with exactly: SMOKE-OK"
```

### 3. Enable fallback per claude_local agent

For each `claude_local` agent that should fail over to Kimi on quota:

```jsonc
PATCH /api/agents/<id>
{
  "adapterConfig": {
    "...preserved fields...": "...",
    "fallback": {
      "enabled":  true,
      "provider": "moonshot_kimi",
      "command":  "kimi",
      "model":    "kimi-for-coding"
    }
  }
}
```

**Note**: PATCH to `adapterConfig` is **wholesale-replace** — first GET the agent, merge in the `fallback` block, then PATCH the full object back. See review finding F2.

### 4. Cap `/var/log/syslog` size (durable disk-runaway mitigation)

Default Ubuntu logrotate runs daily at 00:00. If something floods syslog (e.g. an upstream the host proxies is down), 350 GiB can accumulate in 7 hours and fill the root filesystem before logrotate fires.

Add an hourly cron that respects the existing `syslog-custom` rules:

```bash
# 1. Ensure /etc/logrotate.d/syslog-custom has the `su` directive so it can rotate
#    inside /var/log (which is g+w):
sed -i '/^\/var\/log\/syslog {/a\    su root syslog' /etc/logrotate.d/syslog-custom

# 2. Drop an hourly cron:
cat > /etc/cron.hourly/syslog-size-rotate <<'EOF'
#!/bin/sh
exec /usr/sbin/logrotate /etc/logrotate.d/syslog-custom
EOF
chmod +x /etc/cron.hourly/syslog-size-rotate
```

The existing `size 100M` rule in `syslog-custom` now triggers on the hourly cron, capping the file at ~200 MB worst-case.

## Recovery from disk-full (if it still happens)

```bash
truncate -s 0 /var/log/syslog
journalctl --vacuum-size=200M
df -h /                            # confirm space recovered
pg_ctlcluster 16 main start        # restart postgres
# paperclip auto-reconnects; no node restart needed
```

## Deploy procedure (in-place rebuild)

```bash
cd /root/workspace/paperclip
git pull
pnpm install
pnpm run build                                            # now also copies ui/dist -> server/ui-dist (PR closes OPEA-18)
# Restart the tmux session running paperclip:
kill -TERM "$(pgrep -f 'node dist/index.js')"             # graceful
# In the tmux pane, re-run:
# env -u ANTHROPIC_API_KEY NODE_ENV=production PORT=3100 \
#   DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip \
#   SERVE_UI=true PAPERCLIP_CONFIG=/root/.paperclip/instances/default/config.json \
#   node dist/index.js 2>&1 | tee -a /tmp/paperclip-server.log
```
