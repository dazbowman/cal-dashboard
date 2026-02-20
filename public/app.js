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
    // Update avatar ring
    const avatarRing = document.getElementById('avatar-ring');
    if (avatarRing) {
      avatarRing.className = 'avatar-ring';
      if (state === 'connected' || state === 'working') {
        avatarRing.classList.add('active');
      } else if (state === 'error') {
        avatarRing.classList.add('error');
      } else {
        avatarRing.classList.add('idle');
      }
    }
    
    // Legacy status indicator (if exists)
    const indicator = document.getElementById('status-indicator');
    if (!indicator) return;
    const dot = indicator.querySelector('.status-dot');
    const statusText = indicator.querySelector('.status-text');
    if (!dot || !statusText) return;
    
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
          
          mediaRecorder.start(100); // Collect chunks every 100ms
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
    
    // Smooth fade transition
    editor.style.opacity = '0.5';
    editor.style.transition = 'opacity 0.2s ease';
    
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(filename)}`);
      const data = await res.json();
      editor.value = data.content || 'File not found';
    } catch (e) {
      editor.value = `Error loading file: ${e.message}`;
    }
    
    // Fade back in
    setTimeout(() => {
      editor.style.opacity = '1';
    }, 10);
    
    // Clear transition after animation completes
    setTimeout(() => {
      editor.style.transition = 'none';
    }, 250);
  }
  
  async saveDnaFile() {
    const editor = document.getElementById('dna-editor');
    const status = document.getElementById('dna-save-status');
    const btn = document.getElementById('save-dna-btn');
    
    // Visual feedback: disable button during save
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    
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
        status.innerHTML = '✓ Saved';
        status.className = 'save-status success';
        btn.textContent = 'Saved ✓';
        
        // Subtle pulse animation on success
        editor.style.opacity = '0.95';
        setTimeout(() => { editor.style.opacity = '1'; }, 150);
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      status.innerHTML = `✗ ${e.message}`;
      status.className = 'save-status error';
      btn.textContent = 'Error - Try Again';
    }
    
    // Reset button state
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = originalText;
      status.textContent = '';
    }, 2500);
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
    const btn = document.getElementById('save-memory-btn');
    
    // Visual feedback: disable button during save
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    
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
        status.innerHTML = '✓ Saved';
        status.className = 'save-status success';
        btn.textContent = 'Saved ✓';
        
        // Subtle pulse animation on success
        editor.style.opacity = '0.95';
        setTimeout(() => { editor.style.opacity = '1'; }, 150);
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      status.innerHTML = `✗ ${e.message}`;
      status.className = 'save-status error';
      btn.textContent = 'Error - Try Again';
    }
    
    // Reset button state
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = originalText;
      status.textContent = '';
    }, 2500);
  }
  
  // Skills
  async loadSkills() {
    const grid = document.getElementById('skills-grid');
    grid.innerHTML = '<div class="empty-state">Loading...</div>';
    
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      
      if (data.skills && data.skills.length > 0) {
        this.skills = data.skills; // Store for later use
        
        grid.innerHTML = data.skills.map(skill => `
          <div class="skill-card" data-skill="${this.escapeHtml(skill.name)}">
            <div class="skill-header">
              <span class="skill-emoji">${skill.emoji || '📦'}</span>
            </div>
            <div class="skill-name">${this.escapeHtml(skill.name)}</div>
            <div class="skill-desc">${this.escapeHtml(skill.description)}</div>
          </div>
        `).join('');
        
        // Add click handlers
        document.querySelectorAll('.skill-card').forEach(card => {
          card.addEventListener('click', () => {
            const skillName = card.dataset.skill;
            this.openSkillEditor(skillName);
          });
        });
      } else {
        grid.innerHTML = '<div class="empty-state">No skills found</div>';
      }
    } catch (e) {
      grid.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  }
  
  async openSkillEditor(skillName) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'skill-editor-overlay';
    overlay.innerHTML = `
      <div class="skill-editor-modal">
        <div class="skill-editor-header">
          <h2>${this.escapeHtml(skillName)}</h2>
          <button class="close-btn" id="close-skill-editor">✕</button>
        </div>
        <div class="skill-editor-body">
          <textarea class="skill-markdown-editor" id="skill-markdown-editor" placeholder="Loading..."></textarea>
        </div>
        <div class="skill-editor-footer">
          <span class="save-status" id="skill-save-status"></span>
          <div class="skill-editor-actions">
            <button class="btn btn-secondary" id="cancel-skill-edit">Cancel</button>
            <button class="btn btn-primary" id="save-skill-btn">Save Changes</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Load skill content
    const editor = document.getElementById('skill-markdown-editor');
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}`);
      const data = await res.json();
      editor.value = data.markdown || 'Skill not found';
      this.currentSkillLocation = data.location;
    } catch (e) {
      editor.value = `Error loading skill: ${e.message}`;
    }
    
    // Event handlers
    document.getElementById('close-skill-editor').addEventListener('click', () => {
      overlay.remove();
    });
    
    document.getElementById('cancel-skill-edit').addEventListener('click', () => {
      overlay.remove();
    });
    
    document.getElementById('save-skill-btn').addEventListener('click', async () => {
      await this.saveSkill(skillName, editor.value);
    });
    
    // Close on overlay click (but not modal click)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
    
    // ESC to close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }
  
  async saveSkill(skillName, markdown) {
    const status = document.getElementById('skill-save-status');
    
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown })
      });
      
      if (res.ok) {
        status.textContent = '✓ Saved!';
        status.className = 'save-status success';
        
        // Close modal after brief delay
        setTimeout(() => {
          document.querySelector('.skill-editor-overlay')?.remove();
        }, 1000);
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      status.textContent = `✗ Error: ${e.message}`;
      status.className = 'save-status error';
    }
    
    setTimeout(() => { status.textContent = ''; }, 3000);
  }
  
  // Cron Jobs - Enhanced with card view and editor
  async loadCronJobs() {
    const grid = document.getElementById('cron-cards-grid');
    grid.innerHTML = '<div class="cron-loading"><div class="cron-loading-spinner"></div></div>';
    
    try {
      const res = await fetch('/api/cron');
      const data = await res.json();
      
      if (data.jobs && data.jobs.length > 0) {
        this.cronJobs = data.jobs; // Store for editing
        grid.innerHTML = data.jobs.map(job => this.renderCronCard(job)).join('');
        
        // Add click handlers
        document.querySelectorAll('.cron-job-card').forEach(card => {
          card.addEventListener('click', () => {
            const jobId = card.dataset.jobId;
            this.openCronEditor(jobId);
          });
        });
      } else {
        grid.innerHTML = `
          <div class="cron-empty-state">
            <div class="cron-empty-icon">⏰</div>
            <div class="cron-empty-title">No cron jobs yet</div>
            <div class="cron-empty-desc">Scheduled tasks will appear here when configured</div>
          </div>
        `;
      }
    } catch (e) {
      grid.innerHTML = `
        <div class="cron-empty-state">
          <div class="cron-empty-icon">⚠️</div>
          <div class="cron-empty-title">Error loading jobs</div>
          <div class="cron-empty-desc">${this.escapeHtml(e.message)}</div>
        </div>
      `;
    }
  }
  
  renderCronCard(job) {
    const isEnabled = job.enabled !== false;
    const schedule = this.formatCronSchedule(job.schedule);
    const nextRun = job.state?.nextRunAtMs 
      ? this.formatNextRun(job.state.nextRunAtMs) 
      : 'Not scheduled';
    const sessionTarget = job.sessionTarget || 'isolated';
    
    return `
      <div class="cron-job-card ${isEnabled ? '' : 'disabled'}" data-job-id="${job.id}">
        <div class="cron-card-header">
          <div class="cron-card-title">${this.escapeHtml(job.name)}</div>
          <div class="cron-status-badge ${isEnabled ? 'active' : 'disabled'}">
            ${isEnabled ? 'Active' : 'Paused'}
          </div>
        </div>
        
        <div class="cron-card-schedule">
          <div class="cron-schedule-icon">⏱️</div>
          <div class="cron-schedule-text">
            <div class="cron-schedule-label">Schedule</div>
            <div class="cron-schedule-value">${this.escapeHtml(schedule)}</div>
          </div>
        </div>
        
        <div class="cron-card-meta">
          <div class="cron-meta-item">
            <div class="cron-meta-label">Next Run</div>
            <div class="cron-meta-value">${this.escapeHtml(nextRun)}</div>
          </div>
          <div class="cron-meta-item">
            <div class="cron-meta-label">Session</div>
            <div class="cron-meta-value session-${sessionTarget}">${this.escapeHtml(sessionTarget)}</div>
          </div>
        </div>
      </div>
    `;
  }
  
  formatCronSchedule(schedule) {
    if (!schedule) return 'Not configured';
    
    if (schedule.kind === 'every' && schedule.everyMs) {
      const minutes = Math.round(schedule.everyMs / 60000);
      if (minutes < 60) return `Every ${minutes}m`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `Every ${hours}h`;
      const days = Math.round(hours / 24);
      return `Every ${days}d`;
    }
    
    if (schedule.kind === 'cron' && schedule.expr) {
      return schedule.expr;
    }
    
    return schedule.kind || 'Unknown';
  }
  
  formatNextRun(timestamp) {
    const now = Date.now();
    const diff = timestamp - now;
    
    if (diff < 0) return 'Overdue';
    
    const minutes = Math.round(diff / 60000);
    if (minutes < 60) return `${minutes}m`;
    
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    
    const days = Math.round(hours / 24);
    return `${days}d`;
  }
  
  async openCronEditor(jobId) {
    const job = this.cronJobs.find(j => j.id === jobId);
    if (!job) return;
    
    // Create modal
    const overlay = document.createElement('div');
    overlay.className = 'cron-editor-overlay';
    overlay.innerHTML = `
      <div class="cron-editor-modal">
        <div class="cron-editor-header">
          <div>
            <div class="cron-editor-title">${this.escapeHtml(job.name)}</div>
            <div class="cron-editor-subtitle">Edit cron job configuration</div>
          </div>
          <button class="cron-editor-close" id="cron-close">✕</button>
        </div>
        
        <div class="cron-editor-body">
          <div class="cron-form-grid">
            <div class="cron-form-group">
              <label class="cron-form-label">Job Name</label>
              <input type="text" class="cron-form-input" id="cron-name" value="${this.escapeHtml(job.name)}">
            </div>
            
            <div class="cron-form-group">
              <label class="cron-form-label">Schedule</label>
              <input type="text" class="cron-form-input" id="cron-schedule" 
                     value="${job.schedule?.kind === 'every' ? job.schedule.everyMs / 60000 : (job.schedule?.expr || '')}"
                     placeholder="15 (minutes) or cron expression">
              <div class="cron-form-hint">
                Enter minutes for interval (e.g., "15" for every 15 minutes) or cron expression
              </div>
            </div>
            
            <div class="cron-form-group">
              <label class="cron-form-label">Message / Task</label>
              <textarea class="cron-form-textarea" id="cron-message" placeholder="The task or message to execute">${this.escapeHtml(job.payload?.message || '')}</textarea>
            </div>
            
            <div class="cron-form-group">
              <label class="cron-form-label">Session Target</label>
              <select class="cron-form-select" id="cron-session">
                <option value="isolated" ${job.sessionTarget === 'isolated' ? 'selected' : ''}>Isolated</option>
                <option value="main" ${job.sessionTarget === 'main' ? 'selected' : ''}>Main</option>
              </select>
              <div class="cron-form-hint">
                Isolated: Fresh session each run. Main: Shared memory with main agent.
              </div>
            </div>
            
            <div class="cron-form-toggle" id="cron-enabled-toggle">
              <div class="cron-toggle-switch ${job.enabled !== false ? 'active' : ''}" id="cron-toggle-switch"></div>
              <div class="cron-toggle-label">Job Enabled</div>
            </div>
          </div>
        </div>
        
        <div class="cron-editor-footer">
          <div class="cron-editor-status" id="cron-status"></div>
          <div class="cron-editor-actions">
            <button class="cron-btn cron-btn-cancel" id="cron-cancel">Cancel</button>
            <button class="cron-btn cron-btn-save" id="cron-save">Save Changes</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Toggle switch interaction
    const toggleSwitch = document.getElementById('cron-toggle-switch');
    const toggleContainer = document.getElementById('cron-enabled-toggle');
    let isEnabled = job.enabled !== false;
    
    toggleContainer.addEventListener('click', () => {
      isEnabled = !isEnabled;
      toggleSwitch.classList.toggle('active', isEnabled);
    });
    
    // Close handlers
    const closeModal = () => overlay.remove();
    document.getElementById('cron-close').addEventListener('click', closeModal);
    document.getElementById('cron-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    
    // Save handler
    document.getElementById('cron-save').addEventListener('click', async () => {
      await this.saveCronJob(jobId, isEnabled);
    });
    
    // ESC to close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }
  
  async saveCronJob(jobId, isEnabled) {
    const status = document.getElementById('cron-status');
    const saveBtn = document.getElementById('cron-save');
    
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    try {
      const name = document.getElementById('cron-name').value.trim();
      const scheduleInput = document.getElementById('cron-schedule').value.trim();
      const message = document.getElementById('cron-message').value.trim();
      const sessionTarget = document.getElementById('cron-session').value;
      
      if (!name || !scheduleInput || !message) {
        throw new Error('Name, schedule, and message are required');
      }
      
      // Parse schedule
      let schedule;
      if (/^\d+$/.test(scheduleInput)) {
        // Simple minutes interval
        schedule = {
          kind: 'every',
          everyMs: parseInt(scheduleInput) * 60000
        };
      } else {
        // Assume cron expression
        schedule = {
          kind: 'cron',
          expr: scheduleInput
        };
      }
      
      // Build update payload
      const updates = {
        name,
        enabled: isEnabled,
        schedule,
        sessionTarget,
        payload: {
          kind: 'agentTurn',
          message,
          model: 'openrouter/google/gemini-2.0-flash-lite'
        }
      };
      
      const res = await fetch(`/api/cron/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        status.textContent = '✓ Saved successfully!';
        status.className = 'cron-editor-status success';
        saveBtn.textContent = 'Saved ✓';
        
        // Reload jobs after a brief delay
        setTimeout(() => {
          document.querySelector('.cron-editor-overlay')?.remove();
          this.loadCronJobs();
        }, 1000);
      } else {
        throw new Error(data.error || 'Save failed');
      }
    } catch (err) {
      status.textContent = `✗ ${err.message}`;
      status.className = 'cron-editor-status error';
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
      
      setTimeout(() => {
        status.textContent = '';
      }, 3000);
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
    const ctx = document.getElementById('temp-chart');
    if (!ctx) return;
    
    // Temperature thresholds in Fahrenheit
    this.tempThresholds = {
      safe: 140,      // 60°C
      caution: 158,   // 70°C  
      danger: 176,    // 80°C
      max: 185        // 85°C
    };
    
    // Gradient for the fill
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 140);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
    
    this.tempChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: '#10b981',
          backgroundColor: gradient,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#10b981',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: {
          x: {
            display: false
          },
          y: {
            display: false,
            suggestedMin: 100,
            suggestedMax: 180
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleFont: { size: 10 },
            bodyFont: { size: 11 },
            padding: 6,
            displayColors: false,
            callbacks: {
              title: () => '',
              label: (ctx) => ctx.parsed.y.toFixed(1) + '°F'
            }
          },
          annotation: {
            annotations: {
              cautionLine: {
                type: 'line',
                yMin: 158,
                yMax: 158,
                borderColor: 'rgba(245, 158, 11, 0.4)',
                borderWidth: 1,
                borderDash: [3, 3]
              },
              dangerLine: {
                type: 'line',
                yMin: 176,
                yMax: 176,
                borderColor: 'rgba(239, 68, 68, 0.4)',
                borderWidth: 1,
                borderDash: [3, 3]
              }
            }
          }
        }
      }
    });
  }
  
  updateTempChartFromHistory(history) {
    if (!this.tempChart || !history || history.length === 0) return;
    
    // Convert timestamps to time labels (just minutes:seconds for cleaner look)
    const labels = history.map(p => {
      const d = new Date(p.time);
      return d.toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' });
    });
    const temps = history.map(p => p.temp);
    
    // Update chart data
    this.tempChart.data.labels = labels;
    this.tempChart.data.datasets[0].data = temps;
    
    // Get current temperature
    const currentTemp = temps[temps.length - 1];
    
    // Determine color based on temp
    let lineColor = '#10b981'; // green - safe
    let colorClass = '';
    if (currentTemp >= this.tempThresholds.danger) {
      lineColor = '#ef4444'; // red - danger
      colorClass = 'danger';
    } else if (currentTemp >= this.tempThresholds.caution) {
      lineColor = '#f59e0b'; // yellow - caution
      colorClass = 'caution';
    }
    
    // Update chart colors
    this.tempChart.data.datasets[0].borderColor = lineColor;
    
    // Create new gradient with current color
    const ctx = document.getElementById('temp-chart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 140);
    gradient.addColorStop(0, lineColor.replace(')', ', 0.3)').replace('#', 'rgba(').replace(/([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i, (m, r, g, b) => `${parseInt(r,16)}, ${parseInt(g,16)}, ${parseInt(b,16)}`));
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.tempChart.data.datasets[0].backgroundColor = gradient;
    
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
      
      // CPU Gauge
      const cpuEl = document.getElementById('pi-cpu');
      const cpuGauge = document.getElementById('cpu-gauge');
      if (cpuEl && cpuGauge) {
        const cpuPercent = Math.min(data.cpu.usage, 100);
        cpuEl.textContent = cpuPercent.toFixed(0) + '%';
        // Arc length is ~157 (half circle with radius 50)
        const arcLength = 157;
        const filled = (cpuPercent / 100) * arcLength;
        cpuGauge.setAttribute('stroke-dasharray', `${filled} ${arcLength}`);
      }
      
      // Temperature - convert to Fahrenheit
      const tempEl = document.getElementById('pi-temp');
      const tempBar = document.getElementById('pi-temp-bar');
      if (tempEl && data.cpu.temp !== 'N/A') {
        const tempC = parseFloat(data.cpu.temp);
        const tempF = (tempC * 9/5) + 32;
        tempEl.textContent = tempF.toFixed(1) + '°F';
        
        // Update temp bar (scale: 100°F = 0%, 185°F = 100%)
        if (tempBar) {
          const percent = Math.min(Math.max((tempF - 100) / 85 * 100, 0), 100);
          tempBar.style.width = percent + '%';
          tempBar.classList.toggle('warning', tempF >= 158);
          tempBar.classList.toggle('danger', tempF >= 176);
        }
        
        // Update the temperature chart with server-stored history
        if (data.tempHistory) {
          this.updateTempChartFromHistory(data.tempHistory);
        }
      }
      
      // Memory Gauge
      const memEl = document.getElementById('pi-memory');
      const memGauge = document.getElementById('memory-gauge');
      const memDetail = document.getElementById('pi-memory-detail');
      if (memEl && memGauge) {
        const memPercent = Math.min(data.memory.percent, 100);
        memEl.textContent = memPercent.toFixed(0) + '%';
        const arcLength = 157;
        const filled = (memPercent / 100) * arcLength;
        memGauge.setAttribute('stroke-dasharray', `${filled} ${arcLength}`);
        
        // Update detail text (convert MB to GB)
        if (memDetail) {
          const usedGB = (data.memory.used / 1024).toFixed(1);
          const totalGB = (data.memory.total / 1024).toFixed(0);
          memDetail.textContent = `${usedGB}GB / ${totalGB}GB`;
        }
      }
      
      // Disk
      const diskEl = document.getElementById('pi-disk');
      const diskBar = document.getElementById('pi-disk-bar');
      if (diskEl) {
        // Convert G to GB for display
        const used = data.disk.used.replace('G', 'GB');
        const total = data.disk.total.replace('G', 'GB');
        diskEl.textContent = `${used} / ${total}`;
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
