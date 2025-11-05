# AI Voice Presentation Application

An interactive AI-powered voice application that presents slides and responds to user questions in real-time. Users can ask questions about the current slide or navigate through slides using voice commands.

## Architecture

### Frontend
- HTML5 + Vanilla JavaScript
- MediaRecorder API for audio capture
- Fetch API for backend communication
- Canvas API for slide image capture

### Backend
- FastAPI (Python web framework)
- OpenAI API integration
- Streaming response architecture

### Data Flow
```
User Voice Input
    ↓
MediaRecorder (WebM audio)
    ↓
Backend: OpenAI STT (gpt-4o-transcribe)
    ↓
Backend: OpenAI Vision + LLM (gpt-4.1-mini) with structured output
    ↓
Backend: OpenAI TTS (gpt-4o-mini-tts) → StreamingResponse
    ↓
Frontend: Audio playback
```

## Setup Instructions

### Prerequisites
- Python 3.8 or higher
- OpenAI API key
- Modern web browser (Chrome, Firefox, Safari, or Edge)

### 1. Clone the Repository
```bash
git clone <repository-url>
cd synthio_assignment
```

### 2. Create Virtual Environment
```bash
# On macOS/Linux
python3 -m venv venv
source venv/bin/activate

# On Windows
python -m venv venv
venv\Scripts\activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Create a `.env` file in the project root:
```bash
OPENAI_API_KEY=your_openai_api_key_here
```

Or export directly:
```bash
export OPENAI_API_KEY="your_openai_api_key_here"
```

### 5. Run the Application
```bash
python main.py
```

The server will start on `http://localhost:8000`

### 6. Access the Application
Open your web browser and navigate to:
```
http://localhost:8000
```

## Usage

### Voice Interaction
1. **Hold** the "Hold to Record" button
2. **Speak** your question or command
3. **Release** the button when done
4. The AI will process your input and respond with voice

### Navigation Commands
- "Next slide" or "Show me the next slide"
- "Previous slide" or "Go back"
- "Go to slide 3" (or any slide number)
- "First slide"
- "Last slide"

### Question Examples
- "What is this planet?"
- "Tell me about the composition"
- "What are the key features?"

## Backend Architecture

### Technology Stack
- **FastAPI**: High-performance async web framework
- **OpenAI API**: STT, Vision, LLM, and TTS models
- **Pydantic**: Data validation and structured outputs

### OpenAI Models Used

#### 1. Speech-to-Text (STT)
- **Model**: `gpt-4o-transcribe`
- **Purpose**: Convert user's voice input to text
- **Input**: Audio file (WebM format)
- **Output**: Transcribed text

#### 2. Vision + Language Model
- **Model**: `gpt-4.1-mini`
- **Purpose**: Analyze slide image and generate contextual responses
- **Input**: 
  - Text question (from STT)
  - Base64-encoded slide image
  - Current slide context
- **Output**: Structured JSON response

#### 3. Text-to-Speech (TTS)
- **Model**: `gpt-4o-mini-tts`
- **Voice**: Alloy (configurable)
- **Purpose**: Convert AI response to natural speech
- **Output**: Streaming audio (MP3)

### Structured Output Implementation

The application uses OpenAI's structured output feature with Pydantic models to ensure reliable, type-safe responses:

```python
class ChatResponse(BaseModel):
    response: str           # AI's text response
    goto_slide: Optional[int] = None  # Slide to navigate to (or None)
```

**How it works:**
1. Define Pydantic model with expected response structure
2. Pass model to OpenAI's `responses.parse()` with `text_format` parameter
3. OpenAI guarantees response matches the schema
4. Get parsed, validated data directly

**Benefits:**
- No JSON parsing errors
- Type safety
- Automatic validation
- Guaranteed field presence

**Example:**
```python
api_response = client.responses.parse(
    model="gpt-4.1-mini",
    input=[...],
    text_format=ChatResponse  # Enforces structure
)

parsed_output = api_response.output_parsed
response_text = parsed_output.response      # Always a string
goto_slide = parsed_output.goto_slide       # Always int or None
```

### Streaming Response for TTS

To minimize latency and provide the best user experience, the TTS endpoint uses FastAPI's `StreamingResponse`:

```python
@app.post("/api/text-to-speech")
async def text_to_speech(text: str = Form(...), voice: str = Form(default="alloy")):
    response = client.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice=voice,
        input=text
    )
    
    def generate():
        for chunk in response.iter_bytes(chunk_size=1024):
            yield chunk
    
    return StreamingResponse(generate(), media_type="audio/mpeg")
```

