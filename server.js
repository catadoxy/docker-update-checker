const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.use(cors());
app.use(express.json());

// Helper function to get Docker Hub token
async function getDockerHubToken(image) {
    try {
        const response = await axios.get(
            `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${image}:pull`,
            { timeout: 5000 }
        );
        return response.data.token;
    } catch (error) {
        console.error(`Failed to get token for ${image}:`, error.message);
        return null;
    }
}

// Helper function to get image digest from Docker Hub
async function getLatestDigest(image, tag = 'latest') {
    try {
        const token = await getDockerHubToken(image);
        if (!token) return null;

        const response = await axios.head(
            `https://registry-1.docker.io/v2/${image}/manifests/${tag}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
                },
                timeout: 5000
            }
        );

        return response.headers['docker-content-digest'];
    } catch (error) {
        console.error(`Failed to get digest for ${image}:${tag}:`, error.message);
        return null;
    }
}

// Parse image name and tag
function parseImage(imageString) {
    // Remove digest if present
    const withoutDigest = imageString.split('@')[0];
    
    // Split by last colon to get tag
    const lastColon = withoutDigest.lastIndexOf(':');
    
    if (lastColon === -1) {
        return {
            image: withoutDigest.includes('/') ? withoutDigest : `library/${withoutDigest}`,
            tag: 'latest'
        };
    }
    
    const imageName = withoutDigest.substring(0, lastColon);
    const tag = withoutDigest.substring(lastColon + 1);
    
    // Add library prefix for official images without namespace
    const fullImageName = imageName.includes('/') ? imageName : `library/${imageName}`;
    
    return { image: fullImageName, tag };
}

// API endpoint to get containers and check for updates
app.get('/api/containers', async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: false });
        
        const containerData = await Promise.all(
            containers.map(async (containerInfo) => {
                const container = docker.getContainer(containerInfo.Id);
                const inspect = await container.inspect();
                
                const imageName = inspect.Config.Image;
                const { image, tag } = parseImage(imageName);
                
                // Get current image digest
                const imageDetails = await docker.getImage(inspect.Image).inspect();
                const currentDigest = imageDetails.RepoDigests?.[0]?.split('@')[1] || null;
                
                // Get latest digest from registry
                const latestDigest = await getLatestDigest(image, tag);
                
                const updateAvailable = latestDigest && currentDigest && latestDigest !== currentDigest;
                
                return {
                    id: containerInfo.Id.substring(0, 12),
                    name: containerInfo.Names[0].replace('/', ''),
                    image: imageName,
                    currentTag: tag,
                    latestTag: tag,
                    status: containerInfo.Status,
                    state: containerInfo.State,
                    updateAvailable: updateAvailable,
                    currentDigest: currentDigest ? currentDigest.substring(0, 12) : 'unknown',
                    latestDigest: latestDigest ? latestDigest.substring(7, 19) : 'unknown'
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

// Config endpoint - returns application configuration
app.get('/api/config', (req, res) => {
    // Parse CHECK_INTERVAL, allowing 0 to disable auto-refresh
    let checkInterval = 300; // Default 5 minutes
    if (process.env.CHECK_INTERVAL !== undefined) {
        const parsed = parseInt(process.env.CHECK_INTERVAL);
        if (!isNaN(parsed) && parsed >= 0) {
            checkInterval = parsed;
        }
    }
    
    res.json({ 
        checkInterval: checkInterval,
        checkIntervalMs: checkInterval * 1000,
        autoRefreshEnabled: checkInterval > 0,
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the HTML file at the root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'docker-update-checker.html'));
});

// API info endpoint (moved to /api)
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

const PORT = process.env.PORT || 3456;

// Parse CHECK_INTERVAL, allowing 0 to disable auto-refresh
let CHECK_INTERVAL = 300; // Default 5 minutes
if (process.env.CHECK_INTERVAL !== undefined) {
    const parsed = parseInt(process.env.CHECK_INTERVAL);
    if (!isNaN(parsed) && parsed >= 0) {
        CHECK_INTERVAL = parsed;
    }
}

app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║   Docker Update Checker Server        ║`);
    console.log(`╚════════════════════════════════════════╝\n`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/containers`);
    console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    
    if (CHECK_INTERVAL === 0) {
        console.log(`⏱️  Auto-refresh: DISABLED (manual refresh only)`);
    } else {
        console.log(`⏱️  Check interval: ${CHECK_INTERVAL} seconds (${CHECK_INTERVAL / 60} minutes)`);
    }
    
    console.log(`\n💡 Open docker-update-checker.html in your browser\n`);
});
