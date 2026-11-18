# Production Keep-Warm & Availability Strategy

## 1. Overview & Cold-Start Problem
In serverless, containerized, or free-tier hosting environments (such as Render free web services, Fly.io auto-stopping machines, Railway, or AWS Lambda), backend application instances automatically scale to zero or enter a deep sleeping state after periods of inactivity (typically 15 minutes). 

When a user attempts to sign in or open the application while the server is asleep:
- Initial HTTP requests can take 30 to 60+ seconds to respond while the container provisions, Node.js boots, and database connections initialize.
- Without proper client feedback and keep-warm mechanisms, users may assume the application is broken, experience network timeouts, or repeatedly press buttons.

To eliminate cold-start delays and guarantee zero-downtime reliability, implement one of the two strategies below.

---

## 2. Keep-Warm Strategy A: Always-On Hosting Plan (Recommended)
The cleanest and most robust solution for production deployments is an always-on host:
- **Render / Railway / Fly.io / Heroku**: Upgrade from free/hobby tiers to Starter or Pro instances with `auto-sleep` or `scale to zero` disabled.
- **Benefits**:
  - Zero cold starts for all users and background webhooks.
  - Consistent memory and CPU allocation.
  - Persistent connection pooling to PostgreSQL.
  - Uninterrupted scheduled background cron jobs and queue workers.

---

## 3. Keep-Warm Strategy B: Synthetic 5-Minute Health Ping
If running on an infrastructure tier that idles after 15 minutes of inactivity, configure an external synthetic uptime monitor to ping the API server every **4 to 5 minutes**:

### Recommended Monitoring Providers
- **UptimeRobot** (Free tier: 5-minute intervals, HTTP HEAD/GET)
- **Better Uptime / Better Stack** (3-minute checks)
- **Cloudflare Workers / Cron Triggers** (Scheduled fetch ping)
- **AWS EventBridge + Lambda / GitHub Actions Scheduled Cron**

### Target Endpoint for Ping
Configure the external monitor to make a simple `GET` or `HEAD` request to:
```http
GET https://api.yourdomain.com/api/v1/health/live
```
**Important:** Do NOT ping heavyweight endpoints or endpoints that run expensive database transactions for keep-warm pings. Use `/health/live` exclusively.

---

## 4. Health Check Endpoint Reference

The API exposes specialized health endpoints designed for different monitoring needs:

| Endpoint | Purpose | Database Hit? | Recommended Consumer |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/health/live` | **Liveness Probe** | **No** (0 queries) | Synthetic keep-warm pings, Kubernetes liveness probes |
| `GET /api/v1/health/ready` | **Readiness Probe** | **Yes** (`SELECT 1`) | Kubernetes readiness probes, pre-deployment checks |
| `GET /api/v1/health` | **Full Health Check** | **Yes** (checks DB & uptime) | Admin status dashboards |

### Sample Responses

#### `GET /api/v1/health/live` (Liveness)
```json
{
  "status": "ok",
  "timestamp": "2026-11-18T10:00:00.000Z"
}
```
HTTP Status: `200 OK` (Latency: < 5ms)

#### `GET /api/v1/health/ready` (Readiness)
```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-11-18T10:00:00.000Z"
}
```
HTTP Status: `200 OK` if database is connected, or `503 Service Unavailable` if database connection fails.

---

## 5. Client-Side UX & Cold-Start Resilience

The web client (`apps/web`) implements automated resilience when communicating with a cold or waking server:
1. **Detection**: Any network failure or timeout (> 3s without response) triggers cold-start mode.
2. **Clear Messaging**: The UI displays `'Waking up the server, this can take up to a minute'` with an active progress indicator and elapsed seconds counter.
3. **Automated Recovery**: Background polling against `/api/v1/health/live` runs with exponential backoff (2s, 3s, 5s).
4. **Input Preservation & Security**:
   - The user's typed email or username is preserved.
   - The password field is automatically cleared after 15 seconds of waiting or upon submit failure to prevent credential exposure.
5. **Manual Retry**: An accessible "Retry" button allows immediate re-testing without full page refresh.
6. **Graceful Timeout**: If the server fails to respond within 90 seconds, the user is presented with a friendly error notice containing a traceable Request ID for support diagnostics.