**How it reduces latency:**
1. **No Buffering**: Audio chunks sent to frontend as soon as generated
2. **Progressive Playback**: Browser starts playing audio immediately upon receiving first chunks
3. **Parallel Processing**: Frontend begins playback while backend continues generating
4. **Perceived Speed**: User hears response starting ~1-2 seconds earlier than with buffered approach

**Performance Impact:**
- Traditional approach: Wait for complete audio (5-10 seconds) → Play
- Streaming approach: Start playing after first chunk (~500ms) → Continue streaming
- **Result**: 4-9 seconds faster perceived response time

## API Endpoints

### POST `/api/process-audio`
Complete voice interaction pipeline
- **Input**: Audio file, slide number, slide image
- **Process**: STT → AI Analysis → Response generation
- **Output**: JSON with transcription, AI response, and navigation instruction

### POST `/api/text-to-speech`
Generate speech from text
- **Input**: Text string, voice selection (optional)
- **Output**: Streaming audio (MP3)

### GET `/`
Serve the frontend application

### GET `/app.js`
Serve JavaScript file

### GET `/style.css`
Serve CSS file

### GET `/slides/{slide_name}`
Serve slide images

## Project Structure

```
synthio_assignment/
├── main.py                 # FastAPI backend server
├── index.html              # Frontend HTML
├── app.js                  # Frontend JavaScript
├── style.css               # Frontend styling
├── requirements.txt        # Python dependencies
├── .env                    # Environment variables (not in repo)
├── .gitignore             # Git ignore rules
├── slides/                 # Slide images
│   ├── slide1.png
│   ├── slide2.png
│   ├── slide3.png
│   ├── slide4.png
│   └── slide5.png
└── README.md              # This file
```

## Scope for Improvement

### 1. OpenAI Realtime API Integration

**Current Limitation:**
The application uses a sequential pipeline (STT → LLM → TTS) which introduces latency at each step. OpenAI's Realtime API could dramatically reduce this latency by providing a unified, streaming interface.

**Why Not Implemented:**
The OpenAI Realtime API (as of now) has two critical limitations for this use case:

1. **No Image Input Support**: The Realtime API doesn't support vision/image analysis, which is essential for understanding slide content
2. **No Structured Output**: Cannot enforce structured JSON responses (like our `goto_slide` field), making reliable slide navigation impossible

**Potential Workaround (Not Ideal):**
Generate text summaries of all slides upfront and provide them in the context instead of images:
```python
context = """
Slide 1: Overview of Solar System...
Slide 2: Inner planets Mercury, Venus...
Slide 3: Earth details...
"""
```

**Why This Isn't Optimal:**
- Hardcodes application to specific slides
- Loses visual information (diagrams, charts, images)
- Requires manual slide summarization
- No flexibility for different presentations
- Summary quality depends on pre-processing

**Ideal Future State:**
When Realtime API supports both images and structured outputs, latency could be reduced by 50-70% through true streaming conversation.

### 2. Chat History / Conversation Context

**Current State:**
Each interaction is stateless - the AI only sees the current slide and current question.

**Enhancement:**
Implement conversation history to:
- Remember previous questions in the session
- Provide contextually aware answers
- Handle follow-up questions ("Tell me more about that")
- Reference earlier parts of the conversation

**Implementation Options:**
- SQLite database for persistence
- Redis for session-based memory
- In-memory cache for simplicity

**Trade-offs:**
- **Benefit**: More natural, contextual conversations
- **Cost**: Increased latency (more context to process)
- **Complexity**: Session management, storage, and cleanup

### 3. Full Slide Deck Context

**Current Limitation:**
The LLM only sees the current slide image when generating responses.

**Enhancement:**
Provide context of the entire slide deck:
- Pass all slide images in a single request
- Include slide titles/metadata
- Allow cross-slide references

**Benefits:**
- Better understanding of presentation flow
- Can answer questions like "What was mentioned earlier about Mars?"
- Smarter navigation suggestions
- Holistic understanding of content

**Challenges:**
- **Token Limits**: Multiple images consume significant context
- **Cost**: Each image in prompt increases API costs
- **Latency**: More data to process = slower responses
- **Complexity**: Need to balance context vs. performance

**Possible Solution:**
Hybrid approach:
1. Current slide: Full resolution image
2. Other slides: Thumbnails or text summaries
3. Metadata: Slide titles, topics, keywords