// DOM Elements
const micButton = document.getElementById('micButton');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const transcriptionText = document.getElementById('transcriptionText');
const responseBox = document.getElementById('responseBox');
const responseText = document.getElementById('responseText');
const eventsList = document.getElementById('eventsList');
const textInput = document.getElementById('textInput');
const sendTextButton = document.getElementById('sendTextButton');

// State
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// API Base URL
const API_URL = window.location.origin;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadEvents();
    setupEventListeners();
    initializeVoices();
});

// Initialize Web Speech API voices
function initializeVoices() {
    if ('speechSynthesis' in window) {
        // Load voices
        speechSynthesis.getVoices();
        
        // Voices are loaded asynchronously, so we need to listen for the event
        speechSynthesis.onvoiceschanged = () => {
            const voices = speechSynthesis.getVoices();
            const hindiVoices = voices.filter(voice => 
                voice.lang.startsWith('hi')
            );
            
            console.log('Available voices:', voices.length);
            console.log('Hindi voices available:', hindiVoices.length);
            
            if (hindiVoices.length > 0) {
                console.log('Hindi voices:', hindiVoices.map(v => `${v.name} (${v.lang})`));
            } else {
                console.warn('⚠️ No Hindi voices found. Hindi TTS may not work properly.');
                console.log('Tip: Install Hindi language pack in your OS for better Hindi voice support.');
            }
        };
    } else {
        console.warn('⚠️ Web Speech API not supported in this browser');
    }
}

// Setup Event Listeners
function setupEventListeners() {
    micButton.addEventListener('click', handleMicClick);
    sendTextButton.addEventListener('click', handleTextSubmit);
    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleTextSubmit();
        }
    });
}

// Handle Microphone Click
async function handleMicClick() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

// Start Recording
async function startRecording() {
    try {
        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm'
        });
        
        audioChunks = [];
        
        // Collect audio data
        mediaRecorder.addEventListener('dataavailable', (event) => {
            audioChunks.push(event.data);
        });
        
        // Handle recording stop
        mediaRecorder.addEventListener('stop', async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await processVoiceInput(audioBlob);
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        });
        
        // Start recording
        mediaRecorder.start();
        isRecording = true;
        
        // Update UI
        micButton.classList.add('recording');
        statusText.textContent = '🔴 Recording... (click to stop)';
        transcriptionBox.classList.add('hidden');
        responseBox.classList.add('hidden');
        
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Could not access microphone. Please grant permission and try again.');
    }
}

// Stop Recording
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Update UI
        micButton.classList.remove('recording');
        micButton.classList.add('processing');
        statusText.textContent = '⏳ Processing...';
    }
}

