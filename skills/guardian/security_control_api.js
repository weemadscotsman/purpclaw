// GUARDIAN Security Control API
// REST API for security operations in PURPCLAW swarm

const express = require('express');
const SecurityScanner = require('./security_scanner');
const VoiceSecurityHandler = require('./voice_security_handler');

class SecurityControlAPI {
  constructor(port = 7784) {
    this.port = port;
    this.app = express();
    this.scanner = new SecurityScanner();
    this.voiceHandler = null;

    // Middleware
    this.app.use(express.json());
    this.app.use(this.logRequests.bind(this));

    // Routes
    this.setupRoutes();
  }

  // Log all requests
  logRequests(req, res, next) {
    console.log(`🔒 [GUARDIAN API] ${req.method} ${req.path}`);
    next();
  }

  // Setup API routes
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'guardian-security',
        timestamp: new Date().toISOString()
      });
    });

    // Security scan endpoints
    this.app.post('/scan/full', async (req, res) => {
      try {
        const report = await this.scanner.scanProject();
        res.json({
          success: true,
          report: report
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    this.app.post('/scan/secrets', async (req, res) => {
      try {
        await this.scanner.scanForSecrets(process.cwd());
        const secrets = this.scanner.scanResults.secretsFound;

        res.json({
          success: true,
          count: secrets.length,
          secrets: secrets,
          criticalCount: secrets.filter(s => s.severity === 'CRITICAL').length
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    this.app.post('/scan/dependencies', async (req, res) => {
      try {
        await this.scanner.checkDependencies(process.cwd());
        const vulnerabilities = this.scanner.scanResults.vulnerabilities.filter(v => v.type === 'DEPENDENCY');

        res.json({
          success: true,
          count: vulnerabilities.length,
          vulnerabilities: vulnerabilities,
          criticalCount: vulnerabilities.filter(v => v.severity === 'CRITICAL').length
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    this.app.post('/scan/emergency', async (req, res) => {
      try {
        const emergencyReport = await this.scanner.emergencyScan(process.cwd());

        res.json({
          success: true,
          emergency: true,
          report: emergencyReport
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Security status
    this.app.get('/status', (req, res) => {
      const status = {
        scanner: 'active',
        lastScan: this.scanner.scanResults.timestamp,
        vulnerabilities: this.scanner.scanResults.vulnerabilities.length,
        secrets: this.scanner.scanResults.secretsFound.length,
        voiceHandler: this.voiceHandler ? 'active' : 'inactive'
      };

      res.json({
        success: true,
        status: status
      });
    });

    // Voice handler control
    this.app.post('/voice/start', (req, res) => {
      if (!this.voiceHandler) {
        this.voiceHandler = new VoiceSecurityHandler(7779);
        this.voiceHandler.start();

        res.json({
          success: true,
          message: 'Voice security handler started on port 7779'
        });
      } else {
        res.json({
          success: false,
          message: 'Voice handler already running'
        });
      }
    });

    this.app.post('/voice/stop', (req, res) => {
      if (this.voiceHandler) {
        this.voiceHandler.stop();
        this.voiceHandler = null;

        res.json({
          success: true,
          message: 'Voice security handler stopped'
        });
      } else {
        res.json({
          success: false,
          message: 'Voice handler not running'
        });
      }
    });

    // Security recommendations
    this.app.get('/recommendations', (req, res) => {
      const recommendations = [
        {
          priority: 'HIGH',
          action: 'Run regular security scans',
          description: 'Schedule automated security scans after code changes'
        },
        {
          priority: 'HIGH',
          action: 'Use environment variables for secrets',
          description: 'Never hardcode API keys or passwords'
        },
        {
          priority: 'MEDIUM',
          action: 'Keep dependencies updated',
          description: 'Regularly run npm audit and update packages'
        },
        {
          priority: 'MEDIUM',
          action: 'Validate all user inputs',
          description: 'Sanitize and validate all user-provided data'
        },
        {
          priority: 'LOW',
          action: 'Implement rate limiting',
          description: 'Add rate limiting to API endpoints'
        }
      ];

      res.json({
        success: true,
        recommendations: recommendations
      });
    });

    // Error handling
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });

    this.app.use((error, req, res, next) => {
      console.error('🔒 [GUARDIAN API Error]', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    });
  }

  // Start the API server
  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`🔒 GUARDIAN Security Control API running on port ${this.port}`);
        resolve();
      }).on('error', reject);
    });
  }

  // Stop the API server
  stop() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((error) => {
          if (error) {
            reject(error);
          } else {
            console.log('🛑 GUARDIAN Security Control API stopped');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  // Get API information
  getInfo() {
    return {
      name: 'GUARDIAN Security Control API',
      port: this.port,
      endpoints: [
        { method: 'GET', path: '/health', description: 'Health check' },
        { method: 'POST', path: '/scan/full', description: 'Run full security scan' },
        { method: 'POST', path: '/scan/secrets', description: 'Scan for hardcoded secrets' },
        { method: 'POST', path: '/scan/dependencies', description: 'Audit dependencies' },
        { method: 'POST', path: '/scan/emergency', description: 'Emergency security scan' },
        { method: 'GET', path: '/status', description: 'Get security status' },
        { method: 'POST', path: '/voice/start', description: 'Start voice handler' },
        { method: 'POST', path: '/voice/stop', description: 'Stop voice handler' },
        { method: 'GET', path: '/recommendations', description: 'Get security recommendations' }
      ]
    };
  }
}

// Export for use in PURPCLAW swarm
module.exports = SecurityControlAPI;

// If run directly, start the API server
if (require.main === module) {
  const api = new SecurityControlAPI();

  api.start().then(() => {
    console.log('✅ GUARDIAN Security API ready');
    console.log('📋 Available endpoints:');
    api.getInfo().endpoints.forEach(endpoint => {
      console.log(`  ${endpoint.method} http://localhost:${api.port}${endpoint.path} - ${endpoint.description}`);
    });
  }).catch(error => {
    console.error('❌ Failed to start GUARDIAN Security API:', error);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down GUARDIAN Security API...');
    try {
      await api.stop();
      process.exit(0);
    } catch (error) {
      console.error('Error shutting down:', error);
      process.exit(1);
    }
  });
}