from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import ssl
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path('/home/karam/.copilot/session-state/a5f740da-6147-447c-8692-1c729eff53c8/files')
SERVER_CERT = ROOT / 'android-sdk/proxy/server.crt'
SERVER_KEY = ROOT / 'android-sdk/proxy/server.key'
UPSTREAM = 'https://redirector.gvt1.com/edgedl'
RANGE_SIZE = 8 * 1024 * 1024


class MirrorHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def do_CONNECT(self):
        if self.path != 'dl.google.com:443':
            self.send_error(403)
            return

        self.send_response(200, 'Connection Established')
        self.end_headers()
        self.wfile.flush()
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(SERVER_CERT, SERVER_KEY)
        with context.wrap_socket(self.connection, server_side=True) as secure:
            self.connection = secure
            self.rfile = secure.makefile('rb')
            self.wfile = secure.makefile('wb')
            self.handle_tunneled_request()

    def handle_tunneled_request(self):
        request_line = self.rfile.readline().decode('iso-8859-1').strip()
        if not request_line:
            return
        method, path, _ = request_line.split(' ', 2)
        headers = {}
        while True:
            line = self.rfile.readline().decode('iso-8859-1')
            if line in ('\r\n', '\n', ''):
                break
            name, value = line.split(':', 1)
            headers[name.lower()] = value.strip()

        if method not in ('GET', 'HEAD'):
            self.wfile.write(b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            self.wfile.flush()
            return

        if path.startswith('/android/repository/'):
            upstream = UPSTREAM + path
        elif path.startswith('/dl/android/maven2/'):
            upstream = UPSTREAM + '/android/maven2/' + path.removeprefix('/dl/android/maven2/')
        else:
            self.wfile.write(b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            self.wfile.flush()
            return
        forwarded_headers = {'User-Agent': headers.get('user-agent', 'Android SDK Manager')}
        client_range = re.fullmatch(r'bytes=(\d+)-(\d*)', headers.get('range', ''))
        if 'range' in headers and not client_range:
            self.wfile.write(b'HTTP/1.1 416 Range Not Satisfiable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            self.wfile.flush()
            return

        start = int(client_range.group(1)) if client_range else 0
        requested_end = int(client_range.group(2)) if client_range and client_range.group(2) else None
        first_end = min(start + RANGE_SIZE - 1, requested_end) if requested_end is not None else start + RANGE_SIZE - 1
        forwarded_headers['Range'] = f'bytes={start}-{first_end}'
        try:
            response = urlopen(Request(upstream, headers=forwarded_headers, method=method), timeout=180)
        except HTTPError as error:
            response = error
        except Exception as error:
            message = str(error).encode('utf-8', 'replace')
            self.wfile.write(b'HTTP/1.1 502 Bad Gateway\r\nContent-Length: ' + str(len(message)).encode() + b'\r\nConnection: close\r\n\r\n' + message)
            self.wfile.flush()
            return

        with response:
            content_range = response.headers.get('Content-Range', '')
            match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', content_range)
            if response.status != 206 or not match or int(match.group(1)) != start:
                body = response.read()
                self.wfile.write(f'HTTP/1.1 {response.status} {response.reason}\r\n'.encode('iso-8859-1'))
                self.wfile.write(f'Content-Length: {len(body)}\r\n'.encode('iso-8859-1'))
                self.wfile.write(f'Content-Type: {response.headers.get("Content-Type", "application/octet-stream")}\r\n'.encode('iso-8859-1'))
                self.wfile.write(b'Connection: close\r\n\r\n')
                if method == 'GET':
                    self.wfile.write(body)
                self.wfile.flush()
                return

            total = int(match.group(3))
            end = min(requested_end, total - 1) if requested_end is not None else total - 1
            status = 206 if client_range else 200
            length = end - start + 1
            content_type = response.headers.get('Content-Type', 'application/octet-stream')
            reason = 'Partial Content' if status == 206 else 'OK'
            self.wfile.write(f'HTTP/1.1 {status} {reason}\r\n'.encode('iso-8859-1'))
            self.wfile.write(f'Content-Type: {content_type}\r\n'.encode('iso-8859-1'))
            self.wfile.write(f'Content-Length: {length}\r\n'.encode('iso-8859-1'))
            if status == 206:
                self.wfile.write(f'Content-Range: bytes {start}-{end}/{total}\r\n'.encode('iso-8859-1'))
            self.wfile.write(b'Connection: close\r\n\r\n')
            self.wfile.flush()
            if method == 'GET':
                current = start
                current_response = response
                while current <= end:
                    chunk_end = min(current + RANGE_SIZE - 1, end)
                    if current != start:
                        chunk_request = Request(upstream, headers={
                            'User-Agent': forwarded_headers['User-Agent'],
                            'Range': f'bytes={current}-{chunk_end}',
                        })
                        current_response = urlopen(chunk_request, timeout=180)
                        if current_response.status != 206:
                            current_response.close()
                            raise OSError(f'Android mirror did not honor byte range at {current}')
                    remaining = chunk_end - current + 1
                    while remaining:
                        chunk = current_response.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise OSError(f'Android mirror ended a range early at {current}')
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
                        current += len(chunk)
                    current_response.close()
                    self.wfile.flush()

    def log_message(self, format_string, *args):
        print(format_string % args, flush=True)


class MirrorServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    server = MirrorServer(('127.0.0.1', 8765), MirrorHandler)
    print('Local Android SDK mirror proxy listening on 127.0.0.1:8765', flush=True)
    server.serve_forever()
