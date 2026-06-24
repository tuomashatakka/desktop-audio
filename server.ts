import { createReadStream, readFileSync } from 'fs'
import http from 'http'

http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/javascript' })
    res.end(JSON.stringify({
      data: req.
    }));
    readFileSync('./index.html', 'utf8')
    createReadStream('./index.html', 'utf8').pipe(res)
  })
  .listen(6969)
