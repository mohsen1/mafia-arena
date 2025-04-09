import { ElevenLabsClient } from "elevenlabs";
import { promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";

const apiKey = process.env.ELEVENLABS_API_KEY;
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

if (!apiKey) {
  console.warn(
    "Missing ELEVENLABS_API_KEY environment variable. TTS features will be disabled.",
  );
}

const elevenlabs = apiKey ? new ElevenLabsClient({ apiKey }) : null;

/**
 * Converts a Readable stream into a Buffer.
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Fetches the list of available voices from ElevenLabs.
 * @returns A promise resolving to an array of available voices.
 */
export async function getElevenLabsVoices() {
  if (!elevenlabs) {
    console.warn("ElevenLabs client not initialized. Cannot fetch voices.");
    return [];
  }
  try {
    console.log("Fetching ElevenLabs voices...");
    const response = await elevenlabs.voices.getAll();
    console.log(`Fetched ${response.voices.length} voices.`);
    return response.voices;
  } catch (error) {
    console.error("Failed to fetch ElevenLabs voices:", error);
    return [];
  }
}

/**
 * Generates audio for the given text using the specified voice ID,
 * saves it to a public file, and returns the public URL.
 *
 * @param {string} text The text to synthesize.
 * @param {string} voiceId The ElevenLabs voice ID to use.
 * @param {string} gameId Used for organizing audio files.
 * @param {string} messageId Used as the audio filename.
 * @returns {Promise<string | null>} A promise resolving to the public URL of the audio file, or null on failure.
 */
export async function generateAndSaveAudio(
  text: string,
  voiceId: string,
  gameId: string,
  messageId: string,
): Promise<string | null> {
  if (!elevenlabs) {
    console.warn("ElevenLabs client not initialized. Cannot generate audio.");
    return null;
  }

  try {
    console.log(
      `Generating audio for message ${messageId} using voice ${voiceId}...`,
    );
    const audioStream = await elevenlabs.generate({
      voice: voiceId,
      text,
      model_id: "eleven_multilingual_v2",
    });

    const gameAudioDir = path.join(AUDIO_DIR, gameId);
    const filePath = path.join(gameAudioDir, `${messageId}.mp3`);
    const publicUrl = `/audio/${gameId}/${messageId}.mp3`;

    await fs.mkdir(gameAudioDir, { recursive: true });

    // Convert stream to buffer before writing
    const audioBuffer = await streamToBuffer(audioStream as Readable);
    await fs.writeFile(filePath, audioBuffer);

    console.log(`Audio saved to ${filePath}`);
    return publicUrl;
  } catch (error) {
    console.error(
      `Failed to generate or save audio for message ${messageId}:`,
      error,
    );
    return null;
  }
}
