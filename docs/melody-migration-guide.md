# Melody Auth Migration Guide

## Database Migration from NextAuth to Melody

This guide covers migrating from NextAuth v5 to Melody Auth while preserving user data and sessions.

### Phase 1: Schema Migration (PostgreSQL → D1)

#### Current NextAuth Schema (PostgreSQL/Drizzle)
The existing `users` table schema in `src/lib/db/schema.ts`:

```typescript
export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  image: varchar('image', { length: 255 }),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  password: varchar('password', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});
```

#### Target Melody Schema (D1/SQLite)
The new `src/worker/db/schema.sql` provides compatible tables:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  email_verified DATETIME,
  password TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Phase 2: Data Migration Strategy

#### 1. Backup Current Data
```bash
# Export existing users data
pg_dump werewolf_ai_dev --table=users --data-only > users_backup.sql
pg_dump werewolf_ai_dev --table=oauth_accounts --data-only > oauth_backup.sql
pg_dump werewolf_ai_dev --table=sessions --data-only > sessions_backup.sql
```

#### 2. Cloudflare D1 Database Setup
```bash
# Create D1 database
wrangler d1 create werewolf-auth-db

# Apply schema
wrangler d1 execute werewolf-auth-db --file=src/worker/db/schema.sql

# Import data (convert PostgreSQL to SQLite format)
```

#### 3. Data Conversion Scripts
A Python script to convert PostgreSQL data to D1 format:

```python
# scripts/migrate-postgres-to-d1.py
import psycopg2
import sqlite3
import json
from datetime import datetime

def convert_timestamp(pg_timestamp):
    """Convert PostgreSQL timestamp to ISO format for D1"""
    if pg_timestamp:
        return pg_timestamp.replace('+00', '')
    return None

def migrate_users():
    # Connect to PostgreSQL
    pg_conn = psycopg2.connect("postgresql://...")
    pg_cursor = pg_conn.cursor()
    
    # Connect to D1 (SQLite)
    d1_conn = sqlite3.connect('werewolf-auth-db.sqlite3')
    d1_cursor = d1_conn.cursor()
    
    # Export users
    pg_cursor.execute("SELECT id, email, name, image, email_verified, password, created_at, updated_at FROM users")
    users = pg_cursor.fetchall()
    
    for user in users:
        d1_cursor.execute("""
            INSERT OR REPLACE INTO users (id, email, name, image, email_verified, password, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, user)
    
    d1_conn.commit()
    pg_conn.close()
    d1_conn.close()
    print(f"Migrated {len(users)} users")

if __name__ == "__main__":
    migrate_users()
```

### Phase 3: Session Management Migration

#### JWT Strategy Migration
NextAuth uses JWT sessions, so the migration should be straightforward:

1. **NextAuth JWT Token Structure:**
```typescript
// Current NextAuth JWT structure
{
  id: string,
  email: string,
  name: string,
  image: string,
  iat: number,
  exp: number
}
```

2. **Melody JWT Token Structure:**
```typescript
// Melody JWT structure (similar but with additional claims)
{
  sub: string, // user id
  email: string,
  name: string,
  picture: string, // image URL
  iat: number,
  exp: number,
  aud: string, // client id
  iss: string, // issuer
}
```

#### Migration Script for Sessions
```typescript
// scripts/migrate-sessions.ts
import { sign, verify } from 'jsonwebtoken';

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET!;
const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET!;

// Helper to migrate existing NextAuth tokens
function migrateJwtToken(nextAuthToken: string): string {
  try {
    // Verify with NextAuth secret
    const decoded = verify(nextAuthToken, NEXTAUTH_SECRET) as any;
    
    // Convert to Melody format
    const melodyPayload = {
      sub: decoded.id,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.image,
      iat: decoded.iat,
      exp: decoded.exp,
      aud: 'werewolf-ai-client',
      iss: process.env.AUTH_SERVER_URL,
    };
    
    // Sign with Melody secret
    return sign(melodyPayload, AUTH_JWT_SECRET);
  } catch (error) {
    console.error('Failed to migrate JWT token:', error);
    return null;
  }
}
```

