import { NextResponse } from "next/server";
import { ElevenLabsClient } from 'elevenlabs'; // Import the client
import { Readable } from 'stream'; // Import the Readable stream module

// You would normally get this from environment variables
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Default voice ID if not specified
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Default ElevenLabs voice

// Initialize the client (only if API key exists)
const elevenLabsClient = ELEVENLABS_API_KEY ? new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY }) : null;

export async function POST(req: Request) {
  let requestBodyText: string | null = null;
  try {
    // Read the raw body text first for logging
    requestBodyText = await req.text();
    console.log("Received request body text:", requestBodyText); // Log raw text

    if (!requestBodyText) {
         console.error("Received empty request body.");
         return NextResponse.json({ error: "Empty request body received" }, { status: 400 });
    }

    // Now try to parse the text
    let parsedBody;
    try {
         parsedBody = JSON.parse(requestBodyText);
    } catch (parseError) {
         console.error("Failed to parse request body JSON:", parseError);
         console.error("Raw body was:", requestBodyText); // Log again on error
         return NextResponse.json({ error: "Invalid JSON format in request body" }, { status: 400 });
    }
    
    const { text, voice = DEFAULT_VOICE_ID, speakerName } = parsedBody;

    if (!text) {
      return NextResponse.json({ error: "Text is required in JSON body" }, { status: 400 });
    }

    if (!elevenLabsClient) {
      return NextResponse.json({ error: "ElevenLabs API key is not configured" }, { status: 500 });
    }

    // Make streaming request to ElevenLabs API using the SDK
    const audioStream = await elevenLabsClient.textToSpeech.convertAsStream(voice, {
      text, // Use text from parsedBody
      model_id: "eleven_monolingual_v1", // or use your preferred model
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      },
      // optimize_streaming_latency: 1, // Consider latency optimization levels (0-4)
    });

    // Type assertion to treat the AsyncIterable as a ReadableStream (Node.js stream)
    // This is necessary because Next.js NextResponse expects a standard ReadableStream
    const nodeReadableStream = new Readable({
        async read() {
            try {
                for await (const chunk of audioStream) {
                    if (!this.push(chunk)) {
                        // If push returns false, the internal buffer is full, wait for drain
                        // This part is tricky and might need more robust handling depending on stream behavior
                        break; 
                    }
                }
                this.push(null); // Signal end of stream
            } catch (streamError) {
                 console.error("Error reading from ElevenLabs stream:", streamError);
                 this.destroy(streamError instanceof Error ? streamError : new Error(String(streamError)));
            }
        }
    });

    // Return the stream directly
    return new NextResponse(nodeReadableStream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });

  } catch (error: any) {
    // Catch errors from req.text() or other initial setup errors
    console.error("Outer error in text-to-speech API:", error);
    console.error("Initial request body text (if available):", requestBodyText); // Log text on outer error too
    const status = error.status || 500;
    const message = error.message || "Internal server error";
    return NextResponse.json({ error: message }, { status });
  }
} 