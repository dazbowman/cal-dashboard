// Cal's Dashboard - Main Application

class CalDashboard {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.currentPage = 'dashboard';
    this.currentDnaFile = 'SOUL.md';
    this.currentMemoryFile = null;
    this.messages = [];
    this.recognition = null;
    this.currentStreamingMessage = null;
    
    this.init();
  }
  
  init() {
    this.setupNavigation();
    this.setupChat();
    this.setupDnaEditor();
    this.setupMemoryEditor();
    this.setupMobileMenu();
    this.setupChatPanel();
    this.setupVoiceInput();
    this.connectWebSocket();
    this.loadInitialData();
  }
  
  // Navigation
  setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.navigateTo(page);
        
        // Close mobile menu
        document.getElementById('sidebar').classList.remove('open');
        document.querySelector('.overlay')?.classList.remove('visible');
      });
    });
  }
  
  navigateTo(page) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });
    
    // Update pages
    document.querySelectorAll('.page').forEach(p => {
      p.classList.toggle('active', p.id === `page-${page}`);
    });
    
    this.currentPage = page;
    
    // Load page-specific data
    if (page === 'skills') this.loadSkills();
    if (page === 'cron') this.loadCronJobs();
    if (page === 'memory') this.loadMemoryFiles();
  }
  
  // WebSocket Connection
  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    this.updateStatus('connecting', 'Connecting...');
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.connected = true;
        this.updateStatus('connected', 'Connected');
        document.getElementById('gateway-status').textContent = 'Connected';
        document.getElementById('gateway-status').className = 'status-badge connected';
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.log('Raw message:', event.data);
        }
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.connected = false;
        this.updateStatus('disconnected', 'Disconnected');
        document.getElementById('gateway-status').textContent = 'Disconnected';
        document.getElementById('gateway-status').className = 'status-badge disconnected';
        
        // Reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(), 5000);
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.updateStatus('error', 'Connection Error');
      };
    } catch (e) {
      console.error('Failed to connect:', e);
      this.updateStatus('error', 'Connection Failed');
      setTimeout(() => this.connectWebSocket(), 5000);
    }
  }
  
  handleMessage(data) {
    console.log('Message received:', data);
    
    if (data.type === 'auth' && data.success) {
      console.log('Authenticated with gateway');
      return;
    }
    
    if (data.type === 'history' && data.messages) {
      // Load chat history
      data.messages.forEach(msg => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          this.addChatMessage(msg.content || msg.text || '', msg.role, true);
        }
      });
      return;
    }
    
    if (data.type === 'transcription') {
      // Update the "sending..." message with actual transcript
      this.updateLastUserMessage(data.text);
      return;
    }
    
    if (data.type === 'message' || data.type === 'response') {
      const content = data.content || data.text || '';
      if (content && typeof content === 'string') {
        this.addChatMessage(content, 'assistant');
      } else {
        console.log('Received non-string response:', data);
      }
    }
    
    if (data.type === 'status') {
      this.updateDashboardStatus(data);
    }
    
    if (data.type === 'chunk') {
      // Start a new assistant message or append to existing
      if (!this.currentStreamingMessage) {
        this.startStreamingMessage();
      }
      this.appendToStreamingMessage(data.content || '');
    }
    
    if (data.type === 'done') {
      // Remove streaming class from message to finalize it
      ['main-chat-messages', 'side-chat-messages'].forEach(id => {
        const container = document.getElementById(id);
        const streamingMsg = container.querySelector('.chat-message.streaming');
        if (streamingMsg) {
          streamingMsg.classList.remove('streaming');
        }
      });
      this.currentStreamingMessage = null;
    }
    
    if (data.type === 'error') {
      this.addChatMessage('Error: ' + (data.message || 'Unknown error'), 'system');
    }
  }
  
  updateLastUserMessage(text) {
    ['main-chat-messages', 'side-chat-messages'].forEach(id => {
      const container = document.getElementById(id);
      const lastUserMsg = container.querySelector('.chat-message.user:last-of-type .message-content');
      if (lastUserMsg && lastUserMsg.textContent.includes('sending')) {
        lastUserMsg.textContent = text;
      }
    });
  }
  
  startStreamingMessage() {
    this.currentStreamingMessage = true;
    ['main-chat-messages', 'side-chat-messages'].forEach(id => {
      const container = document.getElementById(id);
      const msgEl = document.createElement('div');
      msgEl.className = 'chat-message assistant streaming';
      msgEl.innerHTML = '<div class="message-content"></div>';
      container.appendChild(msgEl);
      container.scrollTop = container.scrollHeight;
    });
  }
  
  appendToStreamingMessage(text) {
    ['main-chat-messages', 'side-chat-messages'].forEach(id => {
      const container = document.getElementById(id);
      const streamingMsg = container.querySelector('.chat-message.streaming .message-content');
      if (streamingMsg) {
        streamingMsg.textContent += text;
        container.scrollTop = container.scrollHeight;
      }
    });
  }
  
  updateStatus(state, text) {
    const indicator = document.getElementById('status-indicator');
    const dot = indicator.querySelector('.status-dot');
    const statusText = indicator.querySelector('.status-text');
    
    dot.className = 'status-dot ' + state;
    statusText.textContent = text;
  }
  
  updateDashboardStatus(data) {
    const statusDisplay = document.getElementById('dashboard-status');
    if (data.state) {
      const emoji = data.state === 'working' ? '😼' : data.state === 'sleeping' ? '😸' : '😺';
      statusDisplay.querySelector('.status-emoji').textContent = emoji;
      statusDisplay.querySelector('.status-label').textContent = 
        data.state.charAt(0).toUpperCase() + data.state.slice(1);
    }
  }
  
  // Chat Functionality
  setupChat() {
    // Main chat
    const mainInput = document.getElementById('main-chat-input');
    const mainSendBtn = document.getElementById('main-send-btn');
    
    mainSendBtn.addEventListener('click', () => this.sendMessage(mainInput));
    mainInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage(mainInput);
      }
    });
    
    // Auto-resize textarea
    mainInput.addEventListener('input', () => this.autoResize(mainInput));
    
    // Side chat
    const sideInput = document.getElementById('side-chat-input');
    const sideSendBtn = document.getElementById('side-send-btn');
    
    sideSendBtn.addEventListener('click', () => this.sendMessage(sideInput));
    sideInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage(sideInput);
      }
    });
    sideInput.addEventListener('input', () => this.autoResize(sideInput));
  }
  
  autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }
  
  sendMessage(inputEl) {
    const text = inputEl.value.trim();
    if (!text) return;
    
    this.addChatMessage(text, 'user');
    inputEl.value = '';
    inputEl.style.height = 'auto';
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'message',
        channel: 'webchat',
        content: text
      }));
    } else {
      this.addChatMessage('Not connected to gateway. Reconnecting...', 'system');
    }
  }
  
  addChatMessage(text, role, isHistory = false) {
    const message = { text, role, time: new Date() };
    this.messages.push(message);
    
    // Add to both chat containers
    ['main-chat-messages', 'side-chat-messages'].forEach(id => {
      const container = document.getElementById(id);
      const msgEl = document.createElement('div');
      msgEl.className = `chat-message ${role}`;
      if (isHistory) msgEl.classList.add('history');
      msgEl.innerHTML = `<div class="message-content">${this.escapeHtml(text)}</div>`;
      container.appendChild(msgEl);
      container.scrollTop = container.scrollHeight;
    });
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Voice Input - Hold to Record with Visual Feedback
  setupVoiceInput() {
    this.voiceRecorders = {};
    
    ['main', 'side'].forEach(prefix => {
      const btn = document.getElementById(`${prefix}-voice-btn`);
      const inputArea = document.getElementById(`${prefix}-chat-input-area`);
      const input = document.getElementById(`${prefix}-chat-input`);
      const indicator = document.getElementById(`${prefix}-recording-indicator`);
      const timeDisplay = document.getElementById(`${prefix}-recording-time`);
      const cancelBtn = document.getElementById(`${prefix}-cancel-recording`);
      const preview = document.getElementById(`${prefix}-voice-preview`);
      const previewWaveform = document.getElementById(`${prefix}-preview-waveform`);
      const previewDuration = document.getElementById(`${prefix}-preview-duration`);
      const clearBtn = document.getElementById(`${prefix}-clear-voice`);
      const sendBtn = document.getElementById(`${prefix}-send-btn`);
      
      let mediaRecorder = null;
      let audioChunks = [];
      let recordingStartTime = null;
      let recordingTimer = null;
      let audioBlob = null;
      let analyser = null;
      let animationFrame = null;
      
      const startRecording = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          
          // Set up audio analyser for waveform
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioContext.createMediaStreamSource(stream);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];
          
          mediaRecorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
          };
          
          mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            if (animationFrame) cancelAnimationFrame(animationFrame);
            
            if (audioChunks.length > 0) {
              audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
              showPreview();
            }
          };
          
          mediaRecorder.start();
          recordingStartTime = Date.now();
          
          // Show recording indicator
          btn.classList.add('recording');
          indicator.classList.add('active');
          inputArea.classList.add('has-voice');
          
          // Update timer
          recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            timeDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
          }, 100);
          
          // Animate waveform based on audio input
          const bars = indicator.querySelectorAll('.waveform .bar');
          const animateWaveform = () => {
            if (!analyser) return;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            
            bars.forEach((bar, i) => {
              const value = dataArray[i * 2] || 0;
              const height = Math.max(4, (value / 255) * 24);
              bar.style.height = height + 'px';
              bar.style.animation = 'none'; // Disable CSS animation, use live data
            });
            
            animationFrame = requestAnimationFrame(animateWaveform);
          };
          animateWaveform();
          
        } catch (err) {
          console.error('Failed to start recording:', err);
          alert('Could not access microphone. Please allow microphone access.');
        }
      };
      
      const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
        
        btn.classList.remove('recording');
        indicator.classList.remove('active');
        clearInterval(recordingTimer);
        
        // Reset bar animations
        const bars = indicator.querySelectorAll('.waveform .bar');
        bars.forEach(bar => {
          bar.style.height = '';
          bar.style.animation = '';
        });
      };
      
      const cancelRecording = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          audioChunks = []; // Clear chunks so no preview is shown
          mediaRecorder.stop();
        }
        resetState();
      };
      
      const showPreview = () => {
        indicator.classList.remove('active');
        preview.classList.add('active');
        
        // Calculate duration
        const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        previewDuration.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        // Generate static waveform bars for preview
        previewWaveform.innerHTML = '';
        for (let i = 0; i < 30; i++) {
          const bar = document.createElement('div');
          bar.className = 'bar';
          bar.style.height = (Math.random() * 16 + 4) + 'px';
          previewWaveform.appendChild(bar);
        }
      };
      
      const clearPreview = () => {
        audioBlob = null;
        resetState();
      };
      
      const resetState = () => {
        preview.classList.remove('active');
        indicator.classList.remove('active');
        inputArea.classList.remove('has-voice');
        btn.classList.remove('recording');
        clearInterval(recordingTimer);
        timeDisplay.textContent = '0:00';
        audioBlob = null;
      };
      
      const sendVoice = async () => {
        if (!audioBlob) return;
        
        // Show that we're sending
        this.addChatMessage('[Voice message sending...]', 'user');
        
        // Convert blob to base64 and send
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              type: 'voice',
              channel: 'webchat',
              audio: base64,
              mimeType: 'audio/webm'
            }));
          }
        };
        reader.readAsDataURL(audioBlob);
        
        resetState();
      };
      
      // Event listeners - Hold to record
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startRecording();
      });
      
      btn.addEventListener('mouseup', () => {
        stopRecording();
      });
      
      btn.addEventListener('mouseleave', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          stopRecording();
        }
      });
      
      // Touch support
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRecording();
      });
      
      btn.addEventListener('touchend', () => {
        stopRecording();
      });
      
      // Cancel button
      cancelBtn.addEventListener('click', cancelRecording);
      
      // Clear preview button
      clearBtn.addEventListener('click', clearPreview);
      
      // Modify send button to handle voice
      const originalSendHandler = () => {
        if (audioBlob) {
          sendVoice();
        } else {
          this.sendMessage(input);
        }
      };
      
      sendBtn.removeEventListener('click', sendBtn._handler);
      sendBtn._handler = originalSendHandler;
      sendBtn.addEventListener('click', originalSendHandler);
    });
  }
  
  // DNA Editor
  setupDnaEditor() {
    document.querySelectorAll('.dna-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dna-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentDnaFile = btn.dataset.file;
        this.loadDnaFile(this.currentDnaFile);
      });
    });
    
    document.getElementById('save-dna-btn').addEventListener('click', () => this.saveDnaFile());
    
    // Load initial file
    this.loadDnaFile('SOUL.md');
  }
  
  async loadDnaFile(filename) {
    const editor = document.getElementById('dna-editor');
    editor.value = 'Loading...';
    
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(filename)}`);
      const data = await res.json();
      editor.value = data.content || 'File not found';
    } catch (e) {
      editor.value = `Error loading file: ${e.message}`;
    }
  }
  
  async saveDnaFile() {
    const editor = document.getElementById('dna-editor');
    const status = document.getElementById('dna-save-status');
    
    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: this.currentDnaFile,
          content: editor.value
        })
      });
      
      if (res.ok) {
        status.textContent = 'Saved!';
        status.className = 'save-status success';
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
      status.className = 'save-status error';
    }
    
    setTimeout(() => { status.textContent = ''; }, 3000);
  }
  
  // Memory Editor
  setupMemoryEditor() {
    document.querySelector('.memory-file[data-file="MEMORY.md"]').addEventListener('click', (e) => {
      e.preventDefault();
      this.loadMemoryFile('MEMORY.md');
    });
    
    document.getElementById('save-memory-btn').addEventListener('click', () => this.saveMemoryFile());
  }
  
  async loadMemoryFiles() {
    try {
      const res = await fetch('/api/memory');
      const data = await res.json();
      const container = document.getElementById('memory-file-list');
      
      if (data.files && data.files.length > 0) {
        container.innerHTML = data.files.map(f => 
          `<a href="#" class="memory-file" data-file="memory/${f}">${f}</a>`
        ).join('');
        
        container.querySelectorAll('.memory-file').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            this.loadMemoryFile(link.dataset.file);
          });
        });
      } else {
        container.innerHTML = '<div class="empty-state">No memory files</div>';
      }
    } catch (e) {
      console.error('Failed to load memory files:', e);
    }
  }
  
  async loadMemoryFile(filePath) {
    this.currentMemoryFile = filePath;
    const editor = document.getElementById('memory-editor');
    const header = document.getElementById('memory-current-file');
    
    header.textContent = filePath;
    editor.value = 'Loading...';
    
    // Update active state
    document.querySelectorAll('.memory-file').forEach(f => {
      f.classList.toggle('active', f.dataset.file === filePath);
    });
    
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      editor.value = data.content || 'File not found';
    } catch (e) {
      editor.value = `Error: ${e.message}`;
    }
  }
  
  async saveMemoryFile() {
    if (!this.currentMemoryFile) return;
    
    const editor = document.getElementById('memory-editor');
    const status = document.getElementById('memory-save-status');
    
    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: this.currentMemoryFile,
          content: editor.value
        })
      });
      
      if (res.ok) {
        status.textContent = 'Saved!';
        status.className = 'save-status success';
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
      status.className = 'save-status error';
    }
    
    setTimeout(() => { status.textContent = ''; }, 3000);
  }
  
  // Skills
  async loadSkills() {
    const grid = document.getElementById('skills-grid');
    grid.innerHTML = '<div class="empty-state">Loading...</div>';
    
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      
      if (data.skills && data.skills.length > 0) {
        grid.innerHTML = data.skills.map(skill => `
          <div class="skill-card">
            <div class="skill-name">${skill}</div>
            <div class="skill-desc">Skill module</div>
          </div>
        `).join('');
      } else {
        grid.innerHTML = '<div class="empty-state">No skills found</div>';
      }
    } catch (e) {
      grid.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  }
  
  // Cron Jobs
  async loadCronJobs() {
    const list = document.getElementById('cron-list');
    list.innerHTML = '<div class="empty-state">Loading...</div>';
    
    try {
      const res = await fetch('/api/cron');
      const data = await res.json();
      
      if (data.jobs && data.jobs.length > 0) {
        list.innerHTML = data.jobs.map(job => `
          <div class="cron-item">
            <div class="cron-info">
              <div class="cron-name">${job.name || job.file}</div>
              <div class="cron-schedule">${job.schedule || job.cron || 'N/A'}</div>
            </div>
            <span class="cron-status ${job.enabled !== false ? 'active' : 'paused'}">
              ${job.enabled !== false ? 'Active' : 'Paused'}
            </span>
          </div>
        `).join('');
      } else {
        list.innerHTML = '<div class="empty-state">No cron jobs configured</div>';
      }
    } catch (e) {
      list.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  }
  
  // Mobile Menu
  setupMobileMenu() {
    const menuBtn = document.getElementById('menu-btn');
    const sidebar = document.getElementById('sidebar');
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);
    
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('visible');
    });
    
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
      document.getElementById('chat-panel').classList.remove('open');
    });
    
    // Mobile chat button
    document.getElementById('mobile-chat-btn').addEventListener('click', () => {
      const panel = document.getElementById('chat-panel');
      panel.classList.toggle('open');
      overlay.classList.toggle('visible');
    });
  }
  
  // Chat Panel (Desktop) - Resizable
  setupChatPanel() {
    const panel = document.getElementById('chat-panel');
    const minimizeBtn = document.getElementById('minimize-chat');
    const resizeHandle = document.getElementById('resize-handle');
    
    let isResizing = false;
    let justFinishedResizing = false;
    let startX = 0;
    let startWidth = 0;
    const minWidth = 60;  // Width when minimized (thin bar)
    const maxWidth = 600;
    
    // Minimize/expand toggle via button
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (panel.classList.contains('minimized')) {
        panel.classList.remove('minimized');
        panel.style.width = '320px';
      } else {
        panel.classList.add('minimized');
        panel.style.width = minWidth + 'px';
      }
    });
    
    // Click on minimized panel to expand (but not right after resizing)
    panel.addEventListener('click', (e) => {
      if (justFinishedResizing) {
        justFinishedResizing = false;
        return;
      }
      if (panel.classList.contains('minimized') && e.target !== resizeHandle && e.target !== minimizeBtn) {
        panel.classList.remove('minimized');
        panel.style.width = '320px';
      }
    });
    
    // Resize drag handling
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = panel.offsetWidth;
      panel.classList.add('resizing');
      resizeHandle.classList.add('dragging');
      e.preventDefault();
      e.stopPropagation();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      
      // Calculate new width (dragging left increases width, right decreases)
      const diff = startX - e.clientX;
      let newWidth = startWidth + diff;
      
      // Clamp to min/max
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      panel.style.width = newWidth + 'px';
      
      // If dragged to minimum, add minimized class
      if (newWidth <= minWidth + 5) {
        panel.classList.add('minimized');
      } else {
        panel.classList.remove('minimized');
      }
    });
    
    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        justFinishedResizing = true;
        panel.classList.remove('resizing');
        resizeHandle.classList.remove('dragging');
        
        // Clear the flag after a short delay
        setTimeout(() => { justFinishedResizing = false; }, 100);
      }
    });
    
    // Touch support for mobile
    resizeHandle.addEventListener('touchstart', (e) => {
      isResizing = true;
      startX = e.touches[0].clientX;
      startWidth = panel.offsetWidth;
      panel.classList.add('resizing');
      e.preventDefault();
    });
    
    document.addEventListener('touchmove', (e) => {
      if (!isResizing) return;
      
      const diff = startX - e.touches[0].clientX;
      let newWidth = startWidth + diff;
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      panel.style.width = newWidth + 'px';
      
      if (newWidth <= minWidth + 5) {
        panel.classList.add('minimized');
      } else {
        panel.classList.remove('minimized');
      }
    });
    
    document.addEventListener('touchend', () => {
      if (isResizing) {
        isResizing = false;
        justFinishedResizing = true;
        panel.classList.remove('resizing');
        setTimeout(() => { justFinishedResizing = false; }, 100);
      }
    });
  }
  
  // Initial Data Load
  async loadInitialData() {
    // Load DNA file
    this.loadDnaFile('SOUL.md');
    
    // Initialize temperature chart
    this.initTempChart();
    
    // Load Pi stats
    this.loadPiStats();
    
    // Load cron jobs mini widget
    this.loadCronMini();
    
    // Start periodic updates
    setInterval(() => this.loadPiStats(), 5000); // Every 5 seconds
    setInterval(() => this.loadCronMini(), 30000); // Every 30 seconds
  }
  
  // Temperature Chart
  initTempChart() {
    this.tempHistory = [];
    this.maxTempPoints = 60; // 5 minutes at 5-second intervals
    
    const ctx = document.getElementById('temp-chart');
    if (!ctx) return;
    
    // Temperature thresholds in Fahrenheit
    this.tempThresholds = {
      safe: 140,      // 60°C
      caution: 158,   // 70°C  
      danger: 176,    // 80°C
      max: 185        // 85°C
    };
    
    this.tempChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Temperature °F',
          data: [],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        scales: {
          x: {
            display: false
          },
          y: {
            min: 80,
            max: 200,
            grid: {
              color: 'rgba(255,255,255,0.1)'
            },
            ticks: {
              color: 'var(--text-secondary)',
              font: { size: 10 },
              callback: (value) => value + '°F'
            }
          }
        },
        plugins: {
          legend: { display: false },
          annotation: {
            annotations: {
              cautionLine: {
                type: 'line',
                yMin: 158,
                yMax: 158,
                borderColor: 'rgba(245, 158, 11, 0.5)',
                borderWidth: 1,
                borderDash: [5, 5]
              },
              dangerLine: {
                type: 'line',
                yMin: 176,
                yMax: 176,
                borderColor: 'rgba(239, 68, 68, 0.5)',
                borderWidth: 1,
                borderDash: [5, 5]
              },
              dangerZone: {
                type: 'box',
                yMin: 176,
                yMax: 200,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 0
              },
              cautionZone: {
                type: 'box',
                yMin: 158,
                yMax: 176,
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 0
              }
            }
          }
        }
      }
    });
  }
  
  updateTempChart(tempF) {
    if (!this.tempChart) return;
    
    const now = new Date();
    const timeLabel = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Add new data point
    this.tempHistory.push({ time: timeLabel, temp: tempF });
    
    // Keep only last 5 minutes (60 points at 5-second intervals)
    if (this.tempHistory.length > this.maxTempPoints) {
      this.tempHistory.shift();
    }
    
    // Update chart data
    this.tempChart.data.labels = this.tempHistory.map(p => p.time);
    this.tempChart.data.datasets[0].data = this.tempHistory.map(p => p.temp);
    
    // Update line color based on current temp
    let lineColor = '#10b981'; // green - safe
    if (tempF >= this.tempThresholds.danger) {
      lineColor = '#ef4444'; // red - danger
    } else if (tempF >= this.tempThresholds.caution) {
      lineColor = '#f59e0b'; // yellow - caution
    }
    
    this.tempChart.data.datasets[0].borderColor = lineColor;
    this.tempChart.data.datasets[0].backgroundColor = lineColor.replace(')', ', 0.1)').replace('rgb', 'rgba');
    
    this.tempChart.update('none'); // No animation for smooth updates
  }
  
  // Pi System Stats
  async loadPiStats() {
    try {
      console.log('Loading Pi stats...');
      const res = await fetch('/api/system');
      if (!res.ok) throw new Error('Failed to fetch: ' + res.status);
      const data = await res.json();
      console.log('Pi stats loaded:', data);
      
      // CPU
      const cpuEl = document.getElementById('pi-cpu');
      const cpuBar = document.getElementById('pi-cpu-bar');
      if (cpuEl) {
        cpuEl.textContent = data.cpu.usage.toFixed(1) + '%';
        cpuBar.style.width = Math.min(data.cpu.usage, 100) + '%';
        cpuBar.classList.toggle('warning', data.cpu.usage > 70);
        cpuBar.classList.toggle('danger', data.cpu.usage > 90);
      }
      
      // Temperature - convert to Fahrenheit
      const tempEl = document.getElementById('pi-temp');
      if (tempEl && data.cpu.temp !== 'N/A') {
        const tempC = parseFloat(data.cpu.temp);
        const tempF = (tempC * 9/5) + 32;
        tempEl.textContent = tempF.toFixed(1) + '°F';
        
        // Update the temperature chart
        this.updateTempChart(tempF);
      }
      
      // Memory
      const memEl = document.getElementById('pi-memory');
      const memBar = document.getElementById('pi-memory-bar');
      if (memEl) {
        memEl.textContent = `${data.memory.used}MB / ${data.memory.total}MB`;
        memBar.style.width = data.memory.percent + '%';
        memBar.classList.toggle('warning', data.memory.percent > 80);
        memBar.classList.toggle('danger', data.memory.percent > 95);
      }
      
      // Disk
      const diskEl = document.getElementById('pi-disk');
      const diskBar = document.getElementById('pi-disk-bar');
      if (diskEl) {
        diskEl.textContent = `${data.disk.used} / ${data.disk.total}`;
        const diskPercent = parseInt(data.disk.percent);
        diskBar.style.width = diskPercent + '%';
        diskBar.classList.toggle('warning', diskPercent > 80);
        diskBar.classList.toggle('danger', diskPercent > 95);
      }
      
      // Load average
      const loadEl = document.getElementById('pi-load');
      if (loadEl && data.cpu.loadAvg) {
        loadEl.textContent = data.cpu.loadAvg.join(' / ');
      }
      
      // Uptime
      const uptimeEl = document.getElementById('pi-uptime');
      if (uptimeEl) {
        uptimeEl.textContent = data.uptime.replace('up ', '');
      }
      
    } catch (err) {
      console.error('Failed to load Pi stats:', err);
    }
  }
  
  // Cron Jobs Mini Widget
  async loadCronMini() {
    try {
      const res = await fetch('/api/cron');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      
      const container = document.getElementById('cron-mini');
      if (!container) return;
      
      if (!data.jobs || data.jobs.length === 0) {
        container.innerHTML = '<div class="empty-state">No cron jobs</div>';
        return;
      }
      
      container.innerHTML = data.jobs.map(job => {
        const schedule = job.schedule?.expr || job.schedule?.everyMs 
          ? `${Math.round(job.schedule.everyMs / 60000)}m` 
          : job.schedule?.kind || 'N/A';
        return `
          <div class="cron-mini-item">
            <div>
              <div class="cron-name">${job.name || job.file}</div>
              <div class="cron-schedule">${schedule}</div>
            </div>
            <div class="cron-status ${job.enabled === false ? 'disabled' : ''}"></div>
          </div>
        `;
      }).join('');
      
    } catch (err) {
      console.error('Failed to load cron jobs:', err);
    }
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new CalDashboard();
});
