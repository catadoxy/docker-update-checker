# 🕒 Configuring the Check Interval

This guide explains how to configure how often the Docker Update Checker scans for new image updates.

## 📝 Overview

By default, the app checks for updates every **5 minutes (300 seconds)**. You can customize this using the `CHECK_INTERVAL` environment variable in your `docker-compose.yml` file.

**Special value**: Set `CHECK_INTERVAL=0` to **disable auto-refresh** completely. The app will only check for updates when you manually click the "Refresh Status" button.

**Installation**: This guide assumes you're using the Docker Hub image `catadoxy/docker-update-checker:latest`. If you're building from source, see Method 3 below.

## ⚙️ Configuration Methods

### Method 1: Docker Compose (Recommended)

Edit your `docker-compose.yml` file:

```yaml
services:
  docker-update-checker:
    image: catadoxy/docker-update-checker:latest
    container_name: docker-update-checker
    ports:
      - "3456:3456"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - CHECK_INTERVAL=300  # ← Change this value (in seconds)
```

**Common intervals:**
```yaml
# Disable auto-refresh (manual refresh only)
- CHECK_INTERVAL=0

# Every 1 minute (fast, but may hit rate limits)
- CHECK_INTERVAL=60

# Every 5 minutes (default, balanced)
- CHECK_INTERVAL=300

# Every 10 minutes (moderate)
- CHECK_INTERVAL=600

# Every 30 minutes (conservative)
- CHECK_INTERVAL=1800

# Every hour (very conservative)
- CHECK_INTERVAL=3600
```

After changing, restart the container:
```bash
docker compose down
docker compose up -d
```

### Method 2: Docker Command Line

If running with `docker run`:

```bash
docker run -d \
  --name docker-update-checker \
  -p 3456:3456 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e CHECK_INTERVAL=300 \
  catadoxy/docker-update-checker:latest
```

### Method 3: Building from Source (Advanced)

If you're building from source instead of using the Docker Hub image:

```bash
git clone https://github.com/catadoxy/docker-update-checker.git
cd docker-update-checker

# Edit docker-compose.yml:
# Change: image: catadoxy/docker-update-checker:latest
# To: build: .

# Then edit the environment variable:
environment:
  - CHECK_INTERVAL=300

docker compose up -d
```

## 🔍 How It Works

1. **Backend**: Reads `CHECK_INTERVAL` environment variable (default: 300 seconds)
2. **API**: Exposes this value via `/api/config` endpoint
3. **Frontend**: Fetches the interval and auto-refreshes accordingly
4. **Display**: Shows the interval in the UI header

## ⚠️ Important Considerations

### Docker Hub Rate Limits

Docker Hub has rate limits for API requests:
- **Unauthenticated**: 100 pulls per 6 hours
- **Authenticated**: 200 pulls per 6 hours

**Recommendations:**
- Don't set interval below 60 seconds (1 minute)
- For many containers (10+), use 300+ seconds (5+ minutes)
- Monitor logs for rate limit errors

### Resource Usage

Lower intervals = higher resource usage:
- More API calls to Docker Hub
- More Docker API calls
- More CPU/memory usage

### When to Use Different Intervals

**Disabled (0 seconds):**
- On-demand checking only
- Very large deployments (100+ containers)
- Minimizing Docker Hub API usage
- Environments with strict rate limits
- When updates are rare or handled externally
- Manual approval workflows

**Fast (60-120 seconds):**
- Development environments
- Testing new deployments
- Few containers (1-5)
- Critical production monitoring

**Moderate (300-600 seconds):**
- Normal production use
- Medium number of containers (5-20)
- Balanced monitoring needs

**Slow (1800-3600 seconds):**
- Many containers (20+)
- Non-critical environments
- Rate limit concerns
- Minimal resource usage needed

## 📊 Verifying Your Configuration

### Check the server logs:

```bash
docker compose logs

# You should see:
# ⏱️  Check interval: 300 seconds (5 minutes)
# or
# ⏱️  Auto-refresh: DISABLED (manual refresh only)
```

### Check the API:

