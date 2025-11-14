# Calendar Voice Bot

Multi-lingual voice-based calendar assistant supporting English and Hindi.

## Features
- 🎤 Voice input using Deepgram STT (Nova-2 model)
- 🗣️ Voice output using Deepgram TTS (Aura model)
- 🌐 Multi-language support (English + Hindi)
- 📅 Calendar management (Add, List, Delete events)
- 🤖 AI-powered intent detection with Claude 3.5 Haiku

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Add your API keys to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
DEEPGRAM_API_KEY=your-deepgram-key-here
PORT=3000
```

4. Start the server:
```bash
npm start
```

5. Open browser at `http://localhost:3000`

## Usage Examples

### English
- "Schedule a meeting with Sarah tomorrow at 3 PM"
- "What do I have on Friday?"
- "Cancel my afternoon meeting"

### Hindi
- "कल शाम 5 बजे मीटिंग रखो" (Schedule meeting tomorrow 5 PM)
- "आज मेरी क्या मीटिंग है?" (What meetings today?)
- "मेरी सुबह की मीटिंग कैंसल करो" (Cancel morning meeting)

## Tech Stack
- **Backend**: Node.js + Express
- **AI**: Claude 3.5 Haiku (Anthropic) + Deepgram (STT/TTS)
- **Frontend**: Vanilla HTML/CSS/JS
- **Storage**: JSON file

## API Endpoints
- `POST /api/voice` - Process voice input
- `GET /api/events` - Get all events
- `POST /api/text` - Text-only testing endpoint
