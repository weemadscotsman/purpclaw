// GUARDIAN Voice Security Handler
// Handles security-related voice commands for PURPCLAW swarm

const SecurityScanner = require('./security_scanner');
const WebSocket = require('ws');

class VoiceSecurityHandler {
  constructor(port = 7779) {
    this.scanner = new SecurityScanner();
    this.port = port;
    this.wss = null;
    this.commands = {
      'scan security': this.handleSecurityScan.bind(this),
      'check secrets': this.handleSecretCheck.bind(this),
      'audit dependencies': this.handleDependencyAudit.bind(this),
      'validate inputs': this.handleInputValidation.bind(this),
      'emergency': this.handleEmergency.bind(this),
      'security status': this.handleStatus.bind(this)
    };
  }

  // Start listening for voice commands
  start() {
    console.log(`🔒 GUARDIAN Security Voice Handler starting on port ${this.port}`);

    this.wss = new WebSocket.Server({ port: this.port });

    this.wss.on('connection', (ws) => {
      console.log('🔗 New voice command connection');

      ws.on('message', async (message) => {
        try {
          const command = JSON.parse(message.toString());
          await this.handleCommand(command, ws);
        } catch (error) {
          console.error('Error processing voice command:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process command',
            error: error.message
          }));
        }
      });

      ws.on('close', () => {
        console.log('🔌 Voice command connection closed');
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        message: 'GUARDIAN Security Handler ready',
        commands: Object.keys(this.commands)
      }));
    });

    console.log(`✅ GUARDIAN listening for voice commands on port ${this.port}`);
  }

  // Handle incoming voice commands
  async handleCommand(command, ws) {
    const { text, type = 'voice' } = command;

    console.log(`🎤 Voice command received: "${text}"`);

    // Find matching command
    const matchedCommand = Object.keys(this.commands).find(cmd =>
      text.toLowerCase().includes(cmd.toLowerCase())
    );

    if (matchedCommand) {
      await this.commands[matchedCommand](text, ws);
    } else {
      ws.send(JSON.stringify({
        type: 'response',
        message: 'Unknown security command. Available commands: ' + Object.keys(this.commands).join(', ')
      }));
    }
  }

  // Handle security scan command
  async handleSecurityScan(commandText, ws) {
    ws.send(JSON.stringify({
      type: 'status',
      message: 'Starting comprehensive security scan...'
    }));

    try {
      const report = await this.scanner.scanProject();

      // Send summary
      ws.send(JSON.stringify({
        type: 'report',
        message: `Security scan completed. Found ${report.summary.totalVulnerabilities} vulnerabilities and ${report.summary.totalSecrets} secrets.`,
        summary: report.summary,
        status: report.status
      }));

      // Send critical issues if any
      const criticalIssues = [
        ...report.vulnerabilities.filter(v => v.severity === 'CRITICAL'),
        ...report.secrets.filter(s => s.severity === 'CRITICAL')
      ];

      if (criticalIssues.length > 0) {
        ws.send(JSON.stringify({
          type: 'alert',
          severity: 'CRITICAL',
          message: `Found ${criticalIssues.length} CRITICAL security issues!`,
          issues: criticalIssues.slice(0, 5) // Send first 5 for brevity
        }));
      }

      // Send recommendations
      if (report.recommendations.length > 0) {
        ws.send(JSON.stringify({
          type: 'recommendations',
          message: `Security recommendations:`,
          recommendations: report.recommendations
        }));
      }

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Security scan failed',
        error: error.message
      }));
    }
  }

  // Handle secret check command
  async handleSecretCheck(commandText, ws) {
    ws.send(JSON.stringify({
      type: 'status',
      message: 'Scanning for hardcoded secrets...'
    }));

    try {
      await this.scanner.scanForSecrets(process.cwd());

      const secrets = this.scanner.scanResults.secretsFound;

      if (secrets.length === 0) {
        ws.send(JSON.stringify({
          type: 'response',
          message: 'No hardcoded secrets found. Good job!'
        }));
      } else {
        const criticalSecrets = secrets.filter(s => s.severity === 'CRITICAL');
        const highSecrets = secrets.filter(s => s.severity === 'HIGH');

        ws.send(JSON.stringify({
          type: 'report',
          message: `Found ${secrets.length} hardcoded secrets (${criticalSecrets.length} CRITICAL, ${highSecrets.length} HIGH)`,
          secrets: secrets.slice(0, 10), // Limit response size
          criticalCount: criticalSecrets.length,
          recommendation: 'Move all secrets to environment variables immediately!'
        }));

        if (criticalSecrets.length > 0) {
          ws.send(JSON.stringify({
            type: 'alert',
            severity: 'CRITICAL',
            message: 'CRITICAL: Hardcoded secrets found! This is a security emergency.',
            action: 'Rotate all exposed credentials immediately!'
          }));
        }
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Secret scan failed',
        error: error.message
      }));
    }
  }

  // Handle dependency audit command
  async handleDependencyAudit(commandText, ws) {
    ws.send(JSON.stringify({
      type: 'status',
      message: 'Auditing dependencies for vulnerabilities...'
    }));

    try {
      await this.scanner.checkDependencies(process.cwd());

      const vulnerabilities = this.scanner.scanResults.vulnerabilities.filter(v => v.type === 'DEPENDENCY');

      if (vulnerabilities.length === 0) {
        ws.send(JSON.stringify({
          type: 'response',
          message: 'No vulnerable dependencies found. Dependencies are secure!'
        }));
      } else {
        const criticalVulns = vulnerabilities.filter(v => v.severity === 'CRITICAL');
        const highVulns = vulnerabilities.filter(v => v.severity === 'HIGH');

        ws.send(JSON.stringify({
          type: 'report',
          message: `Found ${vulnerabilities.length} vulnerable dependencies (${criticalVulns.length} CRITICAL, ${highVulns.length} HIGH)`,
          vulnerabilities: vulnerabilities.slice(0, 10),
          recommendation: 'Run "npm audit fix" to automatically fix vulnerabilities'
        }));

        if (criticalVulns.length > 0) {
          ws.send(JSON.stringify({
            type: 'alert',
            severity: 'CRITICAL',
            message: 'CRITICAL: Vulnerable dependencies found!',
            action: 'Update dependencies immediately before deployment!'
          }));
        }
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Dependency audit failed',
        error: error.message
      }));
    }
  }

  // Handle input validation check
  async handleInputValidation(commandText, ws) {
    ws.send(JSON.stringify({
      type: 'status',
      message: 'Checking input validation patterns...'
    }));

    try {
      // This would be more comprehensive in a real implementation
      // For now, we'll run a focused vulnerability scan
      await this.scanner.scanForVulnerabilities(process.cwd());

      const inputVulns = this.scanner.scanResults.vulnerabilities.filter(v =>
        v.description.includes('Injection') || v.description.includes('XSS')
      );

      if (inputVulns.length === 0) {
        ws.send(JSON.stringify({
          type: 'response',
          message: 'No input validation vulnerabilities found. Good!'
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'report',
          message: `Found ${inputVulns.length} input validation vulnerabilities`,
          vulnerabilities: inputVulns,
          recommendation: 'Review and fix all input validation code. Use parameterized queries and sanitize user input.'
        }));
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Input validation check failed',
        error: error.message
      }));
    }
  }

  // Handle emergency command
  async handleEmergency(commandText, ws) {
    ws.send(JSON.stringify({
      type: 'alert',
      severity: 'EMERGENCY',
      message: '🚨 EMERGENCY SECURITY PROTOCOL ACTIVATED 🚨'
    }));

    try {
      const emergencyReport = await this.scanner.emergencyScan(process.cwd());

      if (emergencyReport.criticalIssues.length > 0) {
        ws.send(JSON.stringify({
          type: 'emergency',
          severity: 'CRITICAL',
          message: 'CRITICAL SECURITY ISSUES DETECTED!',
          issues: emergencyReport.criticalIssues,
          action: 'IMMEDIATE ACTION REQUIRED: Stop all deployments, rotate credentials, apply fixes!'
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'response',
          severity: 'INFO',
          message: 'Emergency scan complete. No critical issues found.',
          action: 'Continue with caution. Monitor for security events.'
        }));
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        severity: 'CRITICAL',
        message: 'EMERGENCY SCAN FAILED!',
        error: error.message,
        action: 'Manual security review required immediately!'
      }));
    }
  }

  // Handle status command
  async handleStatus(commandText, ws) {
    const status = {
      scanner: 'active',
      port: this.port,
      commands: Object.keys(this.commands),
      lastScan: this.scanner.scanResults.timestamp,
      vulnerabilities: this.scanner.scanResults.vulnerabilities.length,
      secrets: this.scanner.scanResults.secretsFound.length
    };

    ws.send(JSON.stringify({
      type: 'status',
      message: 'GUARDIAN Security Handler Status',
      status: status
    }));
  }

  // Stop the handler
  stop() {
    if (this.wss) {
      this.wss.close();
      console.log('🛑 GUARDIAN Security Voice Handler stopped');
    }
  }
}

// Export for use in PURPCLAW swarm
module.exports = VoiceSecurityHandler;

// If run directly, start the voice handler
if (require.main === module) {
  const handler = new VoiceSecurityHandler();
  handler.start();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down GUARDIAN Security Handler...');
    handler.stop();
    process.exit(0);
  });
}