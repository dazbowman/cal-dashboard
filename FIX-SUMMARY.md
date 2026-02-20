# Double-Recording Bug Fix

## Issue
When user held down the voice button and released it:
1. First recording would complete properly: 9 chunks, ~74,066 bytes ✅
2. Immediately after release, a second recording would start: 1 chunk, ~3,968 bytes ❌
3. The second recording would overwrite the good one in the audio buffer

## Root Cause
The browser synthesizes a `click` event after a `mouseup` event completes. Since there was no click handler to prevent this, the synthesized click was triggering unintended behavior in the event flow, causing a second partial recording to be initiated.

## Solution
Added a click event handler on the voice button that:
1. Calls `preventDefault()` to stop the default browser behavior
2. Calls `stopPropagation()` to prevent event bubbling
3. Also added `preventDefault()` to `mouseup` and `touchend` handlers for defensive programming

## Changes Made
File: `/home/dbowman/.openclaw/workspace/cal-dashboard/public/app.js`

Lines 599-627:
- Added `e.preventDefault()` to mouseup handler (line 604)
- Added new click handler with preventDefault and stopPropagation (lines 614-617)
- Added `e.preventDefault()` to touchend handler (line 625)

## Testing
To verify the fix works:
1. Open the dashboard
2. Click and hold the 🎤 voice button
3. Speak briefly (5-10 seconds)
4. Release the button
5. Check browser console - should see exactly ONE "MEDIA RECORDER ONSTOP" message with 74K+ bytes
6. Previously would see a second onstop with 4K bytes (bad recording)

## Commit
```
0e4b19f Fix double-recording bug: prevent click event from firing after mouseup
```
