#!/usr/bin/env python3
import os, sys
os.chdir('/Users/vietjyactruong-ho/Documents/Claude/Projects/APBAI/apbai-dashboard')
import http.server, socketserver
PORT = 8787
Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map.update({'.js': 'application/javascript', '.css': 'text/css'})
with socketserver.TCPServer(('', PORT), Handler) as httpd:
    print(f'Serving on http://localhost:{PORT}', flush=True)
    httpd.serve_forever()
