#!/usr/bin/env python3
"""
PostgreSQL to D1 (SQLite) Migration Script for Melody Auth
Migrates user data from NextAuth PostgreSQL to Melody D1 database
"""

import os
import sys
import sqlite3
import psycopg2
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

# Database connection strings
POSTGRES_URL = os.getenv('DATABASE_URL', 'postgresql://werewolf_ai:dev_password_2024@localhost:5432/werewolf_ai_dev')
D1_DB_PATH = os.getenv('D1_DB_PATH', 'werewolf-auth-db.sqlite3')

class MelodyDataMigrator:
    def __init__(self):
        self.pg_conn = None
        self.d1_conn = None
        self.migrated_users = 0
        self.migrated_oauth_accounts = 0
        self.migrated_sessions = 0
        self.errors = []

    def connect_databases(self):
        """Establish connections to both databases"""
        try:
            # Connect to PostgreSQL
            print("🔗 Connecting to PostgreSQL...")
            self.pg_conn = psycopg2.connect(POSTGRES_URL)
            self.pg_conn.autocommit = False
            print("✅ PostgreSQL connected")

            # Connect to D1 (SQLite)
            print("🔗 Connecting to D1 (SQLite)...")
            self.d1_conn = sqlite3.connect(D1_DB_PATH)
            self.d1_conn.row_factory = sqlite3.Row
            print("✅ D1 connected")

        except Exception as e:
            self.errors.append(f"Database connection failed: {e}")
            raise

    def convert_timestamp(self, pg_timestamp: Optional[str]) -> Optional[str]:
        """Convert PostgreSQL timestamp to ISO format for D1"""
        if not pg_timestamp:
            return None
        try:
            # PostgreSQL timestamp format: 2023-10-30 15:30:45+00
            dt = datetime.fromisoformat(pg_timestamp.replace('+00', '+00:00'))
            return dt.isoformat()
        except Exception as e:
            print(f"⚠️ Failed to convert timestamp {pg_timestamp}: {e}")
            return None

    def migrate_users(self) -> int:
        """Migrate users table"""
        try:
            print("👥 Migrating users...")
            
            # Get users from PostgreSQL
            with self.pg_conn.cursor() as pg_cursor:
                pg_cursor.execute("""
                    SELECT id, email, name, image, email_verified, password, created_at, updated_at
                    FROM users
                    ORDER BY created_at
                """)
                users = pg_cursor.fetchall()
            
            # Insert into D1
            with self.d1_conn.cursor() as d1_cursor:
                for user in users:
                    try:
                        d1_cursor.execute("""
                            INSERT OR REPLACE INTO users 
                            (id, email, name, image, email_verified, password, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            user[0],  # id
                            user[1],  # email
                            user[2],  # name
                            user[3],  # image
                            self.convert_timestamp(user[4]),  # email_verified
                            user[5],  # password
                            self.convert_timestamp(user[6]),  # created_at
                            self.convert_timestamp(user[7])   # updated_at
                        ))
                        self.migrated_users += 1
                    except sqlite3.Error as e:
                        error_msg = f"Failed to migrate user {user[1]}: {e}"
                        self.errors.append(error_msg)
                        print(f"❌ {error_msg}")

            self.d1_conn.commit()
            print(f"✅ Migrated {self.migrated_users} users")
            return self.migrated_users

        except Exception as e:
            error_msg = f"Users migration failed: {e}"
            self.errors.append(error_msg)
            print(f"❌ {error_msg}")
            return 0

    def migrate_oauth_accounts(self) -> int:
        """Migrate OAuth accounts table"""
        try:
            print("🔐 Migrating OAuth accounts...")
            
            # Check if oauth_accounts table exists in PostgreSQL
            with self.pg_conn.cursor() as pg_cursor:
                pg_cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'accounts'
                    )
                """)
                table_exists = pg_cursor.fetchone()[0]
                
                if not table_exists:
                    print("ℹ️ No OAuth accounts table found (normal if using only credentials)")
                    return 0

            # Get OAuth accounts from PostgreSQL
            with self.pg_conn.cursor() as pg_cursor:
                pg_cursor.execute("""
                    SELECT id, user_id, provider, provider_account_id, access_token, 
                           refresh_token, expires_at, token_type, scope, id_token, session_state, created_at
                    FROM accounts
                    ORDER BY created_at
                """)
                accounts = pg_cursor.fetchall()

            # Insert into D1
            with self.d1_conn.cursor() as d1_cursor:
                for account in accounts:
                    try:
                        d1_cursor.execute("""
                            INSERT OR REPLACE INTO oauth_accounts 
                            (id, user_id, provider, provider_account_id, access_token, refresh_token,
                             expires_at, token_type, scope, id_token, session_state, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, account)
                        self.migrated_oauth_accounts += 1
                    except sqlite3.Error as e:
                        error_msg = f"Failed to migrate OAuth account {account[2]}: {e}"
                        self.errors.append(error_msg)
                        print(f"❌ {error_msg}")

            self.d1_conn.commit()
            print(f"✅ Migrated {self.migrated_oauth_accounts} OAuth accounts")
            return self.migrated_oauth_accounts

        except Exception as e:
            error_msg = f"OAuth accounts migration failed: {e}"
            self.errors.append(error_msg)
            print(f"❌ {error_msg}")
            return 0

    def migrate_sessions(self) -> int:
        """Migrate sessions table"""
        try:
            print("🎫 Migrating sessions...")
            
            # Check if sessions table exists in PostgreSQL
            with self.pg_conn.cursor() as pg_cursor:
                pg_cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'sessions'
                    )
                """)
                table_exists = pg_cursor.fetchone()[0]
                
                if not table_exists:
                    print("ℹ️ No sessions table found (JWT strategy doesn't use sessions)")
                    return 0

            # Get sessions from PostgreSQL
            with self.pg_conn.cursor() as pg_cursor:
                pg_cursor.execute("""
                    SELECT session_token, user_id, expires, created_at
                    FROM sessions
                    WHERE expires > NOW()
                    ORDER BY created_at
                """)
                sessions = pg_cursor.fetchall()

            # Insert into D1
            with self.d1_conn.cursor() as d1_cursor:
                for session in sessions:
                    try:
                        d1_cursor.execute("""
                            INSERT OR REPLACE INTO sessions 
                            (session_token, user_id, expires, created_at)
                            VALUES (?, ?, ?, ?)
                        """, (
                            session[0],  # session_token
                            session[1],  # user_id
                            self.convert_timestamp(session[2]),  # expires
                            self.convert_timestamp(session[3])   # created_at
                        ))
                        self.migrated_sessions += 1
                    except sqlite3.Error as e:
                        error_msg = f"Failed to migrate session: {e}"
                        self.errors.append(error_msg)
                        print(f"❌ {error_msg}")

            self.d1_conn.commit()
            print(f"✅ Migrated {self.migrated_sessions} sessions")
            return self.migrated_sessions

        except Exception as e:
            error_msg = f"Sessions migration failed: {e}"
            self.errors.append(error_msg)
            print(f"❌ {error_msg}")
            return 0

    def validate_migration(self) -> Dict[str, Any]:
        """Validate the migration results"""
        validation = {
            'success': True,
            'checks': [],
            'warnings': []
        }

        try:
            with self.d1_conn.cursor() as d1_cursor:
                # Check user count
                d1_cursor.execute("SELECT COUNT(*) FROM users")
                user_count = d1_cursor.fetchone()[0]
                validation['checks'].append(f"Users migrated: {user_count}")

                # Check for duplicate emails
                d1_cursor.execute("""
                    SELECT email, COUNT(*) as count 
                    FROM users 
                    GROUP BY email 
                    HAVING COUNT(*) > 1
                """)
                duplicates = d1_cursor.fetchall()
                if duplicates:
                    validation['warnings'].append(f"Duplicate emails found: {len(duplicates)}")
                    for dup in duplicates:
                        validation['warnings'].append(f"  - {dup[0]}: {dup[1]} times")

                # Check OAuth accounts
                d1_cursor.execute("SELECT COUNT(*) FROM oauth_accounts")
                oauth_count = d1_cursor.fetchone()[0]
                validation['checks'].append(f"OAuth accounts migrated: {oauth_count}")

                # Check sessions
                d1_cursor.execute("SELECT COUNT(*) FROM sessions")
                session_count = d1_cursor.fetchone()[0]
                validation['checks'].append(f"Sessions migrated: {session_count}")

        except Exception as e:
            validation['success'] = False
            validation['error'] = f"Validation failed: {e}"

        return validation

    def generate_report(self) -> str:
        """Generate migration report"""
        report = [
            "📊 Melody Auth Migration Report",
            "=" * 50,
            f"Users migrated: {self.migrated_users}",
            f"OAuth accounts migrated: {self.migrated_oauth_accounts}",
            f"Sessions migrated: {self.migrated_sessions}",
            f"Total records migrated: {self.migrated_users + self.migrated_oauth_accounts + self.migrated_sessions}",
        ]

        if self.errors:
            report.append("\n❌ Errors encountered:")
            for error in self.errors:
                report.append(f"  - {error}")
        else:
            report.append("\n✅ No errors encountered")

        return "\n".join(report)

    def close_connections(self):
        """Close database connections"""
        if self.pg_conn:
            self.pg_conn.close()
        if self.d1_conn:
            self.d1_conn.close()

    def run_migration(self) -> bool:
        """Run the complete migration process"""
        try:
            print("🚀 Starting Melody Auth data migration...")
            print(f"📍 PostgreSQL: {POSTGRES_URL}")
            print(f"📍 D1 Database: {D1_DB_PATH}")

            # Connect to databases
            self.connect_databases()

            # Run migrations
            users_migrated = self.migrate_users()
            oauth_migrated = self.migrate_oauth_accounts()
            sessions_migrated = self.migrate_sessions()

            # Validate
            validation = self.validate_migration()
            
            # Print report
            print("\n" + self.generate_report())

            if validation['warnings']:
                print("\n⚠️ Warnings:")
                for warning in validation['warnings']:
                    print(f"  - {warning}")

            if not validation['success']:
                print(f"\n❌ Migration validation failed: {validation.get('error', 'Unknown error')}")
                return False

            print("\n🎉 Migration completed successfully!")
            return True

        except Exception as e:
            error_msg = f"Migration failed: {e}"
            print(f"❌ {error_msg}")
            self.errors.append(error_msg)
            return False

        finally:
            self.close_connections()

def main():
    """Main migration function"""
    # Check required environment variables
    if not POSTGRES_URL:
        print("❌ DATABASE_URL environment variable not set")
        sys.exit(1)

    # Check if D1 database exists
    if not os.path.exists(D1_DB_PATH):
        print(f"❌ D1 database not found at {D1_DB_PATH}")
        print("💡 Run 'wrangler d1 execute werewolf-auth-db --file=src/worker/db/schema.sql' first")
        sys.exit(1)

    # Run migration
    migrator = MelodyDataMigrator()
    success = migrator.run_migration()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()