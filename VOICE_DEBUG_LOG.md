# Voice Recording Audio Truncation Debug Log

## Problem
Voice messages are being truncated even after the mediaRecorder.start(100) fix. User says full sentences but transcription only receives fragments like "yeah" or "okay".

## Debug Approach

### Client-Side Logging (app.js)
Added comprehensive logging to track the audio recording pipeline:

1. **Recording Start** - Log when recording begins
2. **Chunk Collection** - Log each chunk as it arrives (size, type)
3. **Recording Stop** - Log all collected chunks and their sizes
4. **Blob Creation** - Log final blob size before sending
5. **Base64 Encoding** - Log base64 length and first 100 characters
6. **WebSocket Send** - Log when voice payload is sent

### Server-Side Logging (server.js)
Added detailed logging to track the audio transmission and transcription:

1. **Voice Message Received** - Log audio data length received from client
2. **Gemini API Request** - Log mime_type and data length being sent
3. **Full Gemini Response** - Log complete API response object (not just transcript)
4. **Extracted Transcript** - Log transcript text and length

## What to Look For

### In Browser Console (DevTools → Console)
```
[VOICE] Recording started - waiting for audio...
Audio chunk received: 1234 bytes, type: audio/webm
...more chunks...
=== MEDIA RECORDER ONSTOP ===
Audio chunks collected: 15
  Chunk 0: 1234 bytes, type: audio/webm
  Chunk 1: 1456 bytes, type: audio/webm
  ...
Blob created - total size: 25000 bytes
===== VOICE SEND DEBUG =====
Audio blob size (bytes): 25000
Recording duration (ms): 15000
Recording duration (sec): 15
Audio blob type: audio/webm
Audio chunks collected: 15
Base64 length (chars): 33334
Base64 first 100 chars: [base64 data]
Sending voice message via WebSocket...
Voice payload size: [size]
Voice message sent
======================
```

### In Server Logs (server.js)
```
=== VOICE MESSAGE RECEIVED ===
Audio data length: 33334
MIME type: audio/webm
First 100 chars of audio: [base64 start]
Sending to Gemini API with mime_type: audio/webm, data length: 33334
Gemini API response status: 200
Full Gemini response: {
  "candidates": [{
    "content": {
      "parts": [{
        "text": "This is the full transcription of the audio"
      }]
    }
  }]
}
Extracted transcript: This is the full transcription of the audio
Transcript length: 44
Transcription successful: This is the full transcription of the audio
...
=============================
```

## Changes Made

### 1. Increased Timeslice (500ms)
Changed from 100ms to 500ms in `mediaRecorder.start()`
- Fewer, larger chunks may be more reliable than many small ones
- Could help with blob integrity

### 2. Added 50ms Wait After Stop
Added `setTimeout` in `mediaRecorder.onstop` before creating blob
- Ensures all chunks are properly buffered before combining
- Prevents race condition where blob is created before final chunk arrives

### 3. Added Timestamp to Voice Payload
Added `timestamp: Date.now()` to prevent WebSocket message deduplication
- Guards against any client/server caching

## Debugging Steps

When testing voice recording:

1. **Open DevTools** (F12 → Console)
2. **Record a voice message** (full sentence, 10-15 seconds)
3. **Check client logs** for:
   - How many chunks were collected?
   - What's the total blob size?
   - Is base64 properly encoded?
4. **Check server logs** for:
   - Did audio data arrive intact?
   - What does Gemini return?
   - Is transcript full or truncated?
5. **Compare** user's spoken message with:
   - Browser transcription display
   - Server logs transcript
   - Agent's final received message

## Possible Root Causes

Based on logging output, look for:

| Symptom | Likely Cause |
|---------|------------|
| audioChunks.length = 0 | Microphone access denied or failed |
| audioChunks.length = 1 | Recording stopped too quickly, or timeslice too large |
| audioBlob.size very small (<1KB) | Blob not collecting all chunks |
| Base64 doesn't start with proper header | Encoding issue or truncation |
| Gemini returns empty text | Audio format incompatible or too quiet |
| Gemini returns error about mime_type | Wrong audio format sent |
| Gemini returns full text but agent sees fragment | Network truncation or WebSocket issue |

## Next Steps

1. Test with various recording lengths (5s, 10s, 20s)
2. Monitor chunk sizes - should be roughly even
3. Check if pattern correlates with recording length
4. If audio is truncated at blob level → fix MediaRecorder
5. If audio reaches server intact but Gemini truncates → try different format
6. If Gemini works but agent doesn't receive → check WebSocket/network
