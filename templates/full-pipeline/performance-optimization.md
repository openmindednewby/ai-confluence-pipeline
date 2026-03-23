# Performance Optimization — Bottleneck Analysis & Fix Plan

## System Prompt

```
You are a senior performance engineer analyzing a system for optimization opportunities.
Every recommendation must be backed by expected impact (measurable improvement).
Prioritize by effort-to-impact ratio — quick wins first.

{{#if teamContext}}
## Team Context
{{teamContext}}
{{/if}}
```

## User Prompt

```
Analyze the following performance concern and produce an optimization plan.

## Performance Concern
{{featureDescription}}

{{#if additionalContext}}
## Additional Context (metrics, load patterns, SLAs, current benchmarks)
{{additionalContext}}
{{/if}}

## Output Format

Respond ONLY with valid JSON.

{
  "title": "Performance: Short descriptive title",
  "summary": "What's slow, how bad it is, and what we'll do about it",

  "currentState": {
    "metrics": [
      {
        "name": "Metric name (e.g., p95 response time, throughput, TTFB)",
        "currentValue": "Current measured value",
        "target": "Where it should be (SLA or goal)",
        "gap": "How far off we are"
      }
    ],
    "userImpact": "How this affects end users",
    "businessImpact": "Revenue, conversion, or engagement impact if known"
  },

  "analysis": {
    "bottlenecks": [
      {
        "location": "Where the bottleneck is (service, query, endpoint, render path)",
        "type": "cpu | memory | io | network | database | rendering | bundle-size",
        "description": "What's happening and why it's slow",
        "evidence": "Metrics, profiles, or traces that prove this is the bottleneck",
        "contribution": "How much of the total latency this accounts for (e.g., 60%)"
      }
    ],
    "hotPaths": ["The critical code paths that matter most for performance"],
    "redHerrings": ["Things that look slow but aren't actually the problem"]
  },

  "optimizations": [
    {
      "id": "OPT-001",
      "title": "Optimization title",
      "description": "What to change and why it helps",
      "type": "caching | query-optimization | algorithm | lazy-loading | code-splitting | connection-pooling | batch-processing | indexing | denormalization | compression | cdn | prefetching",
      "targetBottleneck": "Which bottleneck this addresses",
      "expectedImprovement": "Estimated improvement (e.g., 'p95 from 800ms to 200ms')",
      "confidence": "high | medium | low",
      "effort": "XS | S | M | L | XL",
      "risk": "low | medium | high",
      "tradeoff": "What you give up (memory for speed, freshness for cache, etc.)"
    }
  ],

  "quickWins": [
    "Optimizations that are XS/S effort with medium/high impact — do these first"
  ],

  "benchmarkPlan": {
    "tooling": ["Tools to measure (e.g., k6, Lighthouse, pgbench, Chrome DevTools)"],
    "baselineTests": ["Tests to run before any changes to establish baseline"],
    "regressionTests": ["Tests to run after each optimization to verify improvement"],
    "loadProfile": "Realistic load pattern for testing (concurrent users, request patterns)"
  },

  "tasks": [
    {
      "type": "story",
      "summary": "[OPT-001] Task title",
      "description": "What to implement",
      "component": "frontend | backend | database | infrastructure",
      "estimate": "XS | S | M | L | XL",
      "priority": "Critical | High | Medium | Low",
      "expectedImprovement": "What this task alone should improve",
      "acceptanceCriteria": [
        "Given [load condition], when [action], then [performance target]"
      ]
    }
  ],

  "monitoringPlan": {
    "dashboards": ["What dashboards to create or update"],
    "alerts": [
      {
        "metric": "What to alert on",
        "threshold": "When to fire",
        "severity": "critical | warning"
      }
    ],
    "continuousBaseline": "How to track performance over time to catch regressions"
  },

  "antiPatterns": [
    "Things to NOT do (premature optimization, over-caching, etc.) and why"
  ],

  "estimatedComplexity": "low | medium | high",
  "suggestedOrder": "Recommended implementation order (usually: measure → quick wins → big items → monitor)"
}

## Rules
1. Every optimization must have an expected improvement with a number, not just "faster"
2. Include confidence level — is this a proven fix or an educated guess?
3. Quick wins section is mandatory — always lead with low-effort, high-impact items
4. Include red herrings — things that look slow but aren't worth optimizing
5. Tradeoffs must be explicit — there's always a cost (memory, complexity, freshness)
6. Benchmark plan must include baseline measurement BEFORE any changes
7. Tasks ordered by effort-to-impact ratio, not just severity
8. Acceptance criteria must include measurable performance targets
9. Include monitoring plan — optimization without monitoring is just guessing
10. Anti-patterns section prevents over-engineering
```
