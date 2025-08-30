import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { rateLimit, rateLimitPresets } from '@/lib/security/rateLimit';

// const elevenlabs = new ElevenLabsClient({ // Bypassing SDK
//   apiKey: process.env.ELEVENLABS_API_KEY,
// });

// const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Removed unused variable
// const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"; // Removed unused variable

// Define an interface for the expected request body
interface SpeakRequestBody {
  text: string;
  voice_id?: string; // Support both voice_id and voiceId
  voiceId?: string;
  stability?: number;
  similarity?: number;
  with_timestamps?: boolean;
}

async function handleSpeakRequest(params: {
  text: string;
  voiceId: string;
  stability: number;
  similarity: number;
  with_timestamps: boolean;
}) {
  const { text, voiceId, stability, similarity, with_timestamps } = params;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('Missing ELEVENLABS_API_KEY environment variable.');

    // In development, return a mock audio response for testing
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[/api/speak] 🎭 MOCK MODE: Returning silent audio for testing'
      );

      // Create a 1-second silent audio file as base64
      // This is a tiny valid MP3 file with silence
      const silentMp3Base64 =
        'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAAFAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD////////////////////////////////AAAAATAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvL25j';

      // Convert base64 to buffer
      const audioBuffer = Buffer.from(silentMp3Base64, 'base64');

      return new Response(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache',
          'X-Mock-Audio': 'true',
          'X-Mock-Reason': 'ELEVENLABS_API_KEY not configured',
        },
      });
    }

    return NextResponse.json(
      { error: 'TTS service is not configured.' },
      { status: 503 }
    );
  }

  // If timestamps are requested, use the with-timestamps endpoint
  if (with_timestamps) {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: stability,
            similarity_boost: similarity,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `ElevenLabs API Error (${response.status}): ${errorText.slice(0, 500)}...`
      );
      return NextResponse.json(
        { error: `ElevenLabs API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    // The with-timestamps endpoint returns JSON with audio_base64 and alignment
    const responseData = await response.json();

    // Return the response as-is, it should already have the correct format
    return NextResponse.json(responseData);
  } else {
    // Regular TTS without timestamps
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: stability,
            similarity_boost: similarity,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `ElevenLabs API Error (${response.status}): ${errorText.slice(0, 500)}...`
      );
      return NextResponse.json(
        { error: `ElevenLabs API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const audioStream = response.body;

    if (!audioStream) {
      console.error('No audio stream received from ElevenLabs API.');
      return NextResponse.json(
        { error: 'No audio stream received' },
        { status: 500 }
      );
    }

    // Enable streaming with appropriate headers
    return new Response(audioStream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}

export async function GET(req: NextRequest) {
  // Apply rate limiting for TTS requests
  const rateLimitResult = await rateLimit(rateLimitPresets.ai);
  if (rateLimitResult instanceof Response) {
    return rateLimitResult;
  }

  // Support GET requests for streaming audio
  const searchParams = req.nextUrl.searchParams;
  const text = searchParams.get('text');
  const voiceId = searchParams.get('voiceId');

  if (!text || !voiceId) {
    return NextResponse.json(
      { error: 'Missing required parameters: text and voiceId' },
      { status: 400 }
    );
  }

  return handleSpeakRequest({
    text,
    voiceId,
    stability: 0.5,
    similarity: 0.75,
    with_timestamps: false,
  });
}

export async function POST(req: NextRequest) {
  // Apply rate limiting for TTS requests
  const rateLimitResult = await rateLimit(rateLimitPresets.ai);
  if (rateLimitResult instanceof Response) {
    return rateLimitResult;
  }

  let body: SpeakRequestBody;
  try {
    body = await req.json();

    const validation = validateInput(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (!validation.data) {
      return NextResponse.json(
        { error: 'Internal validation error' },
        { status: 500 }
      );
    }

    const { text, voiceId, stability, similarity, with_timestamps } =
      validation.data;

    return handleSpeakRequest({
      text,
      voiceId,
      stability,
      similarity,
      with_timestamps,
    });
  } catch (error) {
    console.error('!!! Error in /api/speak handler:', error);
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json(
      { error: errorMessage || 'Failed to process speech request' },
      { status: 500 }
    );
  }
}

// Helper function to validate input
function validateInput(body: unknown): {
  success: boolean;
  data?: {
    text: string;
    voiceId: string;
    stability: number;
    similarity: number;
    with_timestamps: boolean;
  };
  error?: string;
} {
  if (typeof body !== 'object' || body === null) {
    return { success: false, error: 'Request body must be an object.' };
  }

  const potentialBody = body as Partial<SpeakRequestBody>;

  if (
    typeof potentialBody.text !== 'string' ||
    potentialBody.text.trim() === ''
  ) {
    return { success: false, error: 'Invalid input: text is required.' };
  }

  // Support both voice_id and voiceId
  const voiceId = potentialBody.voice_id || potentialBody.voiceId;

  if (typeof voiceId !== 'string' || voiceId.trim() === '') {
    return { success: false, error: 'Invalid input: voiceId is required.' };
  }

  const stability =
    typeof potentialBody.stability === 'number' ? potentialBody.stability : 0.5;
  const similarity =
    typeof potentialBody.similarity === 'number'
      ? potentialBody.similarity
      : 0.75;

  const clampedStability = Math.max(0, Math.min(1, stability));
  const clampedSimilarity = Math.max(0, Math.min(1, similarity));

  const with_timestamps = potentialBody.with_timestamps === true;

  return {
    success: true,
    data: {
      text: potentialBody.text,
      voiceId: voiceId,
      stability: clampedStability,
      similarity: clampedSimilarity,
      with_timestamps: with_timestamps,
    },
  };
}
