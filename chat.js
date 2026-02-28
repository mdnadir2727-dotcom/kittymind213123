/**
 * KittyMind Core Logic
 * Handles AI communication, TTS audio, and SVG Lip-sync animations
 */

const apiKey = "AIzaSyDkc2G5VHTNHRqmPLvpXiiXuNfwKnhkk1Q"; 
const KITTY_VOICE = "Kore";
const SYSTEM_PROMPT = `You are KittyMind, a genius-level interactive kitten companion. 
Personality: Super friendly, uses occasionally cute "baby-talk" (e.g., "paws-itive", "meow-velous", "oopsie"), but is grammatically perfect and highly intelligent.
Capabilities: 
- Complex Math: Explain step-by-step using LaTeX $...$.
- Cooking: Provide recipes in clear Markdown cards (Ingredients, Instructions).
- Animal Facts: Share amazing biological insights.
Format: Use Markdown (bold, lists) and LaTeX for all math. Keep responses concise but warm.`;

let isMuted = false;
let isTyping = false;
let isTalking = false;

const colors = {
    happy: "#FFB7C5",
    thinking: "#B7E4FF",
    explaining: "#DFF7F2",
    idle: "#FFF6E9"
};

const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const sendIcon = document.getElementById('sendIcon');
const loadingIcon = document.getElementById('loadingIcon');
const chatHistory = document.getElementById('chatHistory');
const kittyMouth = document.getElementById('kittyMouth');
const kittyGlow = document.getElementById('kittyGlow');
const elementsToColor = ['kittyTail', 'kittyBody', 'kittySkull'];

/**
 * Updates the Kitty's visual state based on mood
 */
function setMood(mood) {
    const color = colors[mood] || colors.idle;
    elementsToColor.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.setAttribute('fill', color);
            if (id === 'kittyTail') el.setAttribute('stroke', color);
        }
    });
    kittyGlow.style.backgroundColor = color;
    
    const eyes = document.getElementById('kittyEyes');
    if (mood === 'thinking') {
        eyes.style.transform = 'scaleY(0.2)';
    } else if (mood === 'explaining') {
        eyes.style.transform = 'scale(1.2)';
    } else {
        eyes.style.transform = 'scale(1)';
    }
}

/**
 * Audio Context helper for TTS Lip-Sync
 */
async function playTTS(text) {
    if (isMuted) return;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Say cheerfully: ${text.substring(0, 300)}` }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: KITTY_VOICE } } }
                }
            })
        });
        
        if (!response.ok) throw new Error("TTS API Error");
        
        const data = await response.json();
        const base64Audio = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return;

        const bytes = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
        const wavBlob = pcmToWav(bytes, 24000);
        const audio = new Audio(URL.createObjectURL(wavBlob));

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(audio);
        const analyser = audioCtx.createAnalyser();
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        analyser.fftSize = 64;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        isTalking = true;
        audio.play();

        function updateMouth() {
            if (audio.paused || audio.ended) {
                isTalking = false;
                kittyMouth.setAttribute('ry', 3);
                return;
            }
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const mouthOpening = 3 + (avg / 255) * 20;
            kittyMouth.setAttribute('ry', mouthOpening);
            requestAnimationFrame(updateMouth);
        }
        updateMouth();
    } catch (err) { console.error("TTS Error:", err); }
}

/**
 * Standard PCM-to-WAV conversion for Gemini TTS responses
 */
function pcmToWav(pcmData, sampleRate) {
    const buffer = new ArrayBuffer(44 + pcmData.length);
    const view = new DataView(buffer);
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, pcmData.length, true);
    for (let i = 0; i < pcmData.length; i += 2) {
        view.setInt16(44 + i, new Int16Array(pcmData.buffer.slice(pcmData.byteOffset + i, pcmData.byteOffset + i + 2))[0], true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Main Message Handling Logic
 */
async function handleSend() {
    const text = chatInput.value.trim();
    if (!text || isTyping) return;

    addMessage('user', text);
    chatInput.value = '';
    isTyping = true;
    sendIcon.classList.add('hidden');
    loadingIcon.classList.remove('hidden');
    setMood('thinking');

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: text }] }],
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message || "API Error");
        }

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Oopsie! I got confused.";
        
        addMessage('assistant', reply);
        setMood('explaining');
        playTTS(reply);
        setTimeout(() => setMood('idle'), 5000);
    } catch (err) {
        console.error("Fetch Error:", err);
        addMessage('assistant', "Oopsie! My brain took a tiny nap. (Check if your API key is correct or enabled!)");
        setMood('idle');
    } finally {
        isTyping = false;
        sendIcon.classList.remove('hidden');
        loadingIcon.classList.add('hidden');
    }
}

/**
 * UI helper to add messages to the floating overlay
 */
function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `chat-bubble p-4 rounded-3xl text-sm shadow-xl glass ${role === 'user' ? 'bg-rose-400 text-white ml-auto rounded-br-none' : 'text-slate-700 mr-auto rounded-bl-none'}`;
    div.innerText = content;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

/**
 * Helper for Suggestion Chips
 */
window.useChip = function(text) {
    chatInput.value = text;
    handleSend();
};

// Event Listeners
sendBtn.addEventListener('click', handleSend);
chatInput.addEventListener('keydown', e => e.key === 'Enter' && handleSend());
document.getElementById('muteBtn').addEventListener('click', () => {
    isMuted = !isMuted;
    const icon = document.getElementById('volIcon');
    icon.style.stroke = isMuted ? '#f43f5e' : '#475569';
});

// Initialization
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => setMood('idle'), 500);
});