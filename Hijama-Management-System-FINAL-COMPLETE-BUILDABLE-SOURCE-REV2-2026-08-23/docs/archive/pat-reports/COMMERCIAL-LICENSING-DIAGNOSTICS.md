# Diagnostics Report

{
  "passed": 10,
  "failed": 0,
  "warned": 0,
  "items": [
    {
      "id": "cache:version",
      "status": "PASS",
      "detail": "1.2.0|1.2.0|1.2.0"
    },
    {
      "id": "cache:invalidation",
      "status": "PASS",
      "detail": "invalidated"
    },
    {
      "id": "storage:state",
      "status": "PASS",
      "detail": "licenses object"
    },
    {
      "id": "backup:restore",
      "status": "PASS",
      "detail": "backup ok"
    },
    {
      "id": "backup:filesystem",
      "status": "PASS",
      "detail": "/workspace/license/data/backup/production-validation"
    },
    {
      "id": "migration:module",
      "status": "PASS",
      "detail": "migration module loads"
    },
    {
      "id": "audit:log",
      "status": "PASS",
      "detail": "audit log readable"
    },
    {
      "id": "router:v5-detect",
      "status": "PASS",
      "detail": "V5 detected"
    },
    {
      "id": "router:v4-fallback",
      "status": "PASS",
      "detail": "V4 not intercepted"
    },
    {
      "id": "memory:heap",
      "status": "PASS",
      "detail": "6.97MB"
    }
  ]
}

## Performance
{
  "coldStart": {
    "ms": 172.71
  },
  "warmResolve": {
    "ms": 0.15
  },
  "memory": {
    "heapUsedMB": 6.97,
    "rssMB": 63.93
  },
  "registryLoad": {
    "ms": 171.01
  },
  "keyGeneration": {
    "ms": 63.52
  },
  "activationValidation": {
    "ms": 1.17
  },
  "featureResolution": {
    "ms": 0.08
  },
  "packageResolution": {
    "ms": 0.58
  },
  "bundleGeneration": {
    "ms": 0.61
  },
  "validationHeapDeltaMB": 2.62
}
