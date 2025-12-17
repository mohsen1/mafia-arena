// Placeholder API route - speech synthesis temporarily disabled
import { NextRequest, NextResponse } from 'next/server';

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Speech synthesis feature temporarily disabled' },
    { status: 501 }
  );
}
