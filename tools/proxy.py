"""极简 HTTP CONNECT 代理：给 git 用（git 的 OpenSSL 通道连不上 github.com，Python 通道可以）。"""
import select, socket, socketserver, sys, threading

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 18888
BUF = 65536


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        client = self.request
        client.settimeout(60)
        try:
            data = self._read_headers(client)
        except Exception:
            return
        if not data:
            return
        line = data.split(b"\r\n", 1)[0].decode("latin-1")
        parts = line.split()
        if len(parts) < 2 or parts[0].upper() != "CONNECT":
            client.sendall(b"HTTP/1.1 405 Method Not Allowed\r\n\r\n")
            return
        hostport = parts[1]
        if ":" in hostport:
            host, port = hostport.rsplit(":", 1)
            port = int(port)
        else:
            host, port = hostport, 443
        try:
            upstream = socket.create_connection((host, port), timeout=45)
        except Exception as e:
            client.sendall(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
            print("connect fail", host, port, e, flush=True)
            return
        client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        upstream.settimeout(None)
        self._pump(client, upstream)

    @staticmethod
    def _read_headers(sock):
        buf = b""
        while b"\r\n\r\n" not in buf and len(buf) < 65536:
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
        return buf

    @staticmethod
    def _pump(a, b):
        socks = [a, b]
        try:
            while True:
                r, _, _ = select.select(socks, [], [], 300)
                if not r:
                    break
                for s in r:
                    other = b if s is a else a
                    try:
                        chunk = s.recv(BUF)
                    except Exception:
                        return
                    if not chunk:
                        return
                    try:
                        other.sendall(chunk)
                    except Exception:
                        return
        finally:
            for s in socks:
                try:
                    s.close()
                except Exception:
                    pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as srv:
        print(f"proxy listening on 127.0.0.1:{PORT}", flush=True)
        srv.serve_forever()
