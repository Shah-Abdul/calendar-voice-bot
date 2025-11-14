require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@deepgram/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Anthropic Claude
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Initialize Deepgram
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Multer configuration for audio upload
const upload = multer({ storage: multer.memoryStorage() });

// Calendar file path
const CALENDAR_FILE = path.join(__dirname, 'calendar.json');

// Helper: Get current date for context
function getCurrentDate() {
  const now = new Date();
  return {
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().split(' ')[0].substring(0, 5),
    dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
    fullDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  };
}

// Helper: Load calendar events
async function loadEvents() {
  try {
    const data = await fs.readFile(CALENDAR_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty array
    return [];
  }
}

// Helper: Save calendar events
async function saveEvents(events) {
  await fs.writeFile(CALENDAR_FILE, JSON.stringify(events, null, 2));
}

// Helper: Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// System prompt for GPT
function getSystemPrompt() {
  const currentDate = getCurrentDate();
  return `You are a multilingual calendar assistant that supports English and Hindi. Today is ${currentDate.fullDate} (${currentDate.dayOfWeek}).

Your job is to:
1. Detect the user's intent (ADD_EVENT, LIST_EVENTS, or DELETE_EVENT)
2. Extract relevant information (title, date, time)
3. Respond in the SAME language as the user's input
4. Return a JSON response

ACTIONS:
- ADD_EVENT: User wants to schedule/add a meeting or event
- LIST_EVENTS: User wants to see their calendar/events
- DELETE_EVENT: User wants to cancel/remove an event

DATE PARSING:
- "tomorrow" = ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}
- "today" = ${currentDate.date}
- Convert relative dates (next Monday, Friday, etc.) to ISO format (YYYY-MM-DD)
- If no date specified, use today's date

TIME PARSING:
- Convert to 24-hour format (HH:MM)
- "3 PM" = "15:00", "morning" = "09:00", "afternoon" = "14:00", "evening" = "18:00"

LANGUAGE DETECTION:
- Detect if input is English or Hindi
- Respond in the same language

RESPONSE FORMAT (JSON):
{
  "action": "ADD_EVENT" | "LIST_EVENTS" | "DELETE_EVENT",
  "language": "en" | "hi",
  "data": {
    "title": "Meeting title" (for ADD_EVENT),
    "date": "YYYY-MM-DD" (for ADD_EVENT),
    "time": "HH:MM" (for ADD_EVENT),
    "query": "search term" (for DELETE_EVENT - time, title, or date to match)
  },
  "response": "Natural language response in user's language"
}

EXAMPLES:

Input: "Schedule a meeting with John tomorrow at 3 PM"
Output: {
  "action": "ADD_EVENT",
  "language": "en",
  "data": {
    "title": "Meeting with John",
    "date": "${new Date(Date.now() + 86400000).toISOString().split('T')[0]}",
    "time": "15:00"
  },
  "response": "I've scheduled a meeting with John for tomorrow at 3 PM."
}

Input: "What's on my calendar today?"
Output: {
  "action": "LIST_EVENTS",
  "language": "en",
  "data": {},
  "response": "Here are your events for today:"
}

Input: "Cancel my 3 PM meeting"
Output: {
  "action": "DELETE_EVENT",
  "language": "en",
  "data": {
    "query": "15:00"
  },
  "response": "I'll cancel your 3 PM meeting."
}

Input: "कल शाम 5 बजे मीटिंग रखो"
Output: {
  "action": "ADD_EVENT",
  "language": "hi",
  "data": {
    "title": "मीटिंग",
    "date": "${new Date(Date.now() + 86400000).toISOString().split('T')[0]}",
    "time": "17:00"
  },
  "response": "मैंने कल शाम 5 बजे के लिए मीटिंग शेड्यूल कर दी है।"
}

Input: "आज मेरी क्या मीटिंग है?"
Output: {
  "action": "LIST_EVENTS",
  "language": "hi",
  "data": {},
  "response": "आज की आपकी मीटिंग्स:"
}

Always return valid JSON only. No additional text.`;
}

// Process user intent with Claude
async function processIntent(transcription) {
  console.log('Processing intent for:', transcription);
  
  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      temperature: 0.7,
      system: getSystemPrompt(),
      messages: [
        { role: 'user', content: transcription }
      ]
    });

    const responseText = message.content[0].text;
    const result = JSON.parse(responseText);
    console.log('Claude Response:', result);
    return result;
  } catch (error) {
    console.error('Error processing intent:', error);
    throw error;
  }
}

// Execute calendar action
async function executeAction(intent) {
  const events = await loadEvents();
  let updatedEvents = [...events];
  let resultMessage = intent.response;

  switch (intent.action) {
    case 'ADD_EVENT':
      const newEvent = {
        id: generateId(),
        title: intent.data.title,
        date: intent.data.date,
        time: intent.data.time,
        language: intent.language,
        createdAt: new Date().toISOString()
      };
      updatedEvents.push(newEvent);
      await saveEvents(updatedEvents);
      console.log('Event added:', newEvent);
      break;

    case 'LIST_EVENTS':
      // Events will be returned to frontend
      console.log('Listing events:', updatedEvents.length);
      break;

    case 'DELETE_EVENT':
      const query = intent.data.query.toLowerCase();
      const beforeCount = updatedEvents.length;
      
      // Try to match by time, title, or date
      updatedEvents = updatedEvents.filter(event => {
        const matchTime = event.time && event.time.includes(query);
        const matchTitle = event.title && event.title.toLowerCase().includes(query);
        const matchDate = event.date && event.date.includes(query);
        return !(matchTime || matchTitle || matchDate);
      });
      
      const deletedCount = beforeCount - updatedEvents.length;
      await saveEvents(updatedEvents);
      console.log(`Deleted ${deletedCount} event(s)`);
      
      if (deletedCount === 0) {
        resultMessage = intent.language === 'hi' 
          ? 'मुझे वह इवेंट नहीं मिला।' 
          : "I couldn't find that event.";
      }
      break;
  }

  return { events: updatedEvents, message: resultMessage };
}

