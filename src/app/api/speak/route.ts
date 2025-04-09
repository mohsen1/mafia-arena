import { NextRequest, NextResponse } from "next/server";
// import { ElevenLabsClient } from 'elevenlabs'; // Bypassing SDK for direct fetch
// import { Readable } from 'stream'; // Not needed for direct fetch response streaming

console.log("ELEVENLABS_API_KEY loaded:", !!process.env.ELEVENLABS_API_KEY);

// const elevenlabs = new ElevenLabsClient({ // Bypassing SDK
//   apiKey: process.env.ELEVENLABS_API_KEY,
// });

const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Rachel
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export async function POST(request: NextRequest) {
  try {
    // Check if timestamps are requested
    const {
      text,
      voice_id = DEFAULT_VOICE_ID,
      model_id = "eleven_multilingual_v2",
      with_timestamps = false,
    } = await request.json();
    console.log(
      `API Request - Text: "${text.substring(0, 50)}...", Voice: ${voice_id}, Model: ${model_id}, Timestamps: ${with_timestamps}`,
    );

    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!text) {
      console.error("Error: Text is required");
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }
    if (!apiKey) {
      console.error("Error: ElevenLabs API key not configured on server");
      return NextResponse.json(
        { error: "ElevenLabs API key not configured" },
        { status: 500 },
      );
    }

    // Determine the correct endpoint URL based on the with_timestamps flag
    const endpointPath = with_timestamps
      ? `/text-to-speech/${voice_id}/with-timestamps`
      : `/text-to-speech/${voice_id}/stream`;
    const url = `${ELEVENLABS_API_BASE}${endpointPath}`;

    console.log(`Calling ElevenLabs API: POST ${url}`);

    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    headers.append("xi-api-key", apiKey);
    // Accept different content types based on the endpoint
    headers.append(
      "Accept",
      with_timestamps ? "application/json" : "audio/mpeg",
    );

    const body = JSON.stringify({
      text: text,
      model_id: model_id,
      // voice_settings can be added here if needed
    });

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: body,
    });

    console.log(`ElevenLabs API response status: ${response.status}`);

    if (!response.ok) {
      let errorText = `ElevenLabs API Error: ${response.status} ${response.statusText}`;
      try {
        // Try to parse error JSON from ElevenLabs, common for non-200 responses
        const errorData = await response.json();
        errorText =
          errorData.detail?.message ||
          JSON.stringify(errorData.detail) ||
          errorText;
      } catch (e) {
        // If error response is not JSON, read as text
        try {
          errorText = await response.text();
        } catch (readError) {
          console.error("Failed to read error response body", readError);
        }
      }
      console.error("!!! ElevenLabs API Error:", errorText);
      return NextResponse.json(
        { error: errorText },
        { status: response.status },
      );
    }

    // --- Handle Response based on endpoint ---

    if (with_timestamps) {
      // For the timestamp endpoint, return the full JSON response
      console.log(
        "Received JSON with audio_base64 and alignment from ElevenLabs.",
      );
      const data = await response.json();
      return NextResponse.json(data); // Forward the JSON data to the client
    } else {
      // For the streaming endpoint, return the audio stream directly
      if (!response.body) {
        console.error(
          "Error: Response body from ElevenLabs streaming API is null",
        );
        return NextResponse.json(
          { error: "Received empty response body from upstream API" },
          { status: 500 },
        );
      }
      console.log(
        "Received stream from ElevenLabs API. Returning NextResponse...",
      );
      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": response.headers.get("content-type") || "audio/mpeg",
        },
      });
    }
  } catch (error: any) {
    // Catch potential fetch errors or errors during response processing
    console.error("!!! Error in /api/speak handler:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process speech request" },
      { status: 500 },
    );
  }
}
