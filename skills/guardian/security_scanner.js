// GUARDIAN Security Scanner
// Integrated security scanning for PURPCLAW swarm

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class SecurityScanner {
  constructor() {
    this.scanResults = {
      timestamp: new Date().toISOString(),
      vulnerabilities: [],
      secretsFound: [],
      dependencies: {},
      recommendations: []
    };
  }

  // Main scanning function
  async scanProject(projectPath = process.cwd()) {
    console.log(`🔒 GUARDIAN Security Scan initiated at ${new Date().toLocaleTimeString()}`);

    try {
      // Run all security checks
      await this.scanForSecrets(projectPath);
      await this.checkDependencies(projectPath);
      await this.scanForVulnerabilities(projectPath);
      await this.checkEnvironment(projectPath);

      // Generate report
      const report = this.generateReport();

      console.log('✅ Security scan completed');
      console.log(`📊 Found: ${this.scanResults.vulnerabilities.length} vulnerabilities, ${this.scanResults.secretsFound.length} secrets`);

      return report;
    } catch (error) {
      console.error('❌ Security scan failed:', error.message);
      throw error;
    }
  }

  // Scan for hardcoded secrets
  async scanForSecrets(projectPath) {
    console.log('🔍 Scanning for hardcoded secrets...');

    const secretPatterns = [
      {
        name: 'API Key',
        pattern: /(api[_-]?key|apikey)\s*[:=]\s*["'][^"']{10,}["']/gi,
        severity: 'CRITICAL'
      },
      {
        name: 'Password',
        pattern: /(password|passwd|pwd)\s*[:=]\s*["'][^"']{6,}["']/gi,
        severity: 'CRITICAL'
      },
      {
        name: 'Token',
        pattern: /(token|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["'][^"']{10,}["']/gi,
        severity: 'CRITICAL'
      },
      {
        name: 'Secret',
        pattern: /(secret|client[_-]?secret)\s*[:=]\s*["'][^"']{8,}["']/gi,
        severity: 'CRITICAL'
      },
      {
        name: 'Database URL',
        pattern: /(database[_-]?url|db[_-]?url|connection[_-]?string)\s*[:=]\s*["'][^"']{10,}["']/gi,
        severity: 'HIGH'
      }
    ];

    // Scan JavaScript/TypeScript files
    const jsFiles = this.findFiles(projectPath, ['.js', '.ts', '.jsx', '.tsx']);

    for (const file of jsFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');

        for (const pattern of secretPatterns) {
          const matches = content.match(pattern.pattern);
          if (matches) {
            matches.forEach(match => {
              this.scanResults.secretsFound.push({
                file: path.relative(projectPath, file),
                pattern: pattern.name,
                match: match.substring(0, 50) + '...', // Truncate for security
                severity: pattern.severity,
                line: this.getLineNumber(content, match)
              });
            });
          }
        }
      } catch (error) {
        console.warn(`⚠️ Could not scan file ${file}: ${error.message}`);
      }
    }
  }

  // Check npm dependencies for vulnerabilities
  async checkDependencies(projectPath) {
    console.log('📦 Checking dependencies for vulnerabilities...');

    const path = require('path');
    const safeName = projectPath.replace(/[^a-zA-Z0-9_-]/g, '');
    if (safeName !== projectPath || projectPath.includes('..')) {
      return reject(new Error('Invalid project path'));
    }

    return new Promise((resolve, reject) => {
      exec('npm audit --json', { cwd: projectPath }, (error, stdout, stderr) => {
        if (error) {
          // npm audit might exit with non-zero if vulnerabilities found
          if (stdout) {
            try {
              const auditResult = JSON.parse(stdout);
              this.scanResults.dependencies = auditResult;

              // Extract vulnerabilities
              if (auditResult.vulnerabilities) {
                Object.entries(auditResult.vulnerabilities).forEach(([pkg, info]) => {
                  if (info.severity === 'critical' || info.severity === 'high') {
                    this.scanResults.vulnerabilities.push({
                      type: 'DEPENDENCY',
                      severity: info.severity.toUpperCase(),
                      package: pkg,
                      description: info.via?.[0]?.title || 'Unknown vulnerability',
                      recommendation: `Update ${pkg} to ${info.fixAvailable?.version || 'latest version'}`
                    });
                  }
                });
              }
            } catch (parseError) {
              console.warn('⚠️ Could not parse npm audit output');
            }
          }
          resolve();
        } else if (stdout) {
          try {
            const auditResult = JSON.parse(stdout);
            this.scanResults.dependencies = auditResult;
          } catch (parseError) {
            console.warn('⚠️ Could not parse npm audit output');
          }
          resolve();
        } else {
          resolve();
        }
      });
    });
  }

  // Scan for common code vulnerabilities
  async scanForVulnerabilities(projectPath) {
    console.log('🛡️ Scanning for code vulnerabilities...');

    const vulnerabilityPatterns = [
      {
        name: 'Potential SQL Injection',
        pattern: /\$\{.*?\}.*?(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE).*?\}/gi,
        severity: 'CRITICAL',
        fileTypes: ['.js', '.ts']
      },
      {
        name: 'Potential Command Injection',
        pattern: /(exec|spawn|execFile)\(.*?(userInput|req\.|body\.|params\.)/gi,
        severity: 'CRITICAL',
        fileTypes: ['.js', '.ts']
      },
      {
        name: 'Potential XSS',
        pattern: /innerHTML\s*=\s*.*?(userInput|req\.|body\.|params\.)/gi,
        severity: 'HIGH',
        fileTypes: ['.js', '.ts', '.html']
      },
      {
        name: 'Unvalidated Redirect',
        pattern: /res\.redirect\(.*?(req\.|body\.|params\.|query\.)/gi,
        severity: 'MEDIUM',
        fileTypes: ['.js', '.ts']
      },
      {
        name: 'Debug Code Left In',
        pattern: /console\.(log|debug|info)\(.*?(password|token|secret|key)/gi,
        severity: 'MEDIUM',
        fileTypes: ['.js', '.ts']
      }
    ];

    // Scan all code files
    const codeFiles = this.findFiles(projectPath, ['.js', '.ts', '.jsx', '.tsx', '.html']);

    for (const file of codeFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const fileExt = path.extname(file).toLowerCase();

        for (const pattern of vulnerabilityPatterns) {
          if (pattern.fileTypes.includes(fileExt)) {
            const matches = content.match(pattern.pattern);
            if (matches) {
              matches.forEach(match => {
                this.scanResults.vulnerabilities.push({
                  type: 'CODE',
                  severity: pattern.severity,
                  file: path.relative(projectPath, file),
                  description: pattern.name,
                  match: match.substring(0, 100) + '...',
                  line: this.getLineNumber(content, match),
                  recommendation: 'Review and fix the vulnerable code pattern'
                });
              });
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Could not scan file ${file}: ${error.message}`);
      }
    }
  }

  // Check environment configuration
  async checkEnvironment(projectPath) {
    console.log('🌍 Checking environment configuration...');

    // Check for .env files that might be committed
    const envFiles = this.findFiles(projectPath, ['.env']);

    for (const file of envFiles) {
      const relativePath = path.relative(projectPath, file);

      // Check if .env is in .gitignore
      const gitignorePath = path.join(projectPath, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        if (!gitignoreContent.includes('.env')) {
          this.scanResults.recommendations.push({
            type: 'CONFIGURATION',
            severity: 'MEDIUM',
            description: '.env file not in .gitignore',
            recommendation: 'Add .env to .gitignore to prevent committing secrets'
          });
        }
      }

      // Check .env.example exists
      const envExamplePath = path.join(projectPath, '.env.example');
      if (!fs.existsSync(envExamplePath)) {
        this.scanResults.recommendations.push({
          type: 'CONFIGURATION',
          severity: 'LOW',
          description: 'No .env.example file found',
          recommendation: 'Create .env.example with placeholder values for required environment variables'
        });
      }
    }
  }

  // Helper: Find files by extension
  findFiles(dir, extensions) {
    let results = [];

    try {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip node_modules and .git
          if (item !== 'node_modules' && item !== '.git' && !item.startsWith('.')) {
            results = results.concat(this.findFiles(fullPath, extensions));
          }
        } else {
          const ext = path.extname(item).toLowerCase();
          if (extensions.includes(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Could not read directory ${dir}: ${error.message}`);
    }

    return results;
  }

  // Helper: Get line number of match in content
  getLineNumber(content, match) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(match.substring(0, 50))) {
        return i + 1;
      }
    }
    return null;
  }

  // Generate security report
  generateReport() {
    const report = {
      summary: {
        totalVulnerabilities: this.scanResults.vulnerabilities.length,
        totalSecrets: this.scanResults.secretsFound.length,
        criticalCount: this.scanResults.vulnerabilities.filter(v => v.severity === 'CRITICAL').length +
                      this.scanResults.secretsFound.filter(s => s.severity === 'CRITICAL').length,
        highCount: this.scanResults.vulnerabilities.filter(v => v.severity === 'HIGH').length +
                   this.scanResults.secretsFound.filter(s => s.severity === 'HIGH').length,
        timestamp: this.scanResults.timestamp
      },
      vulnerabilities: this.scanResults.vulnerabilities,
      secrets: this.scanResults.secretsFound,
      recommendations: this.scanResults.recommendations,
      status: this.scanResults.vulnerabilities.length === 0 &&
              this.scanResults.secretsFound.length === 0 ? 'PASS' : 'FAIL'
    };

    return report;
  }

  // Emergency scan - quick but thorough
  async emergencyScan(projectPath) {
    console.log('🚨 EMERGENCY SECURITY SCAN INITIATED');

    // Focus on critical checks only
    await this.scanForSecrets(projectPath);

    const criticalSecrets = this.scanResults.secretsFound.filter(s => s.severity === 'CRITICAL');
    const criticalVulns = this.scanResults.vulnerabilities.filter(v => v.severity === 'CRITICAL');

    if (criticalSecrets.length > 0 || criticalVulns.length > 0) {
      console.log('❌ CRITICAL SECURITY ISSUES FOUND');
      return {
        emergency: true,
        criticalIssues: [...criticalSecrets, ...criticalVulns],
        action: 'IMMEDIATE ACTION REQUIRED - STOP DEPLOYMENT'
      };
    }

    return {
      emergency: true,
      criticalIssues: [],
      action: 'No critical issues found'
    };
  }
}

// Export for use in PURPCLAW swarm
module.exports = SecurityScanner;

// If run directly, scan current directory
if (require.main === module) {
  const scanner = new SecurityScanner();
  scanner.scanProject()
    .then(report => {
      console.log('\n' + '='.repeat(50));
      console.log('SECURITY SCAN REPORT');
      console.log('='.repeat(50));
      console.log(JSON.stringify(report, null, 2));

      if (report.status === 'FAIL') {
        process.exit(1);
      } else {
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('Scan failed:', error);
      process.exit(1);
    });
}