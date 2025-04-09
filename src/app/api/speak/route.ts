import { NextResponse } from "next/server";
// import { Ratelimit } from "@upstash/ratelimit"; // Removed
// import { kv } from "@vercel/kv"; // Removed
import type { NextRequest } from "next/server";

console.log("ELEVENLABS_API_KEY loaded:", !!process.env.ELEVENLABS_API_KEY);

// const elevenlabs = new ElevenLabsClient({ // Bypassing SDK
//   apiKey: process.env.ELEVENLABS_API_KEY,
// });

// const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Removed unused variable
// const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"; // Removed unused variable

// Define an interface for the expected request body
interface SpeakRequestBody {
  text: string;
  voiceId: string;
  stability?: number;
  similarity?: number;
}

export async function POST(req: NextRequest) {
  console.log("*** /api/speak POST request received ***");

  // --- Removed Rate Limiting Logic --- 
  // const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  // const { success, pending, limit, /* reset, */ remaining } =
  //   await ratelimit.limit(`ratelimit_speak_${ip}`);
  // await pending;
  // console.log(`Rate Limit Status for ${ip}: ${remaining}/${limit} remaining.`);
  // if (!success) {
  //   console.warn(`Rate limit exceeded for IP: ${ip}`);
  //   return NextResponse.json(
  //     { error: "Rate limit exceeded. Please try again later." },
  //     { status: 429 },
  //   );
  // }
  // --- End Removed Rate Limiting Logic ---

  let body: SpeakRequestBody;
  try {
    // Parse the request body
    body = await req.json();
    console.log("Request Body:", body); // Log the received body

    // Validate input
    const validation = validateInput(body);
    if (!validation.success) {
      console.error("Input validation failed:", validation.error);
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Add explicit check for data to satisfy TypeScript
    if (!validation.data) {
      console.error("Validation succeeded but data is missing.");
      return NextResponse.json({ error: "Internal validation error" }, { status: 500 });
    }

    const { text, voiceId, stability, similarity } = validation.data;

    // --- Check for API Key before making the call ---
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error("Missing ELEVENLABS_API_KEY environment variable.");
      return NextResponse.json(
        { error: "TTS service is not configured." },
        { status: 503 }, // Service Unavailable
      );
    }
    // --- End API Key Check ---

    // Fetch from ElevenLabs API
    console.log(
      `Fetching TTS from ElevenLabs: voiceId=${voiceId}, stability=${stability}, similarity=${similarity}`,
    );
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey, // Use the validated key
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2", // Or your desired model
          voice_settings: {
            stability: stability,
            similarity_boost: similarity,
          },
        }),
      },
    );

    console.log(`ElevenLabs API Response Status: ${response.status}`);

    // Check if the request was successful
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `ElevenLabs API Error (${response.status}): ${errorText.slice(0, 500)}...`,
      ); // Log truncated error
      return NextResponse.json(
        { error: `ElevenLabs API error: ${response.statusText}` }, // Provide a user-friendly error
        { status: response.status },
      );
    }

    // Get the readable stream from the response body
    const audioStream = response.body;

    if (!audioStream) {
      console.error("No audio stream received from ElevenLabs API.");
      return NextResponse.json(
        { error: "No audio stream received" },
        { status: 500 },
      );
    }

    console.log("Successfully received audio stream. Streaming response...");
    // Return the stream directly
    return new Response(audioStream, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (error) {
    // Catch potential fetch errors or errors during response processing
    console.error("!!! Error in /api/speak handler:", error);
    let errorMessage = "An unknown error occurred";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    // Removed unused variable 'e' and cleaned up comments
    return NextResponse.json(
      { error: errorMessage || "Failed to process speech request" },
      { status: 500 },
    );
  }
}

// Helper function to validate input
function validateInput(body: unknown): {
  success: boolean;
  data?: SpeakRequestBody;
  error?: string;
} {
  // Type check for body
  if (typeof body !== "object" || body === null) {
    return { success: false, error: "Request body must be an object." };
  }

  // Assert body as a potential candidate for SpeakRequestBody
  const potentialBody = body as Partial<SpeakRequestBody>;

  if (
    typeof potentialBody.text !== "string" ||
    potentialBody.text.trim() === ""
  ) {
    return { success: false, error: "Invalid input: text is required." };
  }
  if (
    typeof potentialBody.voiceId !== "string" ||
    potentialBody.voiceId.trim() === ""
  ) {
    return { success: false, error: "Invalid input: voiceId is required." };
  }

  const stability =
    typeof potentialBody.stability === "number" ? potentialBody.stability : 0.5; // Default stability
  const similarity =
    typeof potentialBody.similarity === "number"
      ? potentialBody.similarity
      : 0.75; // Default similarity

  // Clamp values to valid ranges (example)
  const clampedStability = Math.max(0, Math.min(1, stability));
  const clampedSimilarity = Math.max(0, Math.min(1, similarity));

  return {
    success: true,
    data: {
      text: potentialBody.text,
      voiceId: potentialBody.voiceId,
      stability: clampedStability,
      similarity: clampedSimilarity,
    },
  };
}
