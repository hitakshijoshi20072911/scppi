# VendorProof Performance Review

**Purpose:** Performance requirements, test plan, and measurement results.

**Current Status:** NOT YET AUDITED — performance requirements and test plan documented; implementation measurements pending.

---

## Review Status

**NOT YET AUDITED**

This document records the planned performance checks. No performance measurements have been performed yet. No performance claims should be made without evidence.

---

## Performance Requirements

### API Response Times
- **Health check:** < 100ms (p95)
- **Read operations:** < 500ms (p95)
- **Write operations:** < 1000ms (p95)
- **Complex queries:** < 2000ms (p95)

### Database Performance
- **Query latency:** < 100ms (p95) for typical queries
- **Connection pool:** < 10ms to acquire connection
- **Transaction duration:** < 500ms (p95) for typical transactions

### Background Jobs
- **Ingest job:** < 10 minutes for 1000 work items
- **Classify job:** < 5 minutes for 1000 items
- **Report job:** < 2 minutes for typical report
- **Invoice job:** < 2 minutes for draft creation

### Frontend Performance
- **Initial page load:** < 3 seconds
- **Time to interactive:** < 5 seconds
- **Route transitions:** < 500ms
- **Bundle size:** < 500KB (gzipped)

### Provider API Calls
- **GitHub read:** < 15 seconds timeout
- **Stripe write:** < 30 seconds timeout
- **Classification call:** < 45 seconds timeout

---

## Planned Performance Checks

### Database Indexes
- **Check:** Verify all foreign keys have indexes
- **Check:** Verify all query patterns have appropriate indexes
- **Check:** Verify partial unique indexes for idempotency
- **Tool:** EXPLAIN ANALYZE, pg_stat_statements
- **Frequency:** Before production deployment, quarterly review

### N+1 Queries
- **Check:** Identify N+1 query patterns in API routes
- **Check:** Verify no N+1 queries in critical paths
- **Tool:** Database query logging, manual review
- **Frequency:** Code review, before each release

### Pagination
- **Check:** Verify all list endpoints use cursor pagination
- **Check:** Verify pagination limits are enforced (max 100)
- **Check:** Verify pagination is stable (no shifting results)
- **Tool:** API tests, manual review
- **Frequency:** Code review, before each release

### Provider API Calls
- **Check:** Verify provider call count is minimised
- **Check:** Verify retry behaviour is appropriate
- **Check:** Verify circuit breaker is functional
- **Check:** Verify per-workspace call counter is accurate
- **Tool:** Provider execution logging, metrics
- **Frequency:** Continuous monitoring, weekly review

### Retry Behaviour
- **Check:** Verify retry backoff is exponential with jitter
- **Check:** Verify retry limits are enforced
- **Check:** Verify write operations are not retried blindly
- **Tool:** Job execution logs, metrics
- **Frequency:** Continuous monitoring, weekly review

### Large Work Item Imports
- **Check:** Verify page and item caps are enforced
- **Check:** Verify large imports produce partial runs, not crashes
- **Check:** Verify per-workspace job limit is enforced
- **Tool:** Load testing, manual review
- **Frequency:** Before production deployment, quarterly review

### PDF Generation
- **Check:** Verify PDF generation time is acceptable
- **Check:** Verify PDF size is reasonable
- **Check:** Verify PDF rendering is correct
- **Tool:** Performance tests, manual review
- **Frequency:** Before production deployment, quarterly review

### Worker Concurrency
- **Check:** Verify worker concurrency limits are enforced
- **Check:** Verify worker does not overwhelm database
- **Check:** Verify worker does not overwhelm provider APIs
- **Tool:** Worker metrics, database metrics
- **Frequency:** Continuous monitoring, weekly review

### Memory Use
- **Check:** Verify API process memory usage is stable
- **Check:** Verify worker process memory usage is stable
- **Check:** Verify no memory leaks
- **Tool:** Process metrics, memory profiling
- **Frequency:** Continuous monitoring, weekly review

