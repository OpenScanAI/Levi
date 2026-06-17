# Rate Limiting Manual Test Results

## Test Setup
- Date: 2026-06-17
- Redis: redis://localhost:6379 (running locally)
- Server: localhost:3100 in local_trusted mode
- Rate limiting: enabled with Redis backend

## Test 1: Health Endpoint (Exempt)
```bash
curl -I http://localhost:3100/api/health
```
Result: No rate limit headers (expected — health routes are exempt)

## Test 2: Rate Limit Headers Present
```bash
curl -I http://localhost:3100/api/companies
```
Response headers:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 299
X-RateLimit-Reset: 1781683180
X-RateLimit-Tier: admin
```

## Test 3: 429 Blocking After Limit
```bash
for i in {1..310}; do
  curl -s -o /dev/null -w "%{http_code} " http://localhost:3100/api/companies
done
```
Results:
- 295 requests → 200 OK
- 15 requests → 429 Too Many Requests

429 Response body:
```json
{
  "success": false,
  "error": {
    "code": "ERR_RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded for tier admin. Limit: 300 requests per 60s."
  }
}
```

## Test 4: Redis Backend Confirmed
Server logs showed:
```
INFO: Redis connected for rate limiting {"redisUrl":"redis://localhost:6379"}
INFO: Rate limiting enabled {"failOpen":true}
```

## Summary
All rate limiting features working correctly:
- Redis backend active
- Headers present on every response
- 429 returned after limit exceeded
- Error message includes tier and limit details
- Health endpoint exempt from rate limiting
