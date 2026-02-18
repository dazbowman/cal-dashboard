const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const OPENCLAW_WS = 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = '77bb86772af9c258c09481f425c8897f29387bb92773ec2b';
const OPENCLAW_BASE = '/home/dbowman/.openclaw';
const WORKSPACE = path.join(OPENCLAW_BASE, 'workspace');
const GEMINI_KEY_PATH = path.join(OPENCLAW_BASE, 'credentials', 'gemini.key');

// Load Gemini key for voice transcription
let GEMINI_KEY = '';
try {
  GEMINI_KEY = fs.readFileSync(GEMINI_KEY_PATH, 'utf8').trim();
} catch (e) {
  console.log('No Gemini key found, voice transcription disabled');
}

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// API: Transcribe voice using Gemini
app.post('/api/transcribe', async (req, res) => {
  if (!GEMINI_KEY) {
    return res.status(503).json({ error: 'Transcription not configured' });
  }
  
  const { audio, mimeType } = req.body;
  if (!audio) {
    return res.status(400).json({ error: 'Audio data required' });
  }
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Transcribe this audio exactly. Return only the transcription, nothing else.' },
              { inline_data: { mime_type: mimeType || 'audio/webm', data: audio } }
            ]
          }]
        })
      }
    );
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }
    
    const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ transcript: transcript.trim() });
  } catch (err) {
    console.error('Transcription error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Get file content
app.get('/api/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Path required' });
  
  const fullPath = filePath.startsWith('/') ? filePath : path.join(WORKSPACE, filePath);
  
  if (!fullPath.startsWith(WORKSPACE) && !fullPath.startsWith(OPENCLAW_BASE)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    res.json({ content, path: fullPath });
  } catch (err) {
    res.status(404).json({ error: 'File not found', details: err.message });
  }
});

// API: Save file content
app.post('/api/file', (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'Path and content required' });
  }
  
  const fullPath = filePath.startsWith('/') ? filePath : path.join(WORKSPACE, filePath);
  
  if (!fullPath.startsWith(WORKSPACE) && !fullPath.startsWith(OPENCLAW_BASE)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  try {
    fs.writeFileSync(fullPath, content, 'utf8');
    res.json({ success: true, path: fullPath });
  } catch (err) {
    res.status(500).json({ error: 'Write failed', details: err.message });
  }
});

