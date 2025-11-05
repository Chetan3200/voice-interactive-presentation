from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, StreamingResponse
import uvicorn
import os
import base64
import tempfile
from typing import Optional
from openai import OpenAI
from pydantic import BaseModel
from dotenv import load_dotenv
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

app = FastAPI()

# Pydantic model for structured response from OpenAI
class ChatResponse(BaseModel):
    """Structured response from OpenAI"""
    response: str
    goto_slide: Optional[int] = None

# Enabled CORS so frontend can connect to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Process audio endpoint
@app.post("/api/process-audio")
async def process_audio(
    audio: UploadFile = File(...),
    slide_number: int = Form(...),
    total_slides: int = Form(...),
    slide_image: UploadFile = File(None)
):
    """
    Complete pipeline: audio -> transcription -> AI processing -> TTS
    
    This endpoint receives:
    - audio: The recorded audio file from the user
    - slide_number: Current slide number
    - total_slides: Total number of slides
    - slide_image: Optional image of the current slide
    """
    
    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        
        # Step 1: Transcribe audio to text (STT)
        audio_data = await audio.read()
        print(f"Received audio: {len(audio_data)} bytes")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
            temp_audio.write(audio_data)
            temp_audio_path = temp_audio.name
        
        with open(temp_audio_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="gpt-4o-transcribe",
                file=audio_file,
                prompt="Transcribe the audio to english text only"
            )
        
        os.unlink(temp_audio_path)
        transcribed_text = transcript.text
        print(f"Transcribed: {transcribed_text}")
        
        # Step 2: Build content for OpenAI
        content = [{"type": "input_text", "text": transcribed_text}]
        
        # Add slide image if provided
        if slide_image:
            image_bytes = await slide_image.read()
            base64_image = base64.b64encode(image_bytes).decode('utf-8')
            content.append({
                "type": "input_image",
                "image_url": f"data:image/png;base64,{base64_image}"
            })
        
        # System prompt
        system_prompt = f"""You are presenting a slide deck. The user is currently on slide {slide_number} out of {total_slides} total slides.

Your task:
1. Answer the user's question based ONLY on the content of the current slide shown in the image
2. Keep your response brief, clear, and conversational
3. ONLY set goto_slide if the user EXPLICITLY asks to navigate to a different slide
4. If the user is just asking a question about the content, set goto_slide to null and answer based on the current slide
5. If the user asks about something not on the current slide, inform them it doesn't contain that information, but do NOT automatically change the slide unless they explicitly request it

Navigation rules:
- "Go to slide X" or "Show slide X" → Set goto_slide = X (where X is 1-{total_slides})
- "Next slide" or "Show me the next slide" → Set goto_slide = {min(slide_number + 1, total_slides)}
- "Previous slide" or "Go back" → Set goto_slide = {max(slide_number - 1, 1)}
- "First slide" → Set goto_slide = 1
- "Last slide" → Set goto_slide = {total_slides}

Examples:
- "What is this?" → Answer from current slide, goto_slide = null
- "Tell me about Jupiter" → If not on current slide, say "This information is not on the current slide", goto_slide = null
- "Go to slide 3" → Set goto_slide = 3
- "Next slide" → Set goto_slide = {min(slide_number + 1, total_slides)}
- "Previous slide" → Set goto_slide = {max(slide_number - 1, 1)}"""
        
        # Step 3: Get AI response with structured output
        api_response = client.responses.parse(
            model="gpt-4.1-mini",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content}
            ],
            text_format=ChatResponse
        )
        
        parsed_output = api_response.output_parsed
        response_text = parsed_output.response
        goto_slide = parsed_output.goto_slide
        
        # Step 4: Generate TTS audio URL
        # Frontend will call /api/text-to-speech separately for streaming
        
        return JSONResponse({
            "success": True,
            "transcribed_text": transcribed_text,
            "ai_response": response_text,
            "goto_slide": goto_slide,
            "current_slide": slide_number,
            "tts_text": response_text  # Frontend can use this to call TTS endpoint
        })
        
    except Exception as e:
        print(f"Error in process_audio endpoint: {e}")
        return JSONResponse({
            "success": False,
            "error": str(e),
            "transcribed_text": "",
            "ai_response": "Sorry, there was an error processing your audio.",
            "goto_slide": None,
            "current_slide": slide_number
        })


@app.post("/api/text-to-speech")
async def text_to_speech(text: str = Form(...), voice: str = Form(default="alloy")):
    """
    Convert text to speech audio using OpenAI TTS with streaming response
    """
    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        
        # Generate speech with streaming
        response = client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice=voice,  # Options: alloy, echo, fable, onyx, nova, shimmer
            input=text
        )
        
        # Return streaming response
        def generate():
            for chunk in response.iter_bytes(chunk_size=1024):
                yield chunk
        
        return StreamingResponse(
            generate(),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=speech.mp3"
            }
        )
        
    except Exception as e:
        print(f"Error in TTS endpoint: {e}")
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )


@app.get("/", response_class=HTMLResponse)
async def root():
    """
    Serve the main HTML page
    """
    try:
        with open("index.html", "r") as f:
            return f.read()
    except:
        return {
            "message": "FastAPI Backend Running",
            "endpoints": {
                "process_audio": "/api/process-audio",
                "transcribe": "/api/transcribe",
                "chat": "/api/chat",
                "tts": "/api/text-to-speech"
            }
        }

@app.get("/app.js")
async def get_js():
    """Serve JavaScript file"""
    return FileResponse("app.js", media_type="application/javascript")

@app.get("/style.css")
async def get_css():
    """Serve CSS file"""
    return FileResponse("style.css", media_type="text/css")

@app.get("/slides/{slide_name}")
async def get_slide(slide_name: str):
    """Serve slide images"""
    return FileResponse(f"slides/{slide_name}", media_type="image/png")


if __name__ == "__main__":
    print("FastAPI Backend Starting...")
    print("Open in browser: http://localhost:8000")    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )