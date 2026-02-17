const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.use(cors());
app.use(express.json());

// ─── Registry Detection & Auth ────────────────────────────────────────────────

function detectRegistry(image) {
    if (image.startsWith('ghcr.io/')) {
        return {
            type: 'ghcr',
            registry: 'ghcr.io',
            authUrl: `https://ghcr.io/token?service=ghcr.io&scope=repository:${image.replace('ghcr.io/', '')}:pull`,
            apiBase: 'https://ghcr.io/v2'
        };
    } else if (image.startsWith('lscr.io/')) {
        return {
            type: 'lscr',
            registry: 'lscr.io',
            authUrl: `https://lscr.io/token?service=lscr.io&scope=repository:${image.replace('lscr.io/', '')}:pull`,
            apiBase: 'https://lscr.io/v2'
        };
    } else {
        const stripped = image.replace('docker.io/', '');
        const fullImage = stripped.includes('/') ? stripped : `library/${stripped}`;
        return {
            type: 'dockerhub',
            registry: 'registry-1.docker.io',
            authUrl: `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${fullImage}:pull`,
            apiBase: 'https://registry-1.docker.io/v2'
        };
    }
}

async function getRegistryToken(image) {
    const registry = detectRegistry(image);
    try {
        const response = await axios.get(registry.authUrl, { timeout: 5000 });
        return { token: response.data.token, registry };
    } catch (error) {
        console.error(`Failed to get token for ${image}:`, error.message);
        return null;
    }
}

function buildImagePath(rawImage, registryType) {
    const imagePath = rawImage
        .replace('ghcr.io/', '')
        .replace('lscr.io/', '')
        .replace('docker.io/', '');
    return (registryType === 'dockerhub' && !imagePath.includes('/'))
        ? `library/${imagePath}`
        : imagePath;
}

// ─── Version Helpers ──────────────────────────────────────────────────────────

// Returns true if a tag looks like a real version (requires at least major.minor)
function isVersionTag(t) {
    return /^\d+\.\d+(\.\d+)*(-\w+)?$/.test(t) ||
           /^v\d+\.\d+(\.\d+)*(-\w+)?$/.test(t);
}

function sortVersionsDesc(tags) {
    return [...tags].sort((a, b) => {
        const cleanA = a.replace(/^v/, '').split('-')[0];
        const cleanB = b.replace(/^v/, '').split('-')[0];
        const partsA = cleanA.split('.').map(Number);
        const partsB = cleanB.split('.').map(Number);
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const numA = partsA[i] || 0;
            const numB = partsB[i] || 0;
            if (numA !== numB) return numB - numA;
        }
        return 0;
    });
}

// ─── Registry API Calls ───────────────────────────────────────────────────────

// Try multiple manifest types to get a digest that matches the locally stored one
async function getDigestForTag(apiBase, fullImagePath, tag, token) {
    const acceptTypes = [
        'application/vnd.oci.image.index.v1+json',
        'application/vnd.docker.distribution.manifest.list.v2+json',
        'application/vnd.docker.distribution.manifest.v2+json',
    ];
    for (const accept of acceptTypes) {
        try {
            const response = await axios.head(
                `${apiBase}/${fullImagePath}/manifests/${tag}`,
                {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': accept },
                    timeout: 5000
                }
            );
            const digest = response.headers['docker-content-digest'];
            if (digest) return digest;
        } catch {
            // Try next type
        }
    }
    return null;
}

// Get the remote digest for a tag - used only for update detection
async function getLatestDigest(rawImage, tag = 'latest') {
    try {
        const result = await getRegistryToken(rawImage);
        if (!result) return null;
        const { token, registry } = result;
        const fullImagePath = buildImagePath(rawImage, registry.type);
        return await getDigestForTag(registry.apiBase, fullImagePath, tag, token);
    } catch (error) {
        console.error(`Failed to get digest for ${rawImage}:${tag}:`, error.message);
        return null;
    }
}

// Get the highest version tag available on the registry
async function getLatestVersionTag(rawImage) {
    try {
        const result = await getRegistryToken(rawImage);
        if (!result) return null;
        const { token, registry } = result;
        const fullImagePath = buildImagePath(rawImage, registry.type);

        const response = await axios.get(
            `${registry.apiBase}/${fullImagePath}/tags/list`,
            {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                timeout: 5000
            }
        );

        const tags = (response.data.tags || []).filter(isVersionTag);
        if (tags.length === 0) return null;
        return sortVersionsDesc(tags)[0];
    } catch (error) {
        console.error(`Failed to get version tags for ${rawImage}:`, error.message);
        return null;
    }
}

// ─── Image Parsing ────────────────────────────────────────────────────────────

function parseImage(imageString) {
    const withoutDigest = imageString.split('@')[0];
    const lastColon = withoutDigest.lastIndexOf(':');

    if (lastColon === -1) {
        return {
            image: withoutDigest.includes('/') ? withoutDigest : `library/${withoutDigest}`,
            tag: 'latest'
        };
    }

    const imageName = withoutDigest.substring(0, lastColon);
    const tag = withoutDigest.substring(lastColon + 1);
    const fullImageName = imageName.includes('/') ? imageName : `library/${imageName}`;
    return { image: fullImageName, tag };
}

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/containers', async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: false });

        const containerData = await Promise.all(
            containers.map(async (containerInfo) => {
                const container = docker.getContainer(containerInfo.Id);
                const inspect = await container.inspect();

                const imageName = inspect.Config.Image;
                const { tag } = parseImage(imageName);
                const fullImageRef = imageName.split('@')[0].split(':')[0];

                // Local digest - used only to detect if an update exists
                const imageDetails = await docker.getImage(inspect.Image).inspect();
                const currentDigest = imageDetails.RepoDigests?.[0]?.split('@')[1] || null;

                // Remote digest for the same tag - compare to detect updates
                const remoteDigest = await getLatestDigest(fullImageRef, tag);
                const updateAvailable = !!(remoteDigest && currentDigest && remoteDigest !== currentDigest);

                // Latest version tag from the registry (shown in the UI)
                const latestVersion = await getLatestVersionTag(fullImageRef);

                return {
                    id: containerInfo.Id.substring(0, 12),
                    name: containerInfo.Names[0].replace('/', ''),
                    image: imageName,
                    currentTag: tag,          // The tag the container is using (e.g. latest, release, 1.2.3)
                    latestVersion: latestVersion || 'unknown', // Highest version tag on the registry
                    status: containerInfo.Status,
                    state: containerInfo.State,
                    updateAvailable
                };
            })
        );

        res.json({
            success: true,
            containers: containerData,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error fetching containers:', error);
        res.status(500).json({
            error: error.message,
            details: 'Failed to connect to Docker. Make sure Docker is running and accessible.'
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
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const htmlPath = path.join(__dirname, 'docker-update-checker.html');
const htmlPathDev = path.join(__dirname, '../docs/docker-update-checker.html');

app.get('/', (req, res) => {
    const filePath = fs.existsSync(htmlPath) ? htmlPath : htmlPathDev;
    res.sendFile(filePath);
});

app.get('/api', (req, res) => {
    res.json({
        name: 'Docker Update Checker API',
        version: '1.0.0',
        endpoints: {
            containers: '/api/containers',
            config: '/api/config',
            health: '/api/health'
        }
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
