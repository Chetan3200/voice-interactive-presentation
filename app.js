// Slide navigation functionality
let currentSlide = 1;
const totalSlides = 5;

// Get DOM elements
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const currentSlideDisplay = document.getElementById('current-slide');
const totalSlidesDisplay = document.getElementById('total-slides');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateSlideDisplay();
    updateButtonStates();
});

// Previous button click handler
prevBtn.addEventListener('click', () => {
    if (currentSlide > 1) {
        currentSlide--;
        updateSlideDisplay();
        updateButtonStates();
    }
});

// Next button click handler
nextBtn.addEventListener('click', () => {
    if (currentSlide < totalSlides) {
        currentSlide++;
        updateSlideDisplay();
        updateButtonStates();
    }
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && currentSlide > 1) {
        currentSlide--;
        updateSlideDisplay();
        updateButtonStates();
    } else if (e.key === 'ArrowRight' && currentSlide < totalSlides) {
        currentSlide++;
        updateSlideDisplay();
        updateButtonStates();
    }
});

// Update slide display
function updateSlideDisplay() {
    // Hide all slides
    const slides = document.querySelectorAll('.slide');
    slides.forEach(slide => {
        slide.classList.remove('active');
    });

    // Show current slide
    const activeSlide = document.getElementById(`slide-${currentSlide}`);
    if (activeSlide) {
        activeSlide.classList.add('active');
    }

    // Update counter
    currentSlideDisplay.textContent = currentSlide;
    totalSlidesDisplay.textContent = totalSlides;
}

// Update button states (disable at boundaries)
function updateButtonStates() {
    prevBtn.disabled = currentSlide === 1;
    nextBtn.disabled = currentSlide === totalSlides;
}

// Function to programmatically change slides
function goToSlide(slideNumber) {
    if (slideNumber >= 1 && slideNumber <= totalSlides) {
        currentSlide = slideNumber;
        updateSlideDisplay();
        updateButtonStates();
    }
}

// Export for potential backend integration
window.slideController = {
    goToSlide,
    getCurrentSlide: () => currentSlide,
    getTotalSlides: () => totalSlides,
    getCurrentSlideAsImage: getCurrentSlideAsImage
};

// Audio recording functionality
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioStream = null;

// Get audio control elements
const recordBtn = document.getElementById('record-btn');
const recordText = document.getElementById('record-text');
const recordingIndicator = document.getElementById('recording-indicator');
const audioStatus = document.getElementById('audio-status');
const audioPlayback = document.getElementById('audio-playback');

// Initialize audio recording on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeAudioRecording();
});

// Initialize audio recording capabilities
async function initializeAudioRecording() {
    try {
        // Check if MediaRecorder is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showAudioStatus('Audio recording not supported in this browser', 'error');
            recordBtn.disabled = true;
            return;
        }

        // Request microphone permission
        audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            } 
        });
        
        showAudioStatus('Microphone ready', 'success');
        
        // Setup event listeners for recording
        setupRecordingListeners();
        
    } catch (error) {
        console.error('Error accessing microphone:', error);
        showAudioStatus('Microphone access denied', 'error');
        recordBtn.disabled = true;
    }
}

// Setup recording button listeners
function setupRecordingListeners() {
    // Mouse events
    recordBtn.addEventListener('mousedown', startRecording);
    recordBtn.addEventListener('mouseup', stopRecording);
    recordBtn.addEventListener('mouseleave', () => {
        if (isRecording) stopRecording();
    });

    // Touch events for mobile
    recordBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRecording();
    });
    recordBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopRecording();
    });
}

// Start recording audio
async function startRecording() {
    if (isRecording) return;
    
    try {
        audioChunks = [];
        
        // Stop and clear any existing audio playback
        audioPlayback.pause();
        audioPlayback.src = '';
        audioPlayback.load();
        
        // Create MediaRecorder instance
        mediaRecorder = new MediaRecorder(audioStream, {
            mimeType: 'audio/webm;codecs=opus'
        });
        
        // Collect audio data
        mediaRecorder.addEventListener('dataavailable', (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        });
        
        // Handle recording stop
        mediaRecorder.addEventListener('stop', handleRecordingStop);
        
        // Start recording
        mediaRecorder.start();
        isRecording = true;
        
        // Update UI
        recordBtn.classList.add('recording');
        recordText.textContent = 'Recording...';
        recordingIndicator.style.display = 'flex';
        showAudioStatus('🎤 Recording in progress...', 'recording');
        
    } catch (error) {
        console.error('Error starting recording:', error);
        showAudioStatus('Failed to start recording', 'error');
    }
}