// Generate speech from text using Deepgram
async function generateSpeech(text, language) {
  console.log('Generating speech for:', text, 'in language:', language);
  
  try {
    // Choose voice based on language
    // Note: Deepgram doesn't have native Hindi TTS, so we'll use English voice for both
    // For production, consider using Google Cloud TTS or Azure TTS for Hindi
    const model = 'aura-asteria-en'; // High-quality English voice
    
    const response = await deepgram.speak.request(
      { text },
      {
        model: model,
        encoding: 'mp3'
      }
    );
    
    console.log('TTS response received');
    
    // Get the audio stream
    const stream = await response.getStream();
    if (!stream) {
      throw new Error('No audio stream returned from Deepgram');
    }

    // Collect chunks into buffer
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    console.log('TTS audio generated, size:', buffer.length, 'bytes');
    return buffer.toString('base64');
  } catch (error) {
    console.error('Error generating speech:', error);
    throw error;
  }
}

// ============ API ENDPOINTS ============

// POST /api/voice - Main voice processing endpoint
app.post('/api/voice', upload.single('audio'), async (req, res) => {
  console.log('\n=== Voice Request Received ===');
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Step 1: Transcribe audio with Deepgram
    console.log('Step 1: Transcribing audio...');
    
    // Try English first
    const { result: enResult, error: enError } = await deepgram.listen.prerecorded.transcribeFile(
      req.file.buffer,
      {
        model: 'nova-2',
        smart_format: true,
        language: 'en',
        punctuate: true
      }
    );

    // Try Hindi
    const { result: hiResult, error: hiError } = await deepgram.listen.prerecorded.transcribeFile(
      req.file.buffer,
      {
        model: 'nova-2',
        smart_format: true,
        language: 'hi',
        punctuate: true
      }
    );

    if (enError && hiError) {
      throw new Error(`Deepgram transcription failed for both languages`);
    }

    // Get transcriptions and confidence scores
    const enText = enResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const hiText = hiResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const enConfidence = enResult?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;
    const hiConfidence = hiResult?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

    // Use the transcription with higher confidence
    const transcribedText = hiConfidence > enConfidence ? hiText : enText;
    const detectedLanguage = hiConfidence > enConfidence ? 'hi' : 'en';
    
    console.log('English transcription:', enText, 'confidence:', enConfidence);
    console.log('Hindi transcription:', hiText, 'confidence:', hiConfidence);
    console.log('Selected:', transcribedText, 'language:', detectedLanguage);

    // Step 2: Process intent with Claude
    console.log('Step 2: Processing intent...');
    const intent = await processIntent(transcribedText);

    // Step 3: Execute action
    console.log('Step 3: Executing action...');
    const actionResult = await executeAction(intent);

    // Step 4: Generate speech response
    console.log('Step 4: Generating speech...');
    const audioBase64 = await generateSpeech(actionResult.message, intent.language);

    // Step 5: Return response
    console.log('Step 5: Sending response\n');
    res.json({
      transcription: transcribedText,
      response: actionResult.message,
      audio: audioBase64,
      events: actionResult.events,
      intent: intent
    });

  } catch (error) {
    console.error('Error in /api/voice:', error);
    res.status(500).json({ 
      error: 'Failed to process voice input',
      details: error.message 
    });
  }
});

// POST /api/text - Text-only testing endpoint
app.post('/api/text', async (req, res) => {
  console.log('\n=== Text Request Received ===');
  
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    console.log('Input text:', text);

    // Process intent
    const intent = await processIntent(text);

    // Execute action
    const actionResult = await executeAction(intent);

    // Generate speech
    const audioBase64 = await generateSpeech(actionResult.message, intent.language);

    res.json({
      transcription: text,
      response: actionResult.message,
      audio: audioBase64,
      events: actionResult.events,
      intent: intent
    });

  } catch (error) {
    console.error('Error in /api/text:', error);
    res.status(500).json({ 
      error: 'Failed to process text input',
      details: error.message 
    });
  }
});

// GET /api/events - Get all events
app.get('/api/events', async (req, res) => {
  try {
    const events = await loadEvents();
    res.json({ events });
  } catch (error) {
    console.error('Error in /api/events:', error);
    res.status(500).json({ 
      error: 'Failed to load events',
      details: error.message 
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
    deepgramConfigured: !!process.env.DEEPGRAM_API_KEY
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Calendar Voice Bot Server Running`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔑 Claude API Key: ${process.env.ANTHROPIC_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🎤 Deepgram API Key: ${process.env.DEEPGRAM_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/voice  - Process voice input`);
  console.log(`  POST /api/text   - Process text input`);
  console.log(`  GET  /api/events - Get all events`);
  console.log(`  GET  /api/health - Health check\n`);
});
