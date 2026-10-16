#!/usr/bin/env python
"""Servidor local. Envuelve index.html en el esqueleto que añade la publicación (doctype, head
con viewport y reset), para probar igual que en producción.

Uso:
  python herramientas/serve.py [puerto] [carpeta] [--latin1]

  carpeta   web (por defecto) o dist
  --latin1  simula un visor que decodifica scripts y página como Windows-1252 (sin charset UTF-8).
            Sirve para comprobar que no salen acentos rotos ("PolicÃ­a").
"""
import http.server
import os
import socketserver
import sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
LATIN1 = "--latin1" in sys.argv
PORT = int(args[0]) if args else 8765
CARPETA = args[1] if len(args) > 1 else "web"
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", CARPETA)

CHARSET_META = "" if LATIN1 else '<meta charset="utf-8">'
HEAD = (
    '<!doctype html><html lang="es"><head>' + CHARSET_META +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>"
    "</head><body>"
)


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=RAIZ, **k)

    def do_GET(self):
        if self.path in ("/", "/index.html") or self.path.startswith("/?"):
            with open(os.path.join(RAIZ, "index.html"), "rb") as f:
                crudo = f.read()
            cuerpo = HEAD.encode("ascii") + crudo + b"</body></html>"
            # Si hay modo latin1, el charset de la respuesta es Windows-1252, como en el fallo.
            tipo = "text/html; charset=windows-1252" if LATIN1 else "text/html; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(cuerpo)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(cuerpo)
        else:
            super().do_GET()

    def guess_type(self, path):
        # Los .js y .css sin charset, como los sirve un host que no lo declara.
        if path.endswith(".js"):
            return "text/javascript"
        if path.endswith(".css"):
            return "text/css"
        return super().guess_type(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), H) as srv:
        print("Sirviendo %s en http://127.0.0.1:%d%s" % (CARPETA, PORT, " (modo latin1)" if LATIN1 else ""))
        srv.serve_forever()
