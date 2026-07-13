#!/usr/bin/env python3
"""
Dynamic same-origin relay for LLM API Test.
Browser -> /api/v1/* (same origin) -> this service -> X-LLM-Base-Url + path

Supports arbitrary public HTTPS API gateways (OpenAI-compatible relays).
SSRF: blocks private/loopback/link-local/reserved IPs after DNS resolve.
"""

import ipaddress
import json
import os
import socket
import ssl
import sys
from socketserver import ThreadingMixIn
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

PORT = int(os.environ.get("LLM_PROXY_PORT", "8787"))
MAX_BODY = int(os.environ.get("LLM_PROXY_MAX_BODY", str(32 * 1024 * 1024)))
ALLOW_HTTP = os.environ.get("LLM_PROXY_ALLOW_HTTP", "").lower() in ("1", "true", "yes")


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def is_safe_upstream(base_url):
    try:
        parsed = urlparse(base_url)
    except Exception:
        return False, "invalid URL"

    if parsed.scheme not in ("https", "http"):
        return False, "only http(s) allowed"
    if parsed.scheme == "http" and not ALLOW_HTTP:
        return False, "http not allowed (use https)"
    if parsed.username or parsed.password:
        return False, "credentials in URL not allowed"

    host = (parsed.hostname or "").lower()
    if not host:
        return False, "missing host"
    if host in ("localhost", "metadata.google.internal"):
        return False, "host blocked"

    try:
        if ipaddress.ip_address(host).is_private:
            return False, "private IP blocked"
    except ValueError:
        pass

    try:
        for family, _, _, _, sockaddr in socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM):
            ip = ipaddress.ip_address(sockaddr[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False, "resolved to non-public IP"
    except socket.gaierror as err:
        return False, "DNS failed: %s" % err

    return True, ""


def hop_headers(headers):
    out = {}
    skip = {
        "host",
        "connection",
        "content-length",
        "x-llm-base-url",
        "x-forwarded-for",
        "x-real-ip",
        # 浏览器同源请求会带 Origin/Referer，部分 API 网关会因此 403
        "origin",
        "referer",
    }
    for key, value in headers.items():
        if key.lower() in skip:
            continue
        out[key] = value
    return out


class ProxyHandler(BaseHTTPRequestHandler):
    server_version = "LLMApiTestProxy/2.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self):
        self.proxy_request()

    def do_POST(self):
        self.proxy_request()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json_error(self, status, message):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        body = json.dumps({"error": message}).encode("utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def proxy_request(self):
        base = self.headers.get("X-LLM-Base-Url", "").strip().rstrip("/")
        if not base:
            self.send_json_error(400, "Missing X-LLM-Base-Url header")
            return

        ok, reason = is_safe_upstream(base)
        if not ok:
            self.send_json_error(403, reason)
            return

        target = "%s%s" % (base, self.path)
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length > MAX_BODY:
            self.send_error(413, "Request body too large")
            return
        body = self.rfile.read(length) if length else None

        parsed = urlparse(base)
        fwd_headers = hop_headers(self.headers)
        fwd_headers["Host"] = parsed.netloc.split("@")[-1]

        req = Request(target, data=body, method=self.command, headers=fwd_headers)
        ctx = ssl.create_default_context()

        try:
            upstream = urlopen(req, timeout=600, context=ctx)
        except HTTPError as err:
            upstream = err
        except URLError as err:
            self.send_json_error(502, "Upstream error: %s" % err.reason)
            return

        self.send_response(upstream.status)
        skip = {"transfer-encoding", "connection", "content-encoding", "content-length"}
        for key, value in upstream.headers.items():
            if key.lower() not in skip:
                self.send_header(key, value)
        self.end_headers()

        try:
            while True:
                chunk = upstream.read(8192)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        finally:
            upstream.close()


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), ProxyHandler)
    print("LLM API dynamic proxy on 127.0.0.1:%d" % PORT, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
