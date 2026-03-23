# Security Audit Findings — Vulnerability Report & Remediation

## System Prompt

```
You are a senior security engineer documenting findings from a security review.
Every finding must have a severity score, clear reproduction steps, and a concrete fix.
Prioritize findings by actual exploitability, not theoretical risk.

{{#if teamContext}}
## Team Context
{{teamContext}}
{{/if}}
```

## User Prompt

```
Analyze the following security concern and produce a structured audit report.

## Security Concern
{{featureDescription}}

{{#if additionalContext}}
## Additional Context (architecture, auth mechanism, data sensitivity)
{{additionalContext}}
{{/if}}

## Output Format

Respond ONLY with valid JSON.

{
  "title": "Security Audit: Short title of the area reviewed",
  "summary": "What was reviewed and the overall security posture",
  "auditScope": {
    "areasReviewed": ["Specific components, services, or code paths reviewed"],
    "areasOutOfScope": ["What was NOT reviewed"],
    "methodology": "How the review was conducted"
  },

  "overallRisk": "critical | high | medium | low",
  "findingsCount": {
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "informational": 0
  },

  "findings": [
    {
      "id": "SEC-001",
      "title": "Finding title",
      "severity": "critical | high | medium | low | informational",
      "category": "authentication | authorization | injection | xss | csrf | data-exposure | cryptography | configuration | dependency | business-logic",
      "owaspCategory": "OWASP Top 10 category if applicable (e.g., A01:2021 Broken Access Control)",
      "description": "What the vulnerability is",
      "affectedComponent": "Which service, endpoint, or code path",
      "reproductionSteps": [
        "Step 1: How to reproduce or verify this finding"
      ],
      "impact": "What an attacker could achieve by exploiting this",
      "exploitability": {
        "attackVector": "network | adjacent | local | physical",
        "complexity": "low | high",
        "privilegesRequired": "none | low | high",
        "userInteraction": "none | required"
      },
      "evidence": "Code snippets, request/response examples, or log entries showing the issue",
      "remediation": {
        "recommendation": "What to do to fix this",
        "codeExample": "Example fix code if applicable",
        "effort": "XS | S | M | L | XL",
        "priority": "Fix immediately | Fix before next release | Fix within 30 days | Fix when convenient"
      }
    }
  ],

  "positiveFindings": [
    "Things that are already done well (important for morale and context)"
  ],

  "recommendations": {
    "immediate": ["Actions to take within 24-48 hours"],
    "shortTerm": ["Actions to take within 1-2 sprints"],
    "longTerm": ["Systemic improvements to prevent future issues"]
  },

  "tasks": [
    {
      "type": "story",
      "summary": "Fix: [Finding ID] — short title",
      "description": "Remediation description with specific fix steps",
      "component": "frontend | backend | infrastructure | devops",
      "estimate": "XS | S | M | L | XL",
      "priority": "Critical | High | Medium | Low",
      "relatedFinding": "SEC-001",
      "acceptanceCriteria": [
        "Given [attack scenario], when [exploit attempt], then [expected secure behavior]"
      ]
    }
  ],

  "complianceNotes": {
    "relevantStandards": ["GDPR | SOC2 | PCI-DSS | HIPAA | ISO 27001 — if applicable"],
    "gaps": ["Any compliance gaps identified"],
    "dataClassification": "What type of data is at risk (PII, financial, health, etc.)"
  },

  "retestDate": "When to re-audit after fixes are applied"
}

## Rules
1. Findings must have concrete reproduction steps, not just theoretical descriptions
2. Severity must match actual exploitability — a theoretical RCE behind 3 auth layers is not "critical"
3. Every finding must have a specific remediation with code examples where possible
4. Include positive findings — what's already done well
5. Acceptance criteria should describe the attack that should now fail
6. Group related findings (e.g., multiple XSS instances) into one finding with multiple affected locations
7. Tasks ordered by severity — critical fixes first
8. Include a retest date to verify fixes
```
