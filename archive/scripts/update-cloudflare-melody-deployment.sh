#!/usr/bin/env bash

# Phase 4.3: NextAuth to Melody Migration - Cloudflare Deployment Update
# This script updates Cloudflare Pages environment variables with Melody auth configuration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CLOUDFLARE_ACCOUNT_ID="f9a5434fcf66ee00d67b61f2f67e0e22"
PROJECT_NAME="werewolf-ai"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Cloudflare token is set
check_cloudflare_token() {
    if [ -z "${CLOUDFLARE_TOKEN:-}" ]; then
        log_error "CLOUDFLARE_TOKEN environment variable not set"
        log_info "Please export your Cloudflare API token:"
        echo "  export CLOUDFLARE_TOKEN=your-token-here"
        exit 1
    fi
    log_success "Cloudflare token found"
}

# Function to set environment variable in Cloudflare Pages
set_env_var() {
    local var_name="$1"
    local var_value="$2"
    local description="${3:-}"
    
    log_info "Setting environment variable: $var_name"
    if [ -n "$description" ]; then
        log_info "  Description: $description"
    fi
    
    # Get current project configuration
    current_config=$(curl -s -X GET \
        "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME" \
        -H "Authorization: Bearer $CLOUDFLARE_TOKEN" \
        -H "Content-Type: application/json")
    
    if ! echo "$current_config" | jq -e '.success' > /dev/null; then
        log_error "Failed to fetch current project configuration"
        echo "$current_config" | jq '.'
        return 1
    fi
    
    # Extract current environment variables
    current_vars=$(echo "$current_config" | jq -r '.result.deployment_configs.production.env_vars // {}')
    
    # Add the new variable
    new_vars=$(echo "$current_vars" | jq --arg name "$var_name" --arg value "$var_value" '
        . + {
            ($name): {
                value: $value
            }
        }')
    
    # Update the project configuration
    response=$(curl -s -X PATCH \
        "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME" \
        -H "Authorization: Bearer $CLOUDFLARE_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"deployment_configs\": {
                \"production\": {
                    \"env_vars\": $new_vars
                }
            }
        }")
    
    if echo "$response" | jq -e '.success' > /dev/null; then
        log_success "✓ Environment variable $var_name set successfully"
    else
        log_error "Failed to set environment variable $var_name"
        echo "$response" | jq '.'
        return 1
    fi
}

# Function to trigger deployment
trigger_deployment() {
    log_info "Triggering new deployment with updated configuration..."
    
    response=$(curl -s -X POST \
        "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments" \
        -H "Authorization: Bearer $CLOUDFLARE_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "branch": "main"
        }')
    
    if echo "$response" | jq -e '.success' > /dev/null; then
        deployment_id=$(echo "$response" | jq -r '.result.id')
        log_success "✓ Deployment triggered successfully"
        log_info "Deployment ID: $deployment_id"
        return 0
    else
        log_error "Failed to trigger deployment"
        echo "$response" | jq '.'
        return 1
    fi
}

# Function to check deployment status
check_deployment_status() {
    log_info "Checking deployment status..."
    
    response=$(curl -s -X GET \
        "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments" \
        -H "Authorization: Bearer $CLOUDFLARE_TOKEN" \
        -H "Content-Type: application/json")
    
    if echo "$response" | jq -e '.success' > /dev/null; then
        latest_deployment=$(echo "$response" | jq -r '.result[0]')
        deployment_status=$(echo "$latest_deployment" | jq -r '.latest_stage.status')
        deployment_url=$(echo "$latest_deployment" | jq -r '.url')
        deployment_created=$(echo "$latest_deployment" | jq -r '.created_on')
        
        log_info "Latest deployment status: $deployment_status"
        log_info "Deployment URL: $deployment_url"
        log_info "Created: $deployment_created"
        
        if [ "$deployment_status" = "success" ]; then
            log_success "🎉 Deployment completed successfully!"
            return 0
        elif [ "$deployment_status" = "failure" ]; then
            log_error "Deployment failed"
            return 1
        else
            log_warning "Deployment status: $deployment_status (still in progress)"
            return 0
        fi
    else
        log_warning "Could not fetch deployment status"
        echo "$response" | jq '.'
        return 1
    fi
}

