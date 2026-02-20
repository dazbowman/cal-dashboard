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

// Temperature history storage (persists across page refreshes)
const tempHistory = [];
const MAX_TEMP_POINTS = 60; // 5 minutes at 5-second intervals

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

// Helper to parse SKILL.md frontmatter
function parseSkillMd(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      return { name: '', description: '', content };
    }
    
    const frontmatter = frontmatterMatch[1];
    let name = '';
    let description = '';
    let emoji = '';
    
    // Try to parse as YAML-ish
    const nameMatch = frontmatter.match(/^name:\s*(.+?)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+?)$/m);
    
    // Extract emoji from metadata field (could be JSON or YAML-like)
    const metaMatch = frontmatter.match(/metadata:\s*\{[^}]*"emoji":\s*"([^"]+)"/);
    
    if (nameMatch) name = nameMatch[1].trim();
    if (descMatch) description = descMatch[1].trim();
    if (metaMatch) emoji = metaMatch[1].trim();
    
    return { name, description, emoji, content };
  } catch (e) {
    return { name: '', description: '', content: '' };
  }
}

// Helper to get skill status from `openclaw skills list`
function getSkillStatuses() {
  try {
    const { execSync } = require('child_process');
    const output = execSync('openclaw skills list', { encoding: 'utf8' });
    
    const statuses = {};
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Parse table rows - look for ✓ ready or ✗ missing
      const readyMatch = line.match(/│\s*✓\s+ready\s+│\s+(?:[\w\s]*?\s+)?(\S+)\s+│/);
      const missingMatch = line.match(/│\s*✗\s+missing\s+│\s+(?:[\w\s]*?\s+)?(\S+)\s+│/);
      
      if (readyMatch) {
        statuses[readyMatch[1]] = true;
      } else if (missingMatch) {
        statuses[missingMatch[1]] = false;
      }
    }
    
    return statuses;
  } catch (e) {
    console.error('Failed to get skill statuses:', e.message);
    return {};
  }
}

