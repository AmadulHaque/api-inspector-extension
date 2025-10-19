# 🔍 API Call Tracker Pro

A powerful Chrome Extension for tracking, analyzing, and debugging API calls with developer-friendly tools.

## ✨ Features

### Core Tracking
- **Automatic Detection** - Captures all Fetch and XHR API calls on any page
- **Per-Tab Dashboard** - Isolated tracking for each browser tab
- **Real-time Updates** - Live updates every 2 seconds
- **Request/Response Details** - Full inspection of headers, body, status, and timing

### Developer Tools
- **🔍 Advanced Filtering** - Filter by HTTP method, status code, or search text
- **📊 Performance Stats** - Total calls, avg latency, success/error rates, data transfer
- **📋 Quick Copy** - Copy as cURL, request JSON, or response JSON with one click
- **💾 Export** - Export all captured calls as JSON
- **🔒 Header Redaction** - Automatically redact sensitive headers (tokens, API keys)
- **🎭 Mock Responses** - Define mock rules to return static responses for testing

### UI/UX
- **Dark Theme** - Easy on the eyes during long debugging sessions
- **Detailed Inspection** - Tabbed interface for Request, Response, Headers, and Timing
- **Status Badges** - Color-coded method and status indicators
- **Pretty JSON** - Auto-formatted JSON display

## 📦 Installation

### Method 1: Load Unpacked (Development)

1. **Download the extension files** or clone this repository
2. **Create icons** (or use placeholder icons):
   - Create three PNG files: `icon16.png`, `icon48.png`, `icon128.png`
   - Use any icon generator or simple colored squares for testing
3. **Open Chrome** and navigate to `chrome://extensions/`
4. **Enable Developer Mode** (toggle in top-right corner)
5. **Click "Load unpacked"**
6. **Select the folder** containing the extension files
7. **Pin the extension** to your toolbar for easy access

### Method 2: Create Icons Quickly

Run this in your extension folder to create simple placeholder icons:

```bash
# macOS/Linux
convert -size 16x16 xc:#0e639c icon16.png
convert -size 48x48 xc:#0e639c icon48.png
convert -size 128x128 xc:#0e639c icon128.png

# Or use any online icon generator
```

## 🚀 Usage

### Basic Usage

1. **Click the extension icon** in your toolbar
2. **Navigate to any webpage** that makes API calls
3. **Watch the calls populate** in real-time
4. **Click any call** to see detailed information

### Filtering & Search

- Use the **search box** to find calls by URL, method, or status
- Filter by **HTTP method** (GET, POST, PUT, DELETE, PATCH)
- Filter by **status code** (2xx, 3xx, 4xx, 5xx, or failed)

### Copying Data

Select any API call and use the copy buttons:
- **Copy as cURL** - Generate a curl command to replay the request
- **Copy Request** - Copy the full request as JSON
- **Copy Response** - Copy the full response as JSON

### Export

Click the **Export** button to download all captured API calls as JSON:
```json
[
  {
    "id": "req_123456",
    "method": "GET",
    "url": "https://api.example.com/users",
    "status": 200,
    "latency": 145,
    "timestamp": 1234567890,
    ...
  }
]
```

## ⚙️ Configuration

Click **Settings** to configure:

### Header Redaction
Add header names (case-insensitive) to automatically redact sensitive data:
- `authorization`
- `cookie`
- `x-api-key`
- `api-key`

Values for these headers will show as `[REDACTED]` in the UI.

### Mock Rules
Create mock responses for testing:
1. Click **Add Mock Rule**
2. Enter a **URL pattern** (regex): `.*api.example.com/users.*`
3. Enter the **HTTP method**: `GET`
4. Enter a **JSON response**: `{"message": "Mock response"}`
5. Toggle the rule on/off as needed

When enabled, matching requests will return your mock response instead of making the actual call.

## 📁 File Structure

```
api-tracker/
├── manifest.json       # Extension manifest (MV3)
├── background.js       # Service worker (stores API calls)
├── content.js          # Content script (injects interceptor)
├── popup.html          # Main UI
├── popup.js           # UI logic & rendering
├── options.html       # Settings page
├── options.js         # Settings logic
├── icon16.png         # Toolbar icon (16x16)
├── icon48.png         # Extension page icon (48x48)
└── icon128.png        # Chrome Web Store icon (128x128)
```

## 🔧 Technical Details

### Architecture
- **Manifest V3** - Uses the latest Chrome extension APIs
- **Service Worker** - Background script for persistent storage
- **Content Script** - Injected script to intercept Fetch/XHR
- **Message Passing** - Communication between content and background

### Interception Method
The extension injects code into pages before any scripts run, overriding native `fetch()` and `XMLHttpRequest` methods to capture all API calls non-invasively.

### Storage
- API calls are stored per-tab in the service worker's memory
- Settings are persisted to `chrome.storage.sync`
- Data is automatically cleaned up when tabs close

## 🛠️ Development

### Extending the Extension

**Add HAR Export:**
```javascript
function exportHAR() {
  const har = {
    log: {
      version: "1.2",
      creator: { name: "API Tracker", version: "1.0" },
      entries: allCalls.map(