// Stop recording audio
function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    
    mediaRecorder.stop();
    isRecording = false;
    
    // Update UI
    recordBtn.classList.remove('recording');
    recordText.textContent = 'Hold to Record';
    recordingIndicator.style.display = 'none';
    showAudioStatus('Processing audio...', 'info');
}

// Handle recording stop and process audio
async function handleRecordingStop() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    
    // Get current slide info
    const currentSlideInfo = {
        slideNumber: currentSlide,
        totalSlides: totalSlides,
        slideImage: null // Will be populated by getCurrentSlideAsImage() when needed
    };
    
    console.log('Recorded audio ready for backend processing');
    console.log('Current slide info:', currentSlideInfo);
    console.log('Audio blob size:', audioBlob.size, 'bytes');
    
    // Send to backend for processing (no playback of input audio)
    await sendAudioToBackend(audioBlob, currentSlideInfo);
}

// Play TTS audio from text using streaming API
async function playTTSAudio(text, voice = 'alloy') {
    try {
        showAudioStatus('🔊 Generating speech...', 'info');
        
        // CRITICAL: Stop and clear any existing audio first
        audioPlayback.pause();
        audioPlayback.currentTime = 0;
        if (audioPlayback.src) {
            URL.revokeObjectURL(audioPlayback.src);
        }
        audioPlayback.src = '';
        audioPlayback.load();
        
        const formData = new FormData();
        formData.append('text', text);
        formData.append('voice', voice);
        
        const response = await fetch('http://localhost:8000/api/text-to-speech', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Get audio blob from streaming response
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Play the audio
        audioPlayback.src = audioUrl;
        await audioPlayback.play();
        showAudioStatus('▶️ Playing AI response', 'success');
        
        audioPlayback.addEventListener('ended', () => {
            showAudioStatus('Ready to record', 'success');
            URL.revokeObjectURL(audioUrl); // Clean up
        }, { once: true });
        
    } catch (error) {
        console.error('Error playing TTS audio:', error);
        showAudioStatus('Failed to play audio', 'error');
    }
}

// Show audio status message
function showAudioStatus(message, type = 'info') {
    audioStatus.textContent = message;
    audioStatus.className = `audio-status ${type}`;
    
    // Auto-hide success messages after 3 seconds
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            if (audioStatus.textContent === message) {
                audioStatus.textContent = '';
            }
        }, 3000);
    }
}

// Get current slide as image
async function getCurrentSlideAsImage() {
    const activeSlide = document.getElementById(`slide-${currentSlide}`);
    if (!activeSlide) return null;
    
    try {
        // Create a canvas and draw the current slide
        const canvas = document.createElement('canvas');
        const slideImage = activeSlide.querySelector('.slide-image');
        
        if (!slideImage) return null;
        
        canvas.width = slideImage.naturalWidth || slideImage.width;
        canvas.height = slideImage.naturalHeight || slideImage.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(slideImage, 0, 0);
        
        // Convert to blob
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    } catch (error) {
        console.error('Error capturing slide image:', error);
        return null;
    }
}

// Send audio and slide data to backend for complete processing
async function sendAudioToBackend(audioBlob, slideInfo) {
    try {
        showAudioStatus('📤 Sending audio to backend...', 'info');
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('slide_number', slideInfo.slideNumber);
        formData.append('total_slides', slideInfo.totalSlides);
        
        // Get slide image
        const slideImage = await getCurrentSlideAsImage();
        if (slideImage) {
            formData.append('slide_image', slideImage, 'current_slide.png');
        }
        
        // Send to backend
        const response = await fetch('http://localhost:8000/api/process-audio', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log('Transcribed:', data.transcribed_text);
            console.log('AI Response:', data.ai_response);
            
            showAudioStatus('✅ Processing complete', 'success');
            
            // Change slide if needed
            if (data.goto_slide && data.goto_slide !== currentSlide) {
                setTimeout(() => {
                    goToSlide(data.goto_slide);
                }, 500);
            }
            
            // Play AI response audio using TTS
            if (data.tts_text) {
                await playTTSAudio(data.tts_text);
            }
        } else {
            throw new Error(data.error || 'Unknown error');
        }
        
    } catch (error) {
        console.error('Error sending to backend:', error);
        showAudioStatus('Failed to process audio: ' + error.message, 'error');
    }
}

// Clean up resources on page unload
window.addEventListener('beforeunload', () => {
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
    }
});