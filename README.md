![Alt text](assets/icon.jpg)

A modern, cyberpunk-themed web interface to monitor your Docker containers and check for available updates in real-time.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)

## ✨ Features

- 🔍 **Real-time monitoring** of all running Docker containers
- 🆕 **Update detection** by comparing local images with their registry
- 🎨 **Cyberpunk terminal aesthetic** with neon colors and animations
- 📊 **Statistics dashboard** showing containers status at a glance
- 🔄 **Auto-refresh** refresh interval can be set (0 to disable autorefresh)
- 🚀 **Fast and lightweight** - pure React frontend, minimal Node.js backend
- 🐋 **Multi-registry support** - works with Docker Hub, ghcr.io, lscr.io and more

## 🖼️ Interface

The interface features:
- Animated grid background with scanline effects
- Glowing neon borders for containers with updates available
- Real-time status badges
- Container cards with image, version, and status information
- Separate sections for containers with updates and up-to-date containers
- Responsive design for desktop and mobile

![Alt text](assets/preview.png)

## 🚀 Quick Start

### Prerequisites
- Docker installed
- Access to Docker socket (`/var/run/docker.sock`)

### Option 1: Docker Compose (Recommended)

1. **Create a `docker-compose.yml` file:**

   ```yaml
   services:
     docker-update-checker:
       image: ghcr.io/catadoxy/docker-update-checker:latest
       container_name: docker-update-checker
       ports:
         - "3456:3456"
       volumes:
         - /var/run/docker.sock:/var/run/docker.sock:ro
       restart: unless-stopped
       environment:
         - NODE_ENV=production
         - CHECK_INTERVAL=300  # Check every 5 minutes (300 seconds)
   ```

2. **Start the container:**

   ```bash
   docker compose up -d
   ```

3. **Access the interface:**

   Open your browser and navigate to:
   - From the same machine: `http://localhost:3456`
   - From another device on your network: `http://YOUR_SERVER_IP:3456`

### Option 2: Docker Run

```bash
docker run -d \
  --name docker-update-checker \
  -p 3456:3456 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  --restart unless-stopped \
  -e NODE_ENV=production \
  -e CHECK_INTERVAL=300 \
  ghcr.io/catadoxy/docker-update-checker:latest
```

Then access the interface at `http://localhost:3456`

**To stop and remove:**
```bash
docker stop docker-update-checker
docker rm docker-update-checker
```

**To update to the latest version:**
```bash
docker stop docker-update-checker
docker rm docker-update-checker
docker pull ghcr.io/catadoxy/docker-update-checker:latest
# Then run the docker run command again
```

## 🔧 Configuration

**Change the check interval:**

Edit the `CHECK_INTERVAL` environment variable:
- `60` = Check every minute
- `300` = Check every 5 minutes (default)
- `600` = Check every 10 minutes
- `0` = Disable auto-refresh (manual only)

Docker Compose:
```yaml
environment:
  - CHECK_INTERVAL=600
```

Docker Run:
```bash
-e CHECK_INTERVAL=600
```

**Change the port:**

Docker Compose - modify the port mapping:
```yaml
ports:
  - "8080:3456"  # Use port 8080 instead of 3456
```

Docker Run - change the `-p` flag:
```bash
-p 8080:3456
```

Then restart the container and access it at `http://localhost:8080`

**Updating (Docker Compose):**
```bash
docker compose pull
docker compose up -d
```

## 🐛 Troubleshooting

### "Failed to connect to Docker"

- Ensure Docker is running: `docker ps`
- Check Docker socket permissions: `ls -l /var/run/docker.sock`
- On Linux, you may need to add your user to the docker group: `sudo usermod -aG docker $USER`

### "No containers detected"

- Make sure you have running containers: `docker ps`
- Check that the backend can access Docker: `curl http://localhost:3456/api/health`

### Update detection not working

- Images from private registries requiring authentication won't be checked
- Images without tags or with SHA digests may show as "unknown"

## 🔒 Security Notes

- This tool requires access to the Docker socket, which provides root-level access
- Only run this on trusted networks or localhost
- Do not expose port 3456 to the internet without proper authentication
- Consider using Docker socket proxy for production deployments

## 🏗️ Architecture

```
┌─────────────────────┐
│   Web Browser       │
│  (React Frontend)   │
└──────────┬──────────┘
           │
           │ HTTP/REST
           │
┌──────────▼──────────┐
│   Node.js Server    │
│   (Express API)     │
└──────────┬──────────┘
           │
           │ Docker SDK
           │
┌──────────▼──────────┐     ┌──────────────────────┐
│   Docker Socket     │────▶│  Container Registries │
│  /var/run/docker    │     │  Docker Hub, ghcr.io  │
└─────────────────────┘     │  lscr.io, and more   │
                            └──────────────────────┘
```

## 🤝 How It Works

1. **Backend** connects to Docker via `/var/run/docker.sock`
2. Lists all running containers using Docker API
3. For each container:
   - Detects the registry (Docker Hub, ghcr.io, lscr.io, etc.)
   - Gets the current image digest (SHA)
   - Queries the appropriate registry for the latest digest
   - Compares digests to determine if update is available
   - Fetches the latest version tag if available
4. **Frontend** polls the API at the configured interval and displays results

## 📝 License

MIT License - feel free to use this for personal or commercial projects!

## 🙏 Credits

Built with:
- [Express](https://expressjs.com/) - Fast, minimalist web framework
- [Dockerode](https://github.com/apocas/dockerode) - Docker API client
- [React](https://reactjs.org/) - UI library
- [Axios](https://axios-http.com/) - HTTP client

Fonts:
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) - Monospace font
- [Orbitron](https://fonts.google.com/specimen/Orbitron) - Display font

## 🐛 Known Issues

- Images from private registries requiring authentication won't be checked
- Images without tags or with SHA digests may show version as "unknown"
- Windows Docker Desktop may require additional configuration

## 🚀 Future Enhancements

- [ ] Authentication for private registries
- [ ] Update notifications via webhook
- [ ] Container restart/update actions
- [ ] Export reports
- [ ] Filter and search capabilities
- [ ] Email/Slack notifications

## 💬 Feedback

If you encounter issues or have suggestions, feel free to open an issue!

---

Made with 💙 for the Docker community
