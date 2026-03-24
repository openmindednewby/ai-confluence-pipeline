# =============================================================================
# AI Confluence Pipeline — Tilt Configuration
# =============================================================================
#
# Usage:
#   tilt up          — start n8n + all resources
#   tilt down        — stop everything
#   tilt trigger <r> — manually trigger a resource
#
# n8n UI: http://localhost:10353
# Webhook: http://localhost:10353/webhook/analyze
# =============================================================================

load("ext://dotenv", "dotenv")

# Load .env if it exists (silently skip if not)
if os.path.exists(".env"):
    dotenv()

# ---------------------------------------------------------------------------
# n8n Service (Docker Compose)
# ---------------------------------------------------------------------------

docker_compose("docker-compose.yml")

dc_resource(
    "n8n",
    labels=["services"],
    links=[
        link("http://localhost:10353", "n8n UI"),
        link("http://localhost:10353/webhook/analyze", "Webhook"),
    ],
)

# ---------------------------------------------------------------------------
# Trigger Analysis (manual)
# ---------------------------------------------------------------------------

local_resource(
    "trigger-analysis",
    cmd="bash scripts/trigger-analysis.sh \"Sample feature: Add user notification preferences with email and push channels\"",
    trigger_mode=TRIGGER_MODE_MANUAL,
    auto_init=False,
    labels=["pipeline"],
    resource_deps=["n8n"],
)

local_resource(
    "trigger-analysis-no-jira",
    cmd="bash scripts/trigger-analysis.sh \"Sample feature: Add user notification preferences\" --no-jira",
    trigger_mode=TRIGGER_MODE_MANUAL,
    auto_init=False,
    labels=["pipeline"],
    resource_deps=["n8n"],
)

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

local_resource(
    "validate-registry",
    cmd="node -e \"const d=require('./templates/registry.json'); console.log('Registry OK: ' + d.templates.length + ' templates'); d.templates.forEach(t => console.log('  ' + t.id + ' (' + t.category + ')'))\"",
    trigger_mode=TRIGGER_MODE_MANUAL,
    auto_init=False,
    labels=["validation"],
)

local_resource(
    "validate-templates",
    cmd="""
        echo "Checking template files referenced in registry..."
        ERRORS=0
        for f in $(node -e "const r=require('./templates/registry.json'); r.templates.forEach(t => console.log(t.prompt))"); do
            if [ -f "$f" ]; then
                echo "  OK: $f"
            else
                echo "  MISSING: $f"
                ERRORS=$((ERRORS + 1))
            fi
        done
        if [ $ERRORS -gt 0 ]; then
            echo "FAILED: $ERRORS template files missing"
            exit 1
        else
            echo "All template files present"
        fi
    """,
    trigger_mode=TRIGGER_MODE_MANUAL,
    auto_init=False,
    labels=["validation"],
)

# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

local_resource(
    "n8n-health",
    cmd="curl -sf http://localhost:10353/healthz > /dev/null 2>&1 && echo 'n8n is healthy' || echo 'n8n is not responding (is it running?)'",
    trigger_mode=TRIGGER_MODE_MANUAL,
    auto_init=False,
    labels=["health"],
    resource_deps=["n8n"],
)