### Phase 4: OAuth Provider Migration

#### Google OAuth
Update redirect URIs in Google Cloud Console:
- Remove: `https://your-domain.com/api/auth/callback/google`
- Add: `https://werewolf-auth.yourdomain.workers.dev/auth/callback/google`

#### GitHub OAuth
Update redirect URIs in GitHub Developer Settings:
- Remove: `https://your-domain.com/api/auth/callback/github`
- Add: `https://werewolf-auth.yourdomain.workers.dev/auth/callback/github`

### Phase 5: Deployment Verification

#### 1. Test Data Migration
```bash
# Verify users were migrated
wrangler d1 execute werewolf-auth-db --command="SELECT COUNT(*) FROM users"

# Verify OAuth accounts
wrangler d1 execute werewolf-auth-db --command="SELECT * FROM oauth_accounts WHERE provider = 'google'"
```

#### 2. Test Authentication Flow
- Deploy Melody Worker
- Test Google OAuth flow
- Test GitHub OAuth flow  
- Test credentials login
- Verify JWT token generation

#### 3. Migration Scripts
Create automated migration scripts:

```bash
#!/bin/bash
# scripts/melody-migrate.sh

echo "🚀 Starting Melody Auth migration..."

# 1. Backup existing data
echo "📦 Backing up existing data..."
./backup-database.sh

# 2. Create D1 database
echo "🗄️ Creating D1 database..."
wrangler d1 create werewolf-auth-db

# 3. Apply schema
echo "🏗️ Applying database schema..."
wrangler d1 execute werewolf-auth-db --file=src/worker/db/schema.sql

# 4. Run migration
echo "🔄 Migrating data..."
tsx scripts/migrate-postgres-to-d1.ts

# 5. Deploy Worker
echo "🚀 Deploying Melody Worker..."
wrangler publish --config melody-worker.toml

# 6. Test
echo "✅ Testing migration..."
curl https://werewolf-auth.yourdomain.workers.dev/health

echo "🎉 Migration complete!"
```

### Rollback Strategy

If issues occur during migration:

```bash
# Rollback to NextAuth
./rollback-to-nextauth.sh

# Restore database
./restore-database.sh

# Keep OAuth redirects pointing to NextAuth
```

### Environment Variables During Migration

During the migration process, maintain both sets of variables:

```bash
# NextAuth (old system - keep active)
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="your-secret"

# Melody (new system - test separately)
AUTH_SERVER_URL="https://werewolf-auth.yourdomain.workers.dev"
AUTH_JWT_SECRET="your-new-jwt-secret"

# OAuth providers - point to both systems
GOOGLE_CLIENT_ID="your-google-id"
GITHUB_CLIENT_ID="your-github-id"
```

### Success Criteria

✅ **Migration Complete When:**
- All users successfully migrated
- OAuth flows working with new redirect URIs
- JWT tokens working with new secret
- Session management functioning
- No authentication errors in logs
- Performance within target metrics (< 100ms session load time)

### Post-Migration Cleanup

After successful migration:

1. **Update OAuth redirect URIs** (remove old ones)
2. **Update environment variables** (remove NEXTAUTH_*)
3. **Remove NextAuth dependencies** from package.json
4. **Update documentation** (remove NextAuth references)
5. **Monitor performance** and user feedback

### Troubleshooting

#### Common Issues:

**Issue: OAuth redirect failures**
- Verify new redirect URIs in provider dashboards
- Check CORS settings in Worker

**Issue: JWT token invalidation**
- Ensure proper secret rotation
- Test token migration script

**Issue: Database connection errors**
- Verify D1 bindings in Worker
- Check database schema compatibility

**Issue: Performance degradation**
- Monitor Worker performance
- Optimize database queries
- Implement caching strategies