# Main deployment function
main() {
    log_info "🚀 Starting Phase 4.3: Cloudflare Melody Deployment Update"
    log_info "Project: $PROJECT_NAME"
    log_info "Account: $CLOUDFLARE_ACCOUNT_ID"
    echo ""
    
    # Check prerequisites
    check_cloudflare_token
    
    # Step 1: Set Melody Authentication Environment Variables
    log_info "📝 Step 1: Setting Melody Authentication Environment Variables"
    echo ""
    
    # Core Melody Authentication Configuration
    set_env_var "FEATURE_MELODY_AUTH" "true" "Enable Melody authentication for testing"
    set_env_var "AUTH_NEXTAUTH_FALLBACK" "true" "Enable NextAuth fallback for safety"
    set_env_var "AUTH_LOG_LEVEL" "info" "Authentication logging level"
    
    # Server Configuration
    set_env_var "AUTH_URL" "https://werewolf-ai.me-f9a.workers.dev" "Melody authentication URL"
    set_env_var "AUTH_SERVER_URL" "https://werewolf-ai.me-f9a.workers.dev" "Melody server URL"
    set_env_var "NEXT_PUBLIC_AUTH_SERVER_URL" "https://werewolf-ai.me-f9a.workers.dev" "Public Melody server URL"
    
    # Testing Configuration
    set_env_var "AUTH_TEST_MODE" "true" "Enable authentication testing mode"
    set_env_var "AUTH_TEST_USER_EMAIL" "test@werewolf-ai.dev" "Test user email"
    
    # Monitoring
    set_env_var "AUTH_LOG_ACTIVITY" "true" "Enable authentication activity logging"
    set_env_var "AUTH_METRICS_ENABLED" "true" "Enable authentication metrics"
    
    # Application Configuration
    set_env_var "NODE_ENV" "production" "Production environment"
    set_env_var "AUTH_TRUST_HOST" "true" "Trust host for Cloudflare Workers"
    
    echo ""
    log_success "✅ All Melody environment variables configured"
    echo ""
    
    # Step 2: Set Core Application Environment Variables
    log_info "📝 Step 2: Setting Core Application Environment Variables"
    echo ""
    
    # NextAuth Configuration (Fallback)
    set_env_var "NEXTAUTH_URL" "https://werewolf-ai.me-f9a.workers.dev" "NextAuth URL (fallback)"
    
    # Database Configuration
    set_env_var "DATABASE_URL" "placeholder-for-d1-binding" "Database URL placeholder for D1"
    
    echo ""
    log_success "✅ All core application environment variables configured"
    echo ""
    
    # Step 3: Trigger Deployment
    log_info "📝 Step 3: Triggering Cloudflare Deployment"
    echo ""
    
    if trigger_deployment; then
        echo ""
        log_success "✅ Deployment triggered successfully!"
        
        # Step 4: Wait and check status
        log_info "📝 Step 4: Checking Deployment Status"
        echo ""
        
        # Wait a bit for deployment to start
        sleep 10
        
        if check_deployment_status; then
            echo ""
            log_success "🎵 Phase 4.3: Cloudflare Melody Deployment Update Complete!"
            echo ""
            
            # Summary
            log_info "📋 Deployment Summary:"
            echo "  ✅ Melody authentication environment variables configured"
            echo "  ✅ Core application environment variables configured"
            echo "  ✅ Deployment triggered successfully"
            echo ""
            log_info "🔍 Next Steps:"
            echo "  1. Monitor deployment in Cloudflare dashboard"
            echo "  2. Set remaining secrets via Cloudflare dashboard:"
            echo "     - AUTH_SECRET"
            echo "     - AUTH_GOOGLE_SECRET"
            echo "     - AUTH_GITHUB_SECRET"
            echo "     - NEXTAUTH_SECRET"
            echo "     - GROQ_API_KEY"
            echo "     - OPENAI_API_KEY"
            echo "     - ANTHROPIC_API_KEY"
            echo "     - GEMINI_API_KEY"
            echo "  3. Test authentication endpoints"
            echo "  4. Validate Melody integration"
            echo "  5. Run Phase 4.4: Auth Flow Testing"
            echo ""
            log_success "Deployment URL: https://werewolf-ai.me-f9a.workers.dev"
        else
            log_warning "Deployment may still be in progress"
            log_info "Check Cloudflare dashboard for detailed status"
        fi
    else
        log_error "Failed to trigger deployment"
        exit 1
    fi
}

# Execute main function
main "$@"