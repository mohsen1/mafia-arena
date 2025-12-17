/**
 * Deprecated: NextAuth endpoint removed
 * This route now returns 410 Gone and points clients to Melody endpoints.
 * Phase: Cleanup - NextAuth fully removed in favor of Melody
 */

import { NextRequest, NextResponse } from 'next/server';

function jsonGone(message: string) {
  return NextResponse.json(
    {
      error: 'Gone',
      message,
      replacement: {
        provider: 'melody',
        endpoints: {
          session: '/api/auth/melody/session',
          signin: '/api/auth/melody',
          callback: '/api/auth/melody/callback',
          test: '/api/auth/melody/test',
        },
        docs: 'See docs/phase4-4-authentication-testing-report.md',
      },
    },
    { status: 410 }
  );
}

export async function GET(_request: NextRequest) {
  return jsonGone('NextAuth has been removed. Use Melody endpoints.');
}

export async function POST(_request: NextRequest) {
  return jsonGone('NextAuth has been removed. Use Melody endpoints.');
}

export async function PUT(_request: NextRequest) {
  return jsonGone('NextAuth has been removed. Use Melody endpoints.');
}

export async function DELETE(_request: NextRequest) {
  return jsonGone('NextAuth has been removed. Use Melody endpoints.');
}

export async function OPTIONS() {
  // Provide discovery to help clients migrate automatically
  return NextResponse.json(
    {
      status: 'gone',
      provider: 'nextauth',
      replacement: {
        provider: 'melody',
        endpoints: {
          session: '/api/auth/melody/session',
          signin: '/api/auth/melody',
          callback: '/api/auth/melody/callback',
          test: '/api/auth/melody/test',
        },
      },
    },
    { status: 410 }
  );
}