```bash
curl http://localhost:3456/api/config

# Returns:
# {
#   "checkInterval": 300,
#   "checkIntervalMs": 300000,
#   "autoRefreshEnabled": true,
#   "timestamp": "2024-02-16T12:00:00.000Z"
# }
```

### Check the web interface:

Open the interface in your browser. The header should show:
```
Auto-refresh: every 300 seconds (5.0 min)
```

Or if disabled:
```
Auto-refresh: DISABLED (manual only)
```

## 🎯 Real-World Examples

### Example 1: Dev Environment (Fast Updates)

**Scenario**: Testing new image versions frequently

```yaml
services:
  docker-update-checker:
    image: catadoxy/docker-update-checker:latest
    container_name: docker-update-checker
    ports:
      - "3456:3456"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - CHECK_INTERVAL=60  # Check every minute
```

### Example 2: Production (Balanced)

**Scenario**: 10 containers, regular monitoring

```yaml
environment:
  - NODE_ENV=production
  - CHECK_INTERVAL=300  # Check every 5 minutes
```

### Example 3: Large Deployment (Conservative)

**Scenario**: 50+ containers, avoid rate limits

```yaml
environment:
  - NODE_ENV=production
  - CHECK_INTERVAL=1800  # Check every 30 minutes
```

### Example 4: Staging Environment

**Scenario**: Less critical, resource-conscious

```yaml
environment:
  - NODE_ENV=production
  - CHECK_INTERVAL=900  # Check every 15 minutes
```

### Example 5: Manual Refresh Only

**Scenario**: Very large deployment (100+ containers) or strict rate limits

```yaml
environment:
  - NODE_ENV=production
  - CHECK_INTERVAL=0  # Disable auto-refresh
```

Users must click "Refresh Status" to check for updates. Perfect for:
- Environments where updates are checked during maintenance windows
- Avoiding any Docker Hub rate limits
- Minimal resource usage

## 🔧 Troubleshooting

### Issue: Changes not taking effect

**Solution**: Make sure to restart the container after changing the environment variable:
```bash
docker compose down
docker compose up -d
```

### Issue: Rate limit errors in logs

**Symptom**: Logs show "Failed to get token" or "429 Too Many Requests"

**Solution**: Increase the check interval:
```yaml
environment:
  - CHECK_INTERVAL=600  # or higher
```

### Issue: Web interface shows old interval

**Solution**: The frontend fetches the config on load. Refresh your browser after restarting the backend.

### Issue: Want different interval for different environments

**Solution**: Create separate docker-compose files:

**docker-compose.dev.yml**:
```yaml
environment:
  - CHECK_INTERVAL=60
```

**docker-compose.prod.yml**:
```yaml
environment:
  - CHECK_INTERVAL=600
```

Run with:
```bash
docker compose -f docker-compose.prod.yml up -d
```

## 📈 Monitoring Impact

### Check your actual API usage:

```bash
# View logs to see scan frequency
docker compose logs -f --tail=50

# Count API calls per hour (approximate)
# Containers × (3600 / CHECK_INTERVAL)
# Example: 10 containers × (3600 / 300) = 120 calls/hour
```

### Docker Hub rate limit status:

Unfortunately Docker Hub doesn't provide an easy way to check your current rate limit status, so:
- Start conservatively (300+ seconds)
- Monitor logs for rate limit errors
- Adjust as needed

## 💡 Best Practices

1. **Start with the default** (300 seconds) and adjust based on needs
2. **Monitor logs** for rate limit warnings
3. **Scale with container count**: More containers = longer interval
4. **Consider your workflow**: 
   - CI/CD pipeline? → Longer interval
   - Manual deployments? → Can be shorter
5. **Test your changes** before deploying to production

## 🚀 Quick Reference

| Interval | Seconds | Use Case |
|----------|---------|----------|
| Disabled | 0 | Manual refresh only |
| 1 minute | 60 | Development, testing |
| 5 minutes | 300 | Default, most common |
| 10 minutes | 600 | Production, moderate |
| 15 minutes | 900 | Large deployments |
| 30 minutes | 1800 | Very large deployments |
| 1 hour | 3600 | Maximum conservative |

---

**Remember:** You can always manually refresh using the "Refresh Status" button in the web interface, regardless of the auto-refresh interval! 🔄
