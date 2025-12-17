#!/bin/bash

echo "🔐 Google Authentication Setup for Werewolf AI"
echo "============================================="
echo ""

# Check if .env.local exists
if [ -f .env.local ]; then
    echo "✅ Found .env.local file"
else
    echo "📝 Creating .env.local file..."
    cp env.example .env.local
    echo "✅ Created .env.local from env.example"
fi

echo ""
echo "📋 Next steps:"
echo "1. Add your Google OAuth credentials to .env.local:"
echo ""
echo "   GOOGLE_CLIENT_ID=\"your-google-client-id\""
echo "   GOOGLE_CLIENT_SECRET=\"your-google-client-secret\""
echo ""
echo "2. Ensure NEXTAUTH_SECRET is set (generate one if needed):"
echo "   You can generate a secret by running:"
echo "   openssl rand -base64 32"
echo ""
echo "3. Make sure NEXTAUTH_URL is set correctly:"
echo "   - Local: http://localhost:3099"
echo "   - Production: https://your-app.vercel.app"
echo ""
echo "📌 Important: Never commit .env.local to git!" 