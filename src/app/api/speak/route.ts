import { NextResponse } from "next/server";
// import { Ratelimit } from "@upstash/ratelimit"; // Removed
// import { kv } from "@vercel/kv"; // Removed
import type { NextRequest } from "next/server";

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
  let body: SpeakRequestBody;
  try {
    body = await req.json();

    const validation = validateInput(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (!validation.data) {
      return NextResponse.json({ error: "Internal validation error" }, { status: 500 });
    }

    const { text, voiceId, stability, similarity } = validation.data;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error("Missing ELEVENLABS_API_KEY environment variable.");
      return NextResponse.json(
        { error: "TTS service is not configured." },
        { status: 503 },
      );
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: stability,
            similarity_boost: similarity,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `ElevenLabs API Error (${response.status}): ${errorText.slice(0, 500)}...`,
      );
      return NextResponse.json(
        { error: `ElevenLabs API error: ${response.statusText}` },
        { status: response.status },
      );
    }

    const audioStream = response.body;

    if (!audioStream) {
      console.error("No audio stream received from ElevenLabs API.");
      return NextResponse.json(
        { error: "No audio stream received" },
        { status: 500 },
      );
    }

    return new Response(audioStream, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (error) {
    console.error("!!! Error in /api/speak handler:", error);
    let errorMessage = "An unknown error occurred";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
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
  if (typeof body !== "object" || body === null) {
    return { success: false, error: "Request body must be an object." };
  }

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
    typeof potentialBody.stability === "number" ? potentialBody.stability : 0.5;
  const similarity =
    typeof potentialBody.similarity === "number"
      ? potentialBody.similarity
      : 0.75;

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