### Frontend Bundle Size
- **Check:** Verify bundle size is under limit
- **Check:** Verify no unnecessary dependencies
- **Check:** Verify code splitting is effective
- **Tool:** Bundle analysis tools
- **Frequency:** Before each release

### Unnecessary Re-renders
- **Check:** Verify React components do not re-render unnecessarily
- **Check:** Verify memoisation is used where appropriate
- **Tool:** React DevTools Profiler
- **Frequency:** Before each release

### Slow Endpoints
- **Check:** Identify slow endpoints (> 1s p95)
- **Check:** Optimise slow endpoints
- **Tool:** APM (e.g., Datadog, New Relic)
- **Frequency:** Continuous monitoring, weekly review

---

## Performance Testing

### Load Testing
- **Tool:** k6, Artillery, or equivalent
- **Scenarios:**
  - Typical user workflow
  - Peak load simulation
  - Sustained load test
- **Metrics:** Response times, error rates, resource utilisation
- **Frequency:** Before production deployment, quarterly

### Stress Testing
- **Tool:** k6, Artillery, or equivalent
- **Scenarios:**
  - Beyond expected load
  - Resource exhaustion
  - Dependency failure simulation
- **Metrics:** System behaviour under stress, failure modes
- **Frequency:** Before production deployment

### Database Performance Testing
- **Tool:** pgbench, custom scripts
- **Scenarios:**
  - Typical query patterns
  - Large dataset queries
  - Concurrent transactions
- **Metrics:** Query latency, throughput, lock contention
- **Frequency:** Before production deployment, quarterly

---

## Performance Monitoring

### Metrics to Collect
- **API:** Request rate, latency, error rate by endpoint
- **Database:** Query latency, connection pool usage, lock waits
- **Worker:** Job queue depth, job duration, job failure rate
- **Provider:** API call rate, latency, error rate by provider
- **System:** CPU, memory, disk I/O, network I/O

### Alerting Thresholds
- **API latency:** > 1s p95 for 5 minutes
- **Error rate:** > 1% for 5 minutes
- **Database latency:** > 500ms p95 for 5 minutes
- **Worker queue depth:** > 1000 for 10 minutes
- **Provider error rate:** > 5% for 5 minutes
- **CPU usage:** > 80% for 10 minutes
- **Memory usage:** > 80% for 10 minutes

### Performance Dashboards
- **API performance:** Response times, error rates, throughput
- **Database performance:** Query latency, connection pool, locks
- **Worker performance:** Job queue, job duration, failure rate
- **Provider performance:** API call rate, latency, error rate
- **System performance:** CPU, memory, disk, network

---

## Performance Optimisation

### Optimisation Techniques
- **Database:** Indexes, query optimisation, connection pooling, read replicas (if needed)
- **API:** Caching (where appropriate), pagination, batch operations
- **Worker:** Job batching, concurrency limits, queue prioritisation
- **Frontend:** Code splitting, lazy loading, memoisation, bundle optimisation

### Optimisation Process
1. **Identify bottleneck:** Use metrics and profiling to find slow component
2. **Analyse root cause:** Understand why it's slow
3. **Design optimisation:** Choose appropriate optimisation technique
4. **Implement optimisation:** Make the change
5. **Measure impact:** Verify improvement with metrics
6. **Document change:** Record in this document or architecture

### Optimisation Trade-offs
- **Caching:** Improves performance but adds complexity and staleness risk
- **Read replicas:** Improves read performance but adds cost and eventual consistency
- **Batching:** Improves throughput but adds latency and complexity
- **Code splitting:** Improves initial load but adds complexity

---

## Performance Regression Testing

### Regression Tests
- **API performance tests:** Verify response times are within limits
- **Database performance tests:** Verify query latency is within limits
- **Frontend performance tests:** Verify bundle size and load time are within limits
- **Load tests:** Verify system can handle expected load

### Regression Prevention
- **Performance tests in CI:** Run performance tests before merge
- **Performance budgets:** Enforce bundle size limits in CI
- **Query review:** Review database queries in code review
- **Profiling:** Profile slow endpoints before optimisation

---

**Document status:** Initial performance review created. Requirements documented. Measurements pending implementation.
