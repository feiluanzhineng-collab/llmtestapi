"""Deploy dynamic CORS proxy + nginx + static dist to llmtest server.

Requires env:
  LLMTEST_DEPLOY_HOST     SSH host (default: 112.124.23.48)
  LLMTEST_DEPLOY_PASSWORD SSH password (required)
"""
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
HOST = os.environ.get("LLMTEST_DEPLOY_HOST", "112.124.23.48")
PASSWORD = os.environ.get("LLMTEST_DEPLOY_PASSWORD", "")
LOCAL_DIST = ROOT / "dist"
REMOTE_ROOT = "/data/llmtestapi"
PROXY_DIR = "/opt/llmtestapi"
NGINX_CONF = "/etc/nginx/conf.d/llmtest.feiluanai.com.conf"
API_LOCATION = """
    location /api/ {
        proxy_pass http://127.0.0.1:8787/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        client_max_body_size 32m;
    }
"""


def run(client, cmd, timeout=120):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    code = stdout.channel.recv_exit_status()
    return code, stdout.read().decode(), stderr.read().decode()


def upload_dir(sftp, local: Path, remote: str):
    for child in local.iterdir():
        rp = f"{remote}/{child.name}"
        if child.is_dir():
            try:
                sftp.mkdir(rp)
            except OSError:
                pass
            upload_dir(sftp, child, rp)
        else:
            sftp.put(str(child), rp)


def main():
    if not PASSWORD:
        print("Set LLMTEST_DEPLOY_PASSWORD before running.", file=sys.stderr)
        sys.exit(1)
    if not LOCAL_DIST.is_dir():
        print(f"Missing build output: {LOCAL_DIST} — run npm run build first.", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=PASSWORD, timeout=20, allow_agent=False, look_for_keys=False)

    run(client, f"mkdir -p {PROXY_DIR}")
    sftp = client.open_sftp()
    sftp.put(str(ROOT / "server" / "cors-proxy.py"), f"{PROXY_DIR}/cors-proxy.py")
    sftp.put(str(ROOT / "server" / "llmtest-cors-proxy.service"), "/etc/systemd/system/llmtest-cors-proxy.service")
    upload_dir(sftp, LOCAL_DIST, REMOTE_ROOT)
    sftp.close()

    code, conf, _ = run(client, f"cat {NGINX_CONF}")
    if "location /api/" not in conf:
        marker = "    location / {"
        if marker in conf:
            conf = conf.replace(marker, API_LOCATION + "\n" + marker, 1)
            run(client, f"cat > {NGINX_CONF} << 'NGINXEOF'\n{conf}\nNGINXEOF")
            print("Patched nginx conf with /api/ location")
        else:
            print("WARN: could not auto-patch nginx, add location /api/ manually")
    else:
        print("nginx /api/ location already present")

    cmds = [
        "chmod +x /opt/llmtestapi/cors-proxy.py",
        "systemctl daemon-reload",
        "systemctl enable llmtest-cors-proxy",
        "systemctl restart llmtest-cors-proxy",
        "systemctl is-active llmtest-cors-proxy",
        "curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8787/chat/completions -H 'X-LLM-Base-Url: https://ai.feiluanai.com/v1' -H 'Content-Type: application/json' -d '{}'",
        "nginx -t 2>&1",
        "systemctl reload nginx",
    ]
    for cmd in cmds:
        print(">>>", cmd)
        code, out, err = run(client, cmd)
        print(out or err)
        if code != 0 and "nginx -t" in cmd:
            raise SystemExit("nginx test failed")

    client.close()
    print("Deploy complete")


if __name__ == "__main__":
    main()