// API: List directory
app.get('/api/dir', (req, res) => {
  const dirPath = req.query.path || WORKSPACE;
  const fullPath = dirPath.startsWith('/') ? dirPath : path.join(WORKSPACE, dirPath);
  
  if (!fullPath.startsWith(WORKSPACE) && !fullPath.startsWith(OPENCLAW_BASE)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  try {
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    const result = items.map(item => ({
      name: item.name,
      type: item.isDirectory() ? 'dir' : 'file',
      path: path.join(fullPath, item.name)
    }));
    res.json({ items: result, path: fullPath });
  } catch (err) {
    res.status(404).json({ error: 'Directory not found', details: err.message });
  }
});

// API: List memory files
app.get('/api/memory', (req, res) => {
  const memoryDir = path.join(WORKSPACE, 'memory');
  try {
    if (!fs.existsSync(memoryDir)) {
      return res.json({ files: [] });
    }
    const files = fs.readdirSync(memoryDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List skills
app.get('/api/skills', (req, res) => {
  const skillsDir = path.join(OPENCLAW_BASE, 'agents', 'skills');
  try {
    if (!fs.existsSync(skillsDir)) {
      return res.json({ skills: [] });
    }
    const skills = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    res.json({ skills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get cron jobs
app.get('/api/cron', (req, res) => {
  const cronDir = path.join(OPENCLAW_BASE, 'cron');
  try {
    if (!fs.existsSync(cronDir)) {
      return res.json({ jobs: [] });
    }
    const files = fs.readdirSync(cronDir).filter(f => f.endsWith('.json'));
    const jobs = files.map(f => {
      try {
        const content = fs.readFileSync(path.join(cronDir, f), 'utf8');
        return { file: f, ...JSON.parse(content) };
      } catch {
        return { file: f, error: 'Parse error' };
      }
    });
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get Pi system stats
app.get('/api/system', async (req, res) => {
  const { execSync } = require('child_process');
  
  try {
    // CPU usage (1 second sample)
    const cpuInfo = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'", { encoding: 'utf8' }).trim();
    
    // Memory info
    const memInfo = execSync("free -m | grep Mem", { encoding: 'utf8' }).trim().split(/\s+/);
    const memTotal = parseInt(memInfo[1]);
    const memUsed = parseInt(memInfo[2]);
    const memPercent = ((memUsed / memTotal) * 100).toFixed(1);
    
    // CPU temperature (Raspberry Pi specific)
    let cpuTemp = 'N/A';
    try {
      const tempRaw = execSync("cat /sys/class/thermal/thermal_zone0/temp", { encoding: 'utf8' }).trim();
      cpuTemp = (parseInt(tempRaw) / 1000).toFixed(1);
    } catch (e) {
      // Not a Pi or temp not available
    }
    
    // Disk usage
    const diskInfo = execSync("df -h / | tail -1", { encoding: 'utf8' }).trim().split(/\s+/);
    const diskTotal = diskInfo[1];
    const diskUsed = diskInfo[2];
    const diskPercent = diskInfo[4];
    
    // Uptime
    const uptimeRaw = execSync("uptime -p", { encoding: 'utf8' }).trim();
    
    // Load average
    const loadAvg = execSync("cat /proc/loadavg", { encoding: 'utf8' }).trim().split(' ').slice(0, 3);
    
    // Number of processes
    const processes = execSync("ps aux | wc -l", { encoding: 'utf8' }).trim();
    
    // Network (bytes received/sent on eth0 or wlan0)
    let networkStats = { rx: 'N/A', tx: 'N/A' };
    try {
      const rxBytes = execSync("cat /sys/class/net/wlan0/statistics/rx_bytes 2>/dev/null || cat /sys/class/net/eth0/statistics/rx_bytes", { encoding: 'utf8' }).trim();
      const txBytes = execSync("cat /sys/class/net/wlan0/statistics/tx_bytes 2>/dev/null || cat /sys/class/net/eth0/statistics/tx_bytes", { encoding: 'utf8' }).trim();
      networkStats.rx = (parseInt(rxBytes) / 1024 / 1024 / 1024).toFixed(2) + ' GB';
      networkStats.tx = (parseInt(txBytes) / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    } catch (e) {}
    
    res.json({
      cpu: {
        usage: parseFloat(cpuInfo) || 0,
        temp: cpuTemp,
        loadAvg: loadAvg
      },
      memory: {
        total: memTotal,
        used: memUsed,
        percent: parseFloat(memPercent)
      },
      disk: {
        total: diskTotal,
        used: diskUsed,
        percent: diskPercent
      },
      uptime: uptimeRaw,
      processes: parseInt(processes),
      network: networkStats,
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get gateway config 
app.get('/api/config', (req, res) => {
  try {
    const configPath = path.join(OPENCLAW_BASE, 'openclaw.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const safe = {
      channels: Object.keys(config.channels || {}),
      model: config.model,
      agent: config.agent
    };
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to generate unique IDs
function generateId() {
  return crypto.randomUUID();
}

// WebSocket proxy to OpenClaw gateway with proper protocol
wss.on('connection', (clientWs) => {
  console.log('Dashboard client connected');
  
  const gatewayWs = new WebSocket(OPENCLAW_WS);
  let authenticated = false;
  let pendingRequests = new Map();
  let sessionKey = 'agent:main:main';
  
  gatewayWs.on('open', () => {
    console.log('Connected to OpenClaw gateway, waiting for challenge...');
    // Don't send connect yet - wait for connect.challenge event
  });
  
  gatewayWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      // Handle connect.challenge event - must send connect request after this
      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        console.log('Received connect.challenge, sending connect request...');
        const connectId = generateId();
        pendingRequests.set(connectId, 'connect');
        
        gatewayWs.send(JSON.stringify({
          type: 'req',
          id: connectId,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'cli',
              version: '2026.2.3',
              platform: 'linux',
              mode: 'ui'
            },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            caps: [],
            commands: [],
            permissions: {},
            auth: { token: GATEWAY_TOKEN },
            locale: 'en-US'
          }
        }));
        return;
      }
      
      // Handle connect response
      if (msg.type === 'res' && pendingRequests.get(msg.id) === 'connect') {
        pendingRequests.delete(msg.id);
        if (msg.ok) {
          authenticated = true;
          console.log('Authenticated with gateway');
          clientWs.send(JSON.stringify({ type: 'auth', success: true }));
          
          // Fetch chat history
          const historyId = generateId();
          pendingRequests.set(historyId, 'history');
          gatewayWs.send(JSON.stringify({
            type: 'req',
            id: historyId,
            method: 'chat.history',
            params: { sessionKey, limit: 50 }
          }));
        } else {
          console.error('Auth failed:', msg.error);
          clientWs.send(JSON.stringify({ type: 'auth', success: false, error: msg.error }));
        }
        return;
      }
      
      // Handle history response
      if (msg.type === 'res' && pendingRequests.get(msg.id) === 'history') {
        pendingRequests.delete(msg.id);
        if (msg.ok && msg.payload?.messages) {
          clientWs.send(JSON.stringify({
            type: 'history',
            messages: msg.payload.messages
          }));
        }
        return;
      }
      
      // Handle chat.send response
      if (msg.type === 'res' && pendingRequests.has(msg.id)) {
        const reqType = pendingRequests.get(msg.id);
        pendingRequests.delete(msg.id);
        if (reqType === 'chat.send') {
          if (msg.ok) {
            console.log('Message sent, runId:', msg.payload?.runId);
          } else {
            clientWs.send(JSON.stringify({ type: 'error', message: msg.error?.message || 'Send failed' }));
          }
        }
        return;
      }
      
      // Handle streaming events
      if (msg.type === 'event') {
        const payload = msg.payload || {};
        
        // Agent event - this is the main response format
        if (msg.event === 'agent') {
          // Extract text from various possible locations
          let text = '';
          if (typeof payload.text === 'string') {
            text = payload.text;
          } else if (typeof payload.content === 'string') {
            text = payload.content;
          } else if (payload.message?.content) {
            text = payload.message.content;
          } else if (Array.isArray(payload.messages)) {
            // Get assistant messages
            const assistantMsgs = payload.messages.filter(m => m.role === 'assistant');
            if (assistantMsgs.length > 0) {
              const lastMsg = assistantMsgs[assistantMsgs.length - 1];
              text = lastMsg.content || lastMsg.text || '';
            }
          }
          
          if (text) {
            clientWs.send(JSON.stringify({
              type: 'response',
              content: text,
              state: payload.state
            }));
          }
          
          // Send state updates
          if (payload.state) {
            clientWs.send(JSON.stringify({
              type: 'status',
              state: payload.state
            }));
          }
          return;
        }
        
        if (msg.event === 'chat' || msg.event === 'chat.chunk') {
          const text = payload.text || payload.content || payload.delta?.content || '';
          if (text) {
            clientWs.send(JSON.stringify({
              type: 'chunk',
              content: text
            }));
          }
        } else if (msg.event === 'chat.done' || msg.event === 'agent.done') {
          clientWs.send(JSON.stringify({
            type: 'done',
            content: payload.text || payload.content || ''
          }));
        } else if (msg.event === 'status') {
          clientWs.send(JSON.stringify({
            type: 'status',
            state: payload.state
          }));
        }
        return;
      }
      
      // Forward other messages
      clientWs.send(data.toString());
      
    } catch (e) {
      console.log('Parse error:', e.message);
      clientWs.send(data.toString());
    }
  });
  
  gatewayWs.on('error', (err) => {
    console.error('Gateway connection error:', err.message);
    clientWs.send(JSON.stringify({ type: 'error', message: 'Gateway connection failed' }));
  });
  
  gatewayWs.on('close', () => {
    console.log('Gateway connection closed');
    clientWs.close();
  });
  
  clientWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'message' && gatewayWs.readyState === WebSocket.OPEN) {
        // Send chat message using proper protocol
        const sendId = generateId();
        pendingRequests.set(sendId, 'chat.send');
        
        gatewayWs.send(JSON.stringify({
          type: 'req',
          id: sendId,
          method: 'chat.send',
          params: {
            sessionKey,
            message: msg.content,
            idempotencyKey: generateId()
          }
        }));
      } else if (msg.type === 'voice') {
        // Voice message - transcribe first, then send as text
        if (!GEMINI_KEY) {
          clientWs.send(JSON.stringify({ type: 'error', message: 'Voice transcription not configured' }));
          return;
        }
        
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: 'Transcribe this audio exactly. Return only the transcription, nothing else.' },
                    { inline_data: { mime_type: msg.mimeType || 'audio/webm', data: msg.audio } }
                  ]
                }]
              })
            }
          );
          
          const result = await response.json();
          const transcript = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          
          if (transcript) {
            // Send transcribed text to gateway
            const sendId = generateId();
            pendingRequests.set(sendId, 'chat.send');
            
            gatewayWs.send(JSON.stringify({
              type: 'req',
              id: sendId,
              method: 'chat.send',
              params: {
                sessionKey,
                message: transcript,
                idempotencyKey: generateId()
              }
            }));
            
            // Tell client what was transcribed
            clientWs.send(JSON.stringify({
              type: 'transcription',
              text: transcript
            }));
          } else {
            clientWs.send(JSON.stringify({ type: 'error', message: 'Could not transcribe audio' }));
          }
        } catch (err) {
          console.error('Transcription error:', err);
          clientWs.send(JSON.stringify({ type: 'error', message: 'Transcription failed: ' + err.message }));
        }
      } else if (gatewayWs.readyState === WebSocket.OPEN) {
        gatewayWs.send(data.toString());
      }
    } catch (e) {
      console.log('Client message error:', e.message);
    }
  });
  
  clientWs.on('close', () => {
    console.log('Dashboard client disconnected');
    gatewayWs.close();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Cal's Dashboard running on http://0.0.0.0:${PORT}`);
  console.log(`Voice transcription: ${GEMINI_KEY ? 'enabled' : 'disabled'}`);
});
