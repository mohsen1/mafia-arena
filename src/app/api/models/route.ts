import { NextResponse } from "next/server";
// import { getGroqModels } from "@/lib/groq/api"; // Removed import
import { getOpenAIModels } from "@/lib/openai/api";

/**
 * API route handler to fetch available Groq models securely on the server.
 */
export async function GET() {
  try {
    // Ensure GROQ_API_KEY is set in your environment variables on the server
    if (!process.env.GROQ_API_KEY) {
      console.error("Missing GROQ_API_KEY environment variable.");
      // Return a more generic error to the client for security
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const models = await getGroqModels();
    return NextResponse.json({ models });

  } catch (error) {
    console.error("Error fetching Groq models:", error);
    // Return a generic error message
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}

// Optional: Add configuration for edge runtime if preferred and compatible
// export const runtime = 'edge'; 