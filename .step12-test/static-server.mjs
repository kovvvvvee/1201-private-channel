// 零依赖静态服务器：体验版预览/隧道（不校验 Host，支持 gzip）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve('dist-mock');
const port = 4174;
const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
};
const gzippable = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

http.createServer((req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) file = path.join(root, 'index.html'); // SPA fallback
    const ext = path.extname(file).toLowerCase();
    const type = mime[ext] || 'application/octet-stream';
    const buf = fs.readFileSync(file);
    const acceptGzip = (req.headers['accept-encoding'] || '').includes('gzip');
    const gzipOk = acceptGzip && gzippable.has(ext) && !req.headers.range;

    // Range 支持（视频流式播放必需，iOS Safari 强制要求）
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : buf.length - 1;
        if (m[1] === '' && m[2]) { // suffix range: bytes=-N
          start = Math.max(0, buf.length - parseInt(m[2], 10));
          end = buf.length - 1;
        }
        end = Math.min(end, buf.length - 1);
        if (start <= end && start < buf.length) {
          res.writeHead(206, {
            'Content-Type': type,
            'Content-Length': end - start + 1,
            'Content-Range': `bytes ${start}-${end}/${buf.length}`,
            'Accept-Ranges': 'bytes',
          });
          return res.end(buf.subarray(start, end + 1));
        }
      }
      res.writeHead(416, { 'Content-Range': `bytes */${buf.length}` });
      return res.end();
    }

    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes' };
    if (gzipOk) {
      const zipped = zlib.gzipSync(buf);
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': zipped.length });
      res.end(zipped);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': buf.length });
      res.end(buf);
    }
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, () => console.log(`static server :${port} -> ${root}`));