// API: List skills - only user-installed skills from ~/.openclaw/skills
app.get('/api/skills', (req, res) => {
  try {
    const managedBaseDir = path.join(OPENCLAW_BASE, 'skills');
    
    const skills = [];
    const statuses = getSkillStatuses();
    
    // Scan managed (user-installed) skills - check nested directories
    if (fs.existsSync(managedBaseDir)) {
      const scanManagedDir = (dir) => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.isDirectory()) {
            const skillPath = path.join(dir, item.name);
            const skillMdPath = path.join(skillPath, 'SKILL.md');
            
            if (fs.existsSync(skillMdPath)) {
              const { name, description, emoji } = parseSkillMd(skillMdPath);
              skills.push({
                name: name || item.name,
                description: description || 'No description',
                emoji: emoji || '📦',
                source: 'managed',
                ready: statuses[item.name] === true,
                location: skillPath
              });
            } else {
              // Recursively scan subdirectories
              scanManagedDir(skillPath);
            }
          }
        }
      };
      scanManagedDir(managedBaseDir);
    }
    
    res.json({ skills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get skill details - only from user-installed skills
app.get('/api/skills/:skillName', (req, res) => {
  const { skillName } = req.params;
  
  try {
    const managedBaseDir = path.join(OPENCLAW_BASE, 'skills');
    
    // Search managed skills recursively
    const findSkill = (dir) => {
      if (!fs.existsSync(dir)) return null;
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          if (item.name === skillName) {
            const testPath = path.join(dir, item.name, 'SKILL.md');
            if (fs.existsSync(testPath)) {
              return testPath;
            }
          }
          const result = findSkill(path.join(dir, item.name));
          if (result) return result;
        }
      }
      return null;
    };
    
    const skillMdPath = findSkill(managedBaseDir);
    
    if (!skillMdPath || !fs.existsSync(skillMdPath)) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    const markdown = fs.readFileSync(skillMdPath, 'utf8');
    const { name } = parseSkillMd(skillMdPath);
    
    res.json({
      name: name || skillName,
      markdown,
      location: skillMdPath,
      source: 'managed'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update skill file - only for user-installed skills
app.put('/api/skills/:skillName', (req, res) => {
  const { skillName } = req.params;
  const { markdown } = req.body;
  
  if (!markdown) {
    return res.status(400).json({ error: 'Markdown content required' });
  }
  
  try {
    const managedBaseDir = path.join(OPENCLAW_BASE, 'skills');
    
    // Search managed skills recursively
    const findSkill = (dir) => {
      if (!fs.existsSync(dir)) return null;
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          if (item.name === skillName) {
            const testPath = path.join(dir, item.name, 'SKILL.md');
            if (fs.existsSync(testPath)) {
              return testPath;
            }
          }
          const result = findSkill(path.join(dir, item.name));
          if (result) return result;
        }
      }
      return null;
    };
    
    const skillMdPath = findSkill(managedBaseDir);
    
    if (!skillMdPath || !fs.existsSync(skillMdPath)) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    fs.writeFileSync(skillMdPath, markdown, 'utf8');
    
    res.json({ success: true, location: skillMdPath });
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
    
    // Read jobs.json which contains all jobs
    const jobsFile = path.join(cronDir, 'jobs.json');
    if (!fs.existsSync(jobsFile)) {
      return res.json({ jobs: [] });
    }
    
    const content = fs.readFileSync(jobsFile, 'utf8');
    const data = JSON.parse(content);
    
    res.json({ jobs: data.jobs || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get single cron job
app.get('/api/cron/:id', (req, res) => {
  const cronDir = path.join(OPENCLAW_BASE, 'cron');
  const jobsFile = path.join(cronDir, 'jobs.json');
  
  try {
    if (!fs.existsSync(jobsFile)) {
      return res.status(404).json({ error: 'Jobs file not found' });
    }
    
    const content = fs.readFileSync(jobsFile, 'utf8');
    const data = JSON.parse(content);
    const job = data.jobs.find(j => j.id === req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update cron job
app.put('/api/cron/:id', (req, res) => {
  const cronDir = path.join(OPENCLAW_BASE, 'cron');
  const jobsFile = path.join(cronDir, 'jobs.json');
  
  try {
    if (!fs.existsSync(jobsFile)) {
      return res.status(404).json({ error: 'Jobs file not found' });
    }
    
    const content = fs.readFileSync(jobsFile, 'utf8');
    const data = JSON.parse(content);
    const jobIndex = data.jobs.findIndex(j => j.id === req.params.id);
    
    if (jobIndex === -1) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Update job with provided fields
    const updatedJob = {
      ...data.jobs[jobIndex],
      ...req.body,
      updatedAtMs: Date.now()
    };
    
    data.jobs[jobIndex] = updatedJob;
    
    // Create backup
    fs.writeFileSync(jobsFile + '.bak', content, 'utf8');
    
    // Write updated jobs
    fs.writeFileSync(jobsFile, JSON.stringify(data, null, 2), 'utf8');
    
    res.json({ success: true, job: updatedJob });
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
    
    // Store temperature in history
    const now = Date.now();
    const tempC = parseFloat(cpuTemp) || 0;
    const tempF = (tempC * 9/5) + 32;
    
    tempHistory.push({
      time: now,
      temp: tempF
    });
    
    // Keep only last 5 minutes
    const fiveMinAgo = now - (5 * 60 * 1000);
    while (tempHistory.length > 0 && tempHistory[0].time < fiveMinAgo) {
      tempHistory.shift();
    }
    
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
      timestamp: now,
      tempHistory: tempHistory
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
          // Transform messages to extract text content
          const transformedMessages = msg.payload.messages.map(m => {
            let text = '';
            
            // Content can be string or array of content blocks
            if (typeof m.content === 'string') {
              text = m.content;
            } else if (Array.isArray(m.content)) {
              // Extract text from content blocks, skip thinking blocks
              const textBlocks = m.content.filter(block => block.type === 'text');
              text = textBlocks.map(block => block.text || '').join('\n');
            } else if (m.content && typeof m.content === 'object') {
              // Handle object with numeric keys (array-like)
              const values = Object.values(m.content);
              const textBlocks = values.filter(block => block && block.type === 'text');
              text = textBlocks.map(block => block.text || '').join('\n');
            }
            
            return {
              role: m.role,
              content: text,
              timestamp: m.timestamp
            };
          }).filter(m => m.content); // Remove empty messages
          
          clientWs.send(JSON.stringify({
            type: 'history',
            messages: transformedMessages
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
        console.log('Event received:', msg.event);
        if (msg.event === 'chat' && payload.message) {
          console.log('Chat message:', JSON.stringify(payload.message).slice(0, 300));
        }
        if (msg.event === 'agent' && payload.data) {
          console.log('Agent data:', JSON.stringify(payload.data).slice(0, 300));
        }
        
        // Agent event - streaming response chunks
        if (msg.event === 'agent') {
          const data = payload.data || {};
          
          // Streaming text chunks - use delta for incremental updates
          if (data.delta) {
            clientWs.send(JSON.stringify({
              type: 'chunk',
              content: data.delta
            }));
          }
          
          // End of stream
          if (data.phase === 'end') {
            clientWs.send(JSON.stringify({
              type: 'done'
            }));
          }
          return;
        }
        
        // Chat event - we skip this since agent events handle streaming
        // The chunks build up the message, no need for duplicate final message
        if (msg.event === 'chat') {
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