// Process Voice Input
async function processVoiceInput(audioBlob) {
    try {
        // Create FormData
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        
        // Send to backend
        const response = await fetch(`${API_URL}/api/voice`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Display results
        displayResults(data);
        
    } catch (error) {
        console.error('Error processing voice:', error);
        alert('Failed to process voice input. Please try again.');
    } finally {
        // Reset UI
        micButton.classList.remove('processing');
        statusText.textContent = 'Click to speak';
    }
}

// Handle Text Submit
async function handleTextSubmit() {
    const text = textInput.value.trim();
    
    if (!text) {
        return;
    }
    
    // Update UI
    statusText.textContent = '⏳ Processing...';
    sendTextButton.disabled = true;
    transcriptionBox.classList.add('hidden');
    responseBox.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_URL}/api/text`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Display results
        displayResults(data);
        
        // Clear input
        textInput.value = '';
        
    } catch (error) {
        console.error('Error processing text:', error);
        alert('Failed to process text input. Please try again.');
    } finally {
        statusText.textContent = 'Click to speak';
        sendTextButton.disabled = false;
    }
}

// Display Results
function displayResults(data) {
    // Show transcription
    transcriptionText.textContent = data.transcription;
    transcriptionBox.classList.remove('hidden');
    
    // Show response
    responseText.textContent = data.response;
    responseBox.classList.remove('hidden');
    
    // Play audio response
    // Use Web Speech API for Hindi, Deepgram audio for English
    if (data.intent && data.intent.language === 'hi') {
        console.log('Using Web Speech API for Hindi');
        speakWithWebAPI(data.response, 'hi-IN');
    } else if (data.audio) {
        console.log('Using Deepgram TTS for English');
        playAudio(data.audio);
    }
    
    // Update events list
    if (data.events) {
        displayEvents(data.events);
    }
    
    console.log('Intent:', data.intent);
}

// Play Audio (Deepgram TTS)
function playAudio(base64Audio) {
    try {
        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
        audio.play().catch(error => {
            console.error('Error playing audio:', error);
        });
    } catch (error) {
        console.error('Error creating audio:', error);
    }
}

// Speak using Web Speech API (for Hindi)
function speakWithWebAPI(text, language) {
    try {
        // Check if browser supports Web Speech API
        if (!('speechSynthesis' in window)) {
            console.warn('Web Speech API not supported, falling back to text only');
            return;
        }
        
        // Cancel any ongoing speech
        speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language;
        utterance.rate = 0.9; // Slightly slower for clarity
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        // Try to find a Hindi voice
        const voices = speechSynthesis.getVoices();
        const hindiVoice = voices.find(voice => 
            voice.lang.startsWith('hi') || voice.lang.startsWith('hi-IN')
        );
        
        if (hindiVoice) {
            utterance.voice = hindiVoice;
            console.log('Using Hindi voice:', hindiVoice.name);
        } else {
            console.log('No Hindi voice found, using default');
        }
        
        utterance.onstart = () => {
            console.log('Speech started');
        };
        
        utterance.onend = () => {
            console.log('Speech ended');
        };
        
        utterance.onerror = (event) => {
            console.error('Speech error:', event.error);
        };
        
        speechSynthesis.speak(utterance);
        
    } catch (error) {
        console.error('Error with Web Speech API:', error);
    }
}

// Load Events
async function loadEvents() {
    try {
        const response = await fetch(`${API_URL}/api/events`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        displayEvents(data.events);
        
    } catch (error) {
        console.error('Error loading events:', error);
    }
}

// Display Events
function displayEvents(events) {
    if (!events || events.length === 0) {
        eventsList.innerHTML = '<p class="empty-state">No events scheduled yet</p>';
        return;
    }
    
    // Sort events by date and time
    events.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA - dateB;
    });
    
    // Create event cards
    eventsList.innerHTML = events.map(event => createEventCard(event)).join('');
    
    // Add delete button listeners
    document.querySelectorAll('.delete-button').forEach(button => {
        button.addEventListener('click', () => handleDeleteEvent(button.dataset.eventId));
    });
}

// Create Event Card HTML
function createEventCard(event) {
    const date = new Date(`${event.date}T${event.time}`);
    const formattedDate = date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
    const formattedTime = date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
    
    return `
        <div class="event-card">
            <div class="event-info">
                <div class="event-title">${escapeHtml(event.title)}</div>
                <div class="event-datetime">
                    <span class="event-date">📅 ${formattedDate}</span>
                    <span class="event-time">🕐 ${formattedTime}</span>
                </div>
            </div>
            <button class="delete-button" data-event-id="${event.id}">Delete</button>
        </div>
    `;
}

// Handle Delete Event
async function handleDeleteEvent(eventId) {
    if (!confirm('Are you sure you want to delete this event?')) {
        return;
    }
    
    try {
        // Find the event to get its time for deletion
        const response = await fetch(`${API_URL}/api/events`);
        const data = await response.json();
        const event = data.events.find(e => e.id === eventId);
        
        if (!event) {
            throw new Error('Event not found');
        }
        
        // Use the text API to delete by time
        const deleteResponse = await fetch(`${API_URL}/api/text`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                text: `Cancel my ${event.time} meeting` 
            })
        });
        
        if (!deleteResponse.ok) {
            throw new Error(`HTTP error! status: ${deleteResponse.status}`);
        }
        
        const result = await deleteResponse.json();
        
        // Update events list
        displayEvents(result.events);
        
        // Show success message
        responseText.textContent = result.response;
        responseBox.classList.remove('hidden');
        
    } catch (error) {
        console.error('Error deleting event:', error);
        alert('Failed to delete event. Please try again.');
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Check API health on load
fetch(`${API_URL}/api/health`)
    .then(response => response.json())
    .then(data => {
        console.log('API Health:', data);
        if (!data.anthropicConfigured) {
            console.warn('⚠️ Claude API key not configured');
        }
        if (!data.deepgramConfigured) {
            console.warn('⚠️ Deepgram API key not configured');
        }
    })
    .catch(error => {
        console.error('API health check failed:', error);
    });
