"""极简静态服务器（本地预览用）。"""
import functools, http.server, os, socketserver, sys

WS = r"C:\Users\ZhuanZ\Documents\deepseek-harness\default-workspace"
ROOT = os.path.join(WS, "site")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"serving {ROOT} at http://127.0.0.1:{PORT}/", flush=True)
        httpd.serve_forever()
