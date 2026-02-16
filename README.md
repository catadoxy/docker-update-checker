# 🐳 Docker Update Checker

A modern, cyberpunk-themed web interface to monitor your Docker containers and check for available updates in real-time.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)

## ✨ Features

- 🔍 **Real-time monitoring** of all running Docker containers
- 🆕 **Update detection** by comparing local images with Docker Hub
- 🎨 **Cyberpunk terminal aesthetic** with neon colors and animations
- 📊 **Statistics dashboard** showing containers status at a glance
- 🔄 **Auto-refresh** refresh interval can be set (0 to disable autorefresh)
- 🚀 **Fast and lightweight** - pure React frontend, minimal Node.js backend
- 🐋 **Docker-compatible** - works with any Docker version

## 🖼️ Interface

The interface features:
- Animated grid background with scanline effects
- Glowing neon borders for containers with updates available
- Real-time status badges
- Container cards with image, version, and status information
- Responsive design for desktop and mobile

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Access to Docker socket (`/var/run/docker.sock`)

### Installation

1. **Clone the repository:**
```bash
   git clone https://github.com/catadoxy/docker-update-checker.git
   cd docker-update-checker
```

2. **Start with Docker Compose:**
```bash
   docker compose up -d
```



3. **Access the interface:**
   
   Open your browser and navigate to:
   - From the same machine: `http://localhost:3456`
   - From another device on your network: `http://YOUR_SERVER_IP:3456`

## 🔧 Configuration

### Changing the Port

Edit `docker-compose.yml` and modify the port mapping:
```yaml
ports:
  - "8080:3456"  # Change 8080 to your desired port
```

Then restart:
```bash
docker compose down
docker compose up -d
```

Access the interface at `http://localhost:8080` (or whatever port you chose).

### Docker Socket Path

If your Docker socket is in a different location, update `docker-compose.yml`:
```yaml
volumes:
  - /path/to/docker.sock:/var/run/docker.sock:ro  # Update this path
```

### API Endpoint

The frontend defaults to `http://localhost:3456`. You can change this in the interface by editing the endpoint input field.

## 📡 API Endpoints

### `GET /api/containers`

Returns a list of all running containers with update status.

**Response:**
```json
{
  "success": true,
  "containers": [
    {
      "id": "abc123def456",
      "name": "my-app",
      "image": "nginx:latest",
      "currentTag": "latest",
      "latestTag": "latest",
      "status": "Up 2 hours",
      "state": "running",
      "updateAvailable": false,
      "currentDigest": "sha256:abc123",
      "latestDigest": "sha256:abc123"
    }
  ],
  "timestamp": "2024-02-16T10:30:00.000Z"
}
```

### `GET /api/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-02-16T10:30:00.000Z"
}
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

- Some private registries may not be accessible
- Images with custom registries (not Docker Hub) won't be checked
- Images without tags or with SHA digests may show as "unknown"

### CORS errors

- Make sure you're opening the HTML file in a browser (not viewing source)
- Check that the backend is running and accessible
- Try using a local web server: `python3 -m http.server 8000`

## 🔒 Security Notes

- This tool requires access to the Docker socket, which provides root-level access
- Only run this on trusted networks or localhost
- Do not expose the API port (3456) to the internet without proper authentication
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
┌──────────▼──────────┐     ┌─────────────────┐
│   Docker Socket     │────▶│  Docker Hub API │
│  /var/run/docker    │     │  (registry)     │
└─────────────────────┘     └─────────────────┘
```

## 🤝 How It Works

1. **Backend** connects to Docker via `/var/run/docker.sock`
2. Lists all running containers using Docker API
3. For each container:
   - Extracts image name and tag
   - Gets the current image digest (SHA)
   - Queries Docker Hub registry for the latest digest
   - Compares digests to determine if update is available
4. **Frontend** polls the API every 60 seconds and displays results

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

- Private registries are not yet supported
- Authentication for private images is not implemented
- Only works with Docker Hub (not other registries like ghcr.io, gcr.io, etc.)
- Windows Docker Desktop may require additional configuration

## 🚀 Future Enhancements

- [ ] Support for private registries
- [ ] Authentication for private images
- [ ] Update notifications via webhook
- [ ] Container restart/update actions
- [ ] Export reports
- [ ] Filter and search capabilities
- [ ] Multi-registry support (ghcr.io, gcr.io, quay.io)
- [ ] Email/Slack notifications

## 💬 Feedback

If you encounter issues or have suggestions, feel free to open an issue!

---

Made with 💙 for the Docker community
