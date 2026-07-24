const fs = require('fs');
const c = fs.readFileSync('src/a2mcp-server.ts', 'utf8');
const lines = c.split('\n');
let inBodyHandler = false;
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.includes('parseBody') || l.includes('on(''data'') || l.includes('on("data"))) {
    console.log((i+1) + ': ' + l.trim());
  }
  // Find the server request handler
  if (l.includes('const server = http.createServer') || l.includes('server.on') || l.includes('const server')) {
    console.log('SERVER LINE ' + (i+1) + ': ' + l.trim().substring(0, 120));
  }
}
// Also find all route handlers setup
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Handle POST') || lines[i].includes('handleBundle') || lines[i].includes('req.on')) {
    if (lines[i].includes('data')) {
      console.log('DATA HANDLER LINE ' + (i+1) + ': ' + lines[i].trim().substring(0, 120));
    }
  }
}
// Check for raw body parsing before routing
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('server.on') || lines[i].includes('createServer')) {
    console.log('SERVER ' + (i+1) + ': ' + lines[i].trim().substring(0, 150));
  }
}
