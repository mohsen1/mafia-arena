import { NextResponse } from "next/server";

// Define the ElevenLabs API endpoint
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// You would normally get this from environment variables
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Default voice ID if not specified
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Default ElevenLabs voice

export async function POST(req: Request) {
  try {
    // Get request body
    const { text, voice = DEFAULT_VOICE_ID, speakerName } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: "ElevenLabs API key is not configured" },
        { status: 500 }
      );
    }


    // Make request to ElevenLabs API
    const response = await fetch(`${ELEVENLABS_API_URL}/${voice}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.log("ElevenLabs error", errorData);
      return NextResponse.json(
        { error: "Error from ElevenLabs API", details: errorData },
        { status: response.status }
      );
    }

    // Get audio data
    const audioBuffer = await response.arrayBuffer();

    // Return audio data as response
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (error) {
    console.error("Error in text-to-speech API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 