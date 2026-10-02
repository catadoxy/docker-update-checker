const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const {
    detectRegistry,
    parseImage,
    getRemoteDigest,
    getLatestVersionInfo,
} = require('./registry');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.use(cors());
app.use(express.json());

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/containers', async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: false });

        const containerData = await Promise.all(
            containers.map(async (containerInfo) => {
                const container = docker.getContainer(containerInfo.Id);
                const inspect = await container.inspect();

                const imageName = inspect.Config.Image;
                const { image, tag } = parseImage(imageName);

                // Local digest - used only to detect if a floating tag moved
                const imageDetails = await docker.getImage(inspect.Image).inspect();
                const currentDigest = imageDetails.RepoDigests?.[0]?.split('@')[1] || null;

                // Current version from image labels, falling back to the tag
                const currentVersion = imageDetails.Config?.Labels?.['org.opencontainers.image.version']
                    || imageDetails.Config?.Labels?.['version']
                    || tag;

                const registry = detectRegistry(image);
                const registrySupported = registry.type !== 'unsupported';

                let remoteDigest = null;
                let latestVersion = null;
                let bump = null;
                let newer = false;

                if (registrySupported) {
                    const [digest, versionInfo] = await Promise.all([
                        getRemoteDigest(image, tag),
                        getLatestVersionInfo(image, tag),
                    ]);
                    remoteDigest = digest;
                    latestVersion = versionInfo.latest;
                    bump = versionInfo.bump;
                    newer = versionInfo.newer;
                }

                // A floating tag (latest, stable, ...) moved upstream...
                const digestChanged = !!(remoteDigest && currentDigest && remoteDigest !== currentDigest);
                // ...or a newer stable version exists for a pinned/floating version tag.
                const updateAvailable = registrySupported && (digestChanged || newer);
                const updateType = updateAvailable ? (newer ? bump : 'digest') : null;

                return {
                    id: containerInfo.Id.substring(0, 12),
                    name: containerInfo.Names[0].replace('/', ''),
                    image: imageName,
                    currentTag: tag,           // The tag the container is using (e.g. latest, 1.2.3)
                    currentVersion,            // Human-friendly version from labels, else the tag
                    latestVersion: latestVersion || 'unknown', // Newest stable tag in the same variant
                    registry: registry.type,
                    registrySupported,
                    status: containerInfo.Status,
                    state: containerInfo.State,
                    updateAvailable,
                    updateType,                // 'patch' | 'minor' | 'major' | 'digest' | null
                };
            })
        );

        res.json({
            success: true,
            containers: containerData,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        console.error('Error fetching containers:', error);
        res.status(500).json({
            error: error.message,
            details: 'Failed to connect to Docker. Make sure Docker is running and accessible.',
        });
    }
});

app.get('/api/config', (req, res) => {
    let checkInterval = 300;
    if (process.env.CHECK_INTERVAL !== undefined) {
        const parsed = parseInt(process.env.CHECK_INTERVAL);
        if (!isNaN(parsed) && parsed >= 0) checkInterval = parsed;
    }
    res.json({
        checkInterval,
        checkIntervalMs: checkInterval * 1000,
        autoRefreshEnabled: checkInterval > 0,
        timestamp: new Date().toISOString(),
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Locate the UI in both the Docker layout (/app/docker-update-checker.html)
// and the local dev layout (repo root, one level above src/).
const htmlCandidates = [
    path.join(__dirname, 'docker-update-checker.html'),
    path.join(__dirname, '..', 'docker-update-checker.html'),
];

app.get('/', (req, res) => {
    const filePath = htmlCandidates.find((p) => fs.existsSync(p));
    if (!filePath) {
        return res.status(500).send('UI file (docker-update-checker.html) not found');
    }
    res.sendFile(filePath);
});

app.get('/api', (req, res) => {
    res.json({
        name: 'Docker Update Checker API',
        version: '1.0.0',
        endpoints: {
            containers: '/api/containers',
            config: '/api/config',
            health: '/api/health',
        },
    });
});

// ─── Server Startup ───────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3456;

let CHECK_INTERVAL = 300;
if (process.env.CHECK_INTERVAL !== undefined) {
    const parsed = parseInt(process.env.CHECK_INTERVAL);
    if (!isNaN(parsed) && parsed >= 0) CHECK_INTERVAL = parsed;
}

app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║   Docker Update Checker Server        ║`);
    console.log(`╚════════════════════════════════════════╝\n`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/containers`);
    console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🐋 Supported registries: Docker Hub, ghcr.io, lscr.io`);
    if (CHECK_INTERVAL === 0) {
        console.log(`⏱️  Auto-refresh: DISABLED (manual refresh only)`);
    } else {
        console.log(`⏱️  Check interval: ${CHECK_INTERVAL} seconds (${CHECK_INTERVAL / 60} minutes)`);
    }
    console.log(`\n💡 Open your browser at http://localhost:${PORT}\n`);
});
