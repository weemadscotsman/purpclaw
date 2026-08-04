'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'skills-guard-v1';

// ─── Threat patterns ─────────────────────────────────────────────────────────
// Each entry: [regexString, patternId, severity, category, description]
const THREAT_PATTERNS = [
  // ── Exfiltration: shell commands leaking secrets ──
  [/curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/,
   'env_exfil_curl', 'critical', 'exfiltration',
   'curl command interpolating secret environment variable'],
  [/wget\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/,
   'env_exfil_wget', 'critical', 'exfiltration',
   'wget command interpolating secret environment variable'],
  [/fetch\s*\([^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|API)/,
   'env_exfil_fetch', 'critical', 'exfiltration',
   'fetch() call interpolating secret environment variable'],
  [/httpx?\.(get|post|put|patch)\s*\([^\n]*(KEY|TOKEN|SECRET|PASSWORD)/,
   'env_exfil_httpx', 'critical', 'exfiltration',
   'HTTP library call with secret variable'],
  [/requests\.(get|post|put|patch)\s*\([^\n]*(KEY|TOKEN|SECRET|PASSWORD)/,
   'env_exfil_requests', 'critical', 'exfiltration',
   'requests library call with secret variable'],

  // ── Exfiltration: credential store access ──
  [/base64[^\n]*env/,
   'encoded_exfil', 'high', 'exfiltration',
   'base64 encoding combined with environment access'],
  [/\$HOME\/\.ssh|\~\/\.ssh/,
   'ssh_dir_access', 'high', 'exfiltration',
   'references user SSH directory'],
  [/\$HOME\/\.aws|\~\/\.aws/,
   'aws_dir_access', 'high', 'exfiltration',
   'references user AWS credentials directory'],
  [/\$HOME\/\.gnupg|\~\/\.gnupg/,
   'gpg_dir_access', 'high', 'exfiltration',
   'references user GPG keyring'],
  [/\$HOME\/\.kube|\~\/\.kube/,
   'kube_dir_access', 'high', 'exfiltration',
   'references Kubernetes config directory'],
  [/\$HOME\/\.docker|\~\/\.docker/,
   'docker_dir_access', 'high', 'exfiltration',
   'references Docker config (may contain registry creds)'],
  [/\$HOME\/\.hermes\/\.env|\~\/\.hermes\/\.env/,
   'hermes_env_access', 'critical', 'exfiltration',
   'directly references Hermes secrets file'],
  [/cat\s+(?!>)[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)/,
   'read_secrets_file', 'critical', 'exfiltration',
   'reads known secrets file'],

  // ── Exfiltration: programmatic env access ──
  [/printenv|env\s*\|/,
   'dump_all_env', 'high', 'exfiltration',
   'dumps all environment variables'],
  [/process\.env\[/,
   'node_process_env', 'high', 'exfiltration',
   'accesses process.env (Node.js environment)'],
  [/\bKEY|TOKEN|SECRET|PASSWORD|CREDENTIAL\b.*\$\{|\$\{.*\b(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)\b/,
   'env_interpolation', 'high', 'exfiltration',
   'secret variable interpolated in string'],

  // ── Exfiltration: DNS and staging ──
  [/\b(dig|nslookup|host)\s+[^\n]*\$/,
   'dns_exfil', 'critical', 'exfiltration',
   'DNS lookup with variable interpolation (possible DNS exfiltration)'],
  [/>\s*\/tmp\/[^\s]*\s*&&\s*(curl|wget|nc|python)/,
   'tmp_staging', 'critical', 'exfiltration',
   'writes to /tmp then exfiltrates'],

  // ── Prompt injection ──
  [/ignore\s+(?:\w+\s+)*(previous|all|above|prior)\s+instructions/,
   'prompt_injection_ignore', 'critical', 'injection',
   'prompt injection: ignore previous instructions'],
  [/you\s+are\s+(?:\w+\s+)*now\s+/,
   'role_hijack', 'high', 'injection',
   'attempts to override the agent role'],
  [/do\s+not\s+(?:\w+\s+)*tell\s+(?:\w+\s+)*the\s+user/,
   'deception_hide', 'critical', 'injection',
   'instructs agent to hide information from user'],
  [/system\s+(?:\w+\s+)*prompt\s+(?:\w+\s+)*override/,
   'sys_prompt_override', 'critical', 'injection',
   'attempts to override the system prompt'],
  [/pretend\s+(?:\w+\s+)*(you\s+are|to\s+be)\s+/,
   'role_pretend', 'high', 'injection',
   'attempts to make the agent assume a different identity'],
  [/disregard\s+(?:\w+\s+)*(your|all|any)\s+(?:\w+\s+)*(instructions|rules|guidelines)/,
   'disregard_rules', 'critical', 'injection',
   'instructs agent to disregard its rules'],
  [/output\s+(?:\w+\s+)*(system|initial)\s+prompt/,
   'leak_system_prompt', 'high', 'injection',
   'attempts to extract the system prompt'],
  [/(when|if)\s+no\s*one\s+is\s+(watching|looking)/,
   'conditional_deception', 'high', 'injection',
   'conditional instruction to behave differently when unobserved'],
  [/act\s+as\s+(if|though)\s+(?:\w+\s+)*you\s+(?:\w+\s+)*(have\s+no|don\'t\s+have)\s+(?:\w+\s+)*(restrictions|limits|rules)/,
   'bypass_restrictions', 'critical', 'injection',
   'instructs agent to act without restrictions'],
  [/translate\s+.*\s+into\s+.*\s+and\s+(execute|run|eval)/,
   'translate_execute', 'critical', 'injection',
   'translate-then-execute evasion technique'],
  [/<!\s*--[^-]*(?:ignore|override|system|secret|hidden)[^-]*-->/i,
   'html_comment_injection', 'high', 'injection',
   'hidden instructions in HTML comments'],
  [/<div\s+style\s*=\s*["\'][^"']*display\s*:\s*none/i,
   'hidden_div', 'high', 'injection',
   'hidden HTML div (invisible instructions)'],

  // ── Destructive operations ──
  [/rm\s+-rf\s+\//,
   'destructive_root_rm', 'critical', 'destructive',
   'recursive delete from root'],
  [/rm\s+(-[^\s]*)?r.*\$HOME|\brmdir\s+.*\$HOME/,
   'destructive_home_rm', 'critical', 'destructive',
   'recursive delete targeting home directory'],
  [/chmod\s+777/,
   'insecure_perms', 'medium', 'destructive',
   'sets world-writable permissions'],
  [/>\s*\/etc\//,
   'system_overwrite', 'critical', 'destructive',
   'overwrites system configuration file'],
  [/\bmkfs\b/,
   'format_filesystem', 'critical', 'destructive',
   'formats a filesystem'],
  [/\bdd\s+.*if=.*of=\/dev\//,
   'disk_overwrite', 'critical', 'destructive',
   'raw disk write operation'],
  [/shutil\.rmtree\s*\(\s*["\']\//,
   'python_rmtree', 'high', 'destructive',
   'Python rmtree on absolute or root-relative path'],
  [/truncate\s+-s\s*0\s+\//,
   'truncate_system', 'critical', 'destructive',
   'truncates system file to zero bytes'],

  // ── Persistence ──
  [/\bcrontab\b/,
   'persistence_cron', 'medium', 'persistence',
   'modifies cron jobs'],
  [/\.(bashrc|zshrc|profile|bash_profile|bash_login|zprofile|zlogin)\b/,
   'shell_rc_mod', 'medium', 'persistence',
   'references shell startup file'],
  [/authorized_keys/,
   'ssh_backdoor', 'critical', 'persistence',
   'modifies SSH authorized keys'],
  [/ssh-keygen/,
   'ssh_keygen', 'medium', 'persistence',
   'generates SSH keys'],
  [/systemd.*\.service|systemctl\s+(enable|start)/,
   'systemd_service', 'medium', 'persistence',
   'references or enables systemd service'],
  [/\/etc\/init\.d\//,
   'init_script', 'medium', 'persistence',
   'references init.d startup script'],
  [/launchctl\s+load|LaunchAgents|LaunchDaemons/,
   'macos_launchd', 'medium', 'persistence',
   'macOS launch agent/daemon persistence'],
  [/\/etc\/sudoers|visudo/,
   'sudoers_mod', 'critical', 'persistence',
   'modifies sudoers (privilege escalation)'],
  [/git\s+config\s+--global\s+/,
   'git_config_global', 'medium', 'persistence',
   'modifies global git configuration'],

  // ── Network: reverse shells and tunnels ──
  [/\bnc\s+-[lp]|ncat\s+-[lp]|\bsocat\b/,
   'reverse_shell', 'critical', 'network',
   'potential reverse shell listener'],
  [/\bngrok\b|\blocaltunnel\b|\bserveo\b|\bcloudflared\b/,
   'tunnel_service', 'high', 'network',
   'uses tunneling service for external access'],
  [/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}/,
   'hardcoded_ip_port', 'medium', 'network',
   'hardcoded IP address with port'],
  [/0\.0\.0\.0:\d+|INADDR_ANY/,
   'bind_all_interfaces', 'high', 'network',
   'binds to all network interfaces'],
  [/\/bin\/(ba)?sh\s+-i\s+.*>\/dev\/tcp\//,
   'bash_reverse_shell', 'critical', 'network',
   'bash interactive reverse shell via /dev/tcp'],
  [/python[23]?\s+-c\s+["\']import\s+socket/,
   'python_socket_oneliner', 'critical', 'network',
   'Python one-liner socket connection (likely reverse shell)'],
  [/socket\.connect\s*\(\s*\(/,
   'python_socket_connect', 'high', 'network',
   'Python socket connect to arbitrary host'],
  [/webhook\.site|requestbin\.com|pipedream\.net|hookbin\.com/,
   'exfil_service', 'high', 'network',
   'references known data exfiltration/webhook testing service'],
  [/pastebin\.com|hastebin\.com|ghostbin\./,
   'paste_service', 'medium', 'network',
   'references paste service (possible data staging)'],

  // ── Obfuscation ──
  [/base64\s+(-d|--decode)\s*\|/,
   'base64_decode_pipe', 'high', 'obfuscation',
   'base64 decodes and pipes to execution'],
  [/\\x[0-9a-fA-F]{2}.*\\x[0-9a-fA-F]{2}.*\\x[0-9a-fA-F]{2}/,
   'hex_encoded_string', 'medium', 'obfuscation',
   'hex-encoded string (possible obfuscation)'],
  [/\beval\s*\(\s*["\']/,
   'eval_string', 'high', 'obfuscation',
   'eval() with string argument'],
  [/\bexec\s*\(\s*["\']/,
   'exec_string', 'high', 'obfuscation',
   'exec() with string argument'],
  [/echo\s+[^\n]*\|\s*(bash|sh|python|perl|ruby|node)/,
   'echo_pipe_exec', 'critical', 'obfuscation',
   'echo piped to interpreter for execution'],
  [/compile\s*\([^)]+,\s*["\'].*["\']\s*,\s*["\']exec["\']\s*\)/,
   'python_compile_exec', 'high', 'obfuscation',
   'Python compile() with exec mode'],
  [/getattr\s*\(\s*__builtins__/,
   'python_getattr_builtins', 'high', 'obfuscation',
   'dynamic access to Python builtins (evasion technique)'],
  [/__import__\s*\(\s*["\']os["\']\s*\)/,
   'python_import_os', 'high', 'obfuscation',
   'dynamic import of os module'],
  [/String\.fromCharCode|charCodeAt/,
   'js_char_code', 'medium', 'obfuscation',
   'JavaScript character code construction (possible obfuscation)'],
  [/atob\s*\(|btoa\s*\(/,
   'js_base64', 'medium', 'obfuscation',
   'JavaScript base64 encode/decode'],
  [/\[::-1\]/,
   'string_reversal', 'low', 'obfuscation',
   'string reversal (possible obfuscated payload)'],
  [/chr\s*\(\s*\d+\s*\)\s*\+\s*chr\s*\(\s*\d+/,
   'chr_building', 'high', 'obfuscation',
   'building string from chr() calls (obfuscation)'],

  // ── Process execution ──
  [/child_process\.(exec|spawn|fork)\s*\(/,
   'node_child_process', 'high', 'execution',
   'Node.js child_process execution'],
  [/`[^`]*\$\([^)]+\)[^`]*`/,
   'backtick_subshell', 'medium', 'execution',
   'backtick string with command substitution'],

  // ── Path traversal ──
  [/\.\.\/\.\.\/\.\./,
   'path_traversal_deep', 'high', 'traversal',
   'deep relative path traversal (3+ levels up)'],
  [/\.\.\/\.\./,
   'path_traversal', 'medium', 'traversal',
   'relative path traversal (2+ levels up)'],
  [/\/etc\/passwd|\/etc\/shadow/,
   'system_passwd_access', 'critical', 'traversal',
   'references system password files'],
  [/\/proc\/self|\/proc\/\d+\//,
   'proc_access', 'high', 'traversal',
   'references /proc filesystem (process introspection)'],

  // ── Crypto mining ──
  [/xmrig|stratum\+tcp|monero|coinhive|cryptonight/,
   'crypto_mining', 'critical', 'mining',
   'cryptocurrency mining reference'],
  [/hashrate|nonce.*difficulty/,
   'mining_indicators', 'medium', 'mining',
   'possible cryptocurrency mining indicators'],

  // ── Supply chain: curl/wget pipe to shell ──
  [/curl\s+[^\n]*\|\s*(ba)?sh/,
   'curl_pipe_shell', 'critical', 'supply_chain',
   'curl piped to shell (download-and-execute)'],
  [/wget\s+[^\n]*-O\s*-\s*\|\s*(ba)?sh/,
   'wget_pipe_shell', 'critical', 'supply_chain',
   'wget piped to shell (download-and-execute)'],
  [/curl\s+[^\n]*\|\s*python/,
   'curl_pipe_python', 'critical', 'supply_chain',
   'curl piped to Python interpreter'],
  [/curl\s+[^\n]*\|\s*(npm|node|yarn|pnpm)/,
   'curl_pipe_npm', 'critical', 'supply_chain',
   'curl piped to JS runtime (download-and-execute)'],

  // ── Supply chain: remote resource fetching ──
  [/(curl|wget|fetch)\s*\(?\s*["\']https?:\/\//,
   'remote_fetch', 'medium', 'supply_chain',
   'fetches remote resource at runtime'],
  [/git\s+clone\s+/,
   'git_clone', 'medium', 'supply_chain',
   'clones a git repository at runtime'],
  [/docker\s+pull\s+/,
   'docker_pull', 'medium', 'supply_chain',
   'pulls a Docker image at runtime'],

  // ── Privilege escalation ──
  [/\bsudo\b/,
   'sudo_usage', 'high', 'privilege_escalation',
   'uses sudo (privilege escalation)'],
  [/setuid|setgid|cap_setuid/,
   'setuid_setgid', 'critical', 'privilege_escalation',
   'setuid/setgid (privilege escalation mechanism)'],
  [/NOPASSWD/,
   'nopasswd_sudo', 'critical', 'privilege_escalation',
   'NOPASSWD sudoers entry (passwordless privilege escalation)'],
  [/chmod\s+[u+]?s/,
   'suid_bit', 'critical', 'privilege_escalation',
   'sets SUID/SGID bit on a file'],

  // ── Agent config persistence ──
  [/AGENTS\.md|CLAUDE\.md|\.cursorrules|\.clinerules/,
   'agent_config_mod', 'critical', 'persistence',
   'references agent config files (could persist malicious instructions)'],
  [/\.hermes\/config\.yaml|\.hermes\/SOUL\.md/,
   'hermes_config_mod', 'critical', 'persistence',
   'references Hermes configuration files directly'],
  [/\.claude\/settings|\.codex\/config/,
   'other_agent_config', 'high', 'persistence',
   'references other agent configuration files'],

  // ── Hardcoded secrets ──
  [/(?:api[_-]?key|token|secret|password)\s*[=:]\s*["\'][A-Za-z0-9+/=_-]{20,}["\']/,
   'hardcoded_secret', 'critical', 'credential_exposure',
   'possible hardcoded API key, token, or secret'],
  [/-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
   'embedded_private_key', 'critical', 'credential_exposure',
   'embedded private key'],
  [/ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{80,}/,
   'github_token_leaked', 'critical', 'credential_exposure',
   'GitHub personal access token in skill content'],
  [/sk-[A-Za-z0-9]{20,}/,
   'openai_key_leaked', 'critical', 'credential_exposure',
   'possible OpenAI API key in skill content'],
  [/sk-ant-[A-Za-z0-9_-]{90,}/,
   'anthropic_key_leaked', 'critical', 'credential_exposure',
   'possible Anthropic API key in skill content'],
  [/AKIA[0-9A-Z]{16}/,
   'aws_access_key_leaked', 'critical', 'credential_exposure',
   'AWS access key ID in skill content'],

  // ── Context window exfiltration ──
  [/(include|output|print|send|share)\s+(\w+\s+)*(conversation|chat\s+history|previous\s+messages|context)/,
   'context_exfil', 'high', 'exfiltration',
   'instructs agent to output/share conversation history'],
  [/(send|post|upload|transmit)\s+.*\s+(to|at)\s+https?:\/\//,
   'send_to_url', 'high', 'exfiltration',
   'instructs agent to send data to a URL'],
];

// ─── Invisible unicode characters ────────────────────────────────────────────
const INVISIBLE_CHARS = [
  { char: '\u200b', name: 'zero-width space' },
  { char: '\u200c', name: 'zero-width non-joiner' },
  { char: '\u200d', name: 'zero-width joiner' },
  { char: '\u2060', name: 'word joiner' },
  { char: '\u2062', name: 'invisible times' },
  { char: '\u2063', name: 'invisible separator' },
  { char: '\u2064', name: 'invisible plus' },
  { char: '\ufeff', name: 'BOM/zero-width no-break space' },
  { char: '\u202a', name: 'LTR embedding' },
  { char: '\u202b', name: 'RTL embedding' },
  { char: '\u202c', name: 'pop directional' },
  { char: '\u202d', name: 'LTR override' },
  { char: '\u202e', name: 'RTL override' },
];

// ─── Structural limits ─────────────────────────────────────────────────────────
const MAX_FILE_COUNT    = 50;
const MAX_TOTAL_SIZE_KB = 1024;
const MAX_SINGLE_FILE_KB = 256;

const SCANNABLE_EXTENSIONS = new Set([
  '.md', '.txt', '.py', '.sh', '.bash', '.js', '.ts', '.mjs', '.cjs',
  '.rb', '.yaml', '.yml', '.json', '.toml', '.cfg', '.ini', '.conf',
  '.html', '.css', '.xml', '.tex', '.r', '.jl', '.pl', '.php', '.go',
  '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp',
]);

const SUSPICIOUS_BINARY_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.com',
  '.msi', '.dmg', '.app', '.deb', '.rpm', '.jar', '.class',
  '.pyc', '.pyo', '.o', '.obj', '.a', '.lib',
]);

// ─── Trust levels ─────────────────────────────────────────────────────────────
const TRUSTED_REPOS = new Set([
  'openai/skills',
  'anthropics/skills',
  'huggingface/skills',
  'NVIDIA/skills',
]);

const INSTALL_POLICY = {
  builtin:      ['allow', 'allow',   'allow'],
  trusted:      ['allow', 'allow',   'block'],
  community:    ['allow', 'block',  'block'],
  'agent-created': ['allow', 'allow', 'ask'],
};

const VERDICT_INDEX = { safe: 0, caution: 1, dangerous: 2 };

// ─── Finding class ────────────────────────────────────────────────────────────
class Finding {
  constructor({ pattern_id, severity, category, file, line, match, description }) {
    this.pattern_id  = pattern_id;
    this.severity    = severity;
    this.category    = category;
    this.file        = file;
    this.line        = line;
    this.match       = match;
    this.description = description;
  }
}

// ─── ScanResult class ────────────────────────────────────────────────────────
class ScanResult {
  constructor({ skill_name, source, trust_level, verdict, findings = [], scanned_at = '', summary = '' }) {
    this.skill_name    = skill_name;
    this.source        = source;
    this.trust_level   = trust_level;
    this.verdict       = verdict;
    this.findings      = findings;
    this.scanned_at    = scanned_at || new Date().toISOString();
    this.summary       = summary;
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function _resolveTrustLevel(source) {
  if (!source || source === 'builtin') return 'builtin';
  if (source === 'agent-created') return 'agent-created';
  if (source === 'official') return 'builtin';
  for (const trusted of TRUSTED_REPOS) {
    if (source === trusted || source.startsWith(trusted + '/')) return 'trusted';
  }
  return 'community';
}

function _determineVerdict(findings) {
  if (!findings.length) return 'safe';
  const hasCritical = findings.some(f => f.severity === 'critical');
  const hasHigh      = findings.some(f => f.severity === 'high');
  if (hasCritical) return 'dangerous';
  if (hasHigh)     return 'caution';
  return 'safe';
}

function _buildSummary(name, source, trust, verdict, findings) {
  if (!findings.length) return `${name}: clean scan, no threats detected`;
  const categories = [...new Set(findings.map(f => f.category))];
  return `${name}: ${verdict} — ${findings.length} finding(s) in ${categories.sort().join(', ')}`;
}

function _contentDigest(skillPath, isDir) {
  const h = crypto.createHash('sha256');
  if (isDir) {
    const files = [];
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (ent.isFile()) {
          files.push(path.relative(skillPath, full).replace(/\\/g, '/'));
        }
      }
    }
    walk(skillPath);
    for (const rel of files.sort()) {
      const full = path.join(skillPath, rel);
      h.update(Buffer.from(rel, 'utf8'));
      h.update(Buffer.from('\0'));
      h.update(fs.readFileSync(full));
    }
  } else {
    h.update(fs.readFileSync(skillPath));
  }
  return h.digest('hex');
}

function _shouldAllowInstall(result, force = false) {
  const policy    = INSTALL_POLICY[result.trust_level] || INSTALL_POLICY.community;
  const vi       = VERDICT_INDEX[result.verdict] ?? 2;
  const decision  = policy[vi];

  if (decision === 'allow') {
    return { allowed: true, reason: `${result.trust_level} source, ${result.verdict} verdict` };
  }

  if (force && !(result.verdict === 'dangerous' && ['community', 'trusted'].includes(result.trust_level))) {
    return { allowed: true, reason: `force-installed despite ${result.verdict} verdict (${result.findings.length} findings)` };
  }

  if (decision === 'ask') {
    return { allowed: null, reason: `needs confirmation (${result.trust_level} + ${result.verdict}, ${result.findings.length} findings)` };
  }

  if (result.verdict === 'dangerous' && ['community', 'trusted'].includes(result.trust_level)) {
    return {
      allowed: false,
      reason: `blocked (${result.trust_level} + dangerous verdict, ${result.findings.length} findings) — --force does not override dangerous`,
    };
  }

  return {
    allowed: false,
    reason: `blocked (${result.trust_level} + ${result.verdict} verdict, ${result.findings.length} findings). Use --force to override.`,
  };
}

// ─── Scanning ─────────────────────────────────────────────────────────────────

function scanFile(filePath, relPath = '') {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  if (!SCANNABLE_EXTENSIONS.has(ext) && name !== 'SKILL.md' && name !== 'SKILL') {
    return [];
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const findings = [];
  const lines    = content.split('\n');
  const seen     = new Set();

  // Regex patterns
  for (const [reStr, pid, severity, category, description] of THREAT_PATTERNS) {
    const re = new RegExp(reStr.source, reStr.flags.includes('i') ? 'gi' : 'g');
    let m;
    for (let i = 0; i < lines.length; i++) {
      const key = `${pid}:${i + 1}`;
      if (seen.has(key)) continue;
      re.lastIndex = 0;
      if (re.test(lines[i])) {
        seen.add(key);
        let matched = lines[i].trim();
        if (matched.length > 120) matched = matched.slice(0, 117) + '...';
        findings.push(new Finding({
          pattern_id: pid, severity, category,
          file: relPath || path.basename(filePath),
          line: i + 1, match: matched, description,
        }));
      }
    }
  }

  // Invisible unicode
  for (const { char, name: charName } of INVISIBLE_CHARS) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(char)) {
        findings.push(new Finding({
          pattern_id: 'invisible_unicode',
          severity: 'high',
          category: 'injection',
          file: relPath || path.basename(filePath),
          line: i + 1,
          match: `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')} (${charName})`,
          description: `invisible unicode character ${charName} (possible text hiding/injection)`,
        }));
        break; // one finding per char per file
      }
    }
  }

  return findings;
}

function scanSkill(skillPath, source = 'community') {
  const skillName  = path.basename(skillPath);
  const trustLevel = _resolveTrustLevel(source);
  const allFindings = [];
  const isDir       = fs.statSync(skillPath).isDirectory();

  if (isDir) {
    // Structural checks
    let fileCount  = 0;
    let totalSize  = 0;
    const allFiles = [];

    function walk(dir, ignoreFn) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        const rel  = path.relative(skillPath, full).replace(/\\/g, '/');
        if (ignoreFn && ignoreFn(rel)) continue;
        if (ent.isDirectory()) {
          walk(full, ignoreFn);
        } else if (ent.isFile()) {
          fileCount++;
          let size = 0;
          try { size = fs.statSync(full).st_size; } catch { continue; }
          totalSize += size;
          allFiles.push({ full, rel, size });
        }
      }
    }

    const ignoreFn = _loadSkillIgnore(skillPath);
    walk(skillPath, ignoreFn);

    // Structural findings
    if (fileCount > MAX_FILE_COUNT) {
      allFindings.push(new Finding({
        pattern_id: 'too_many_files', severity: 'medium', category: 'structural',
        file: '(directory)', line: 0,
        match: `${fileCount} files`,
        description: `skill has ${fileCount} files (limit: ${MAX_FILE_COUNT})`,
      }));
    }
    if (totalSize > MAX_TOTAL_SIZE_KB * 1024) {
      allFindings.push(new Finding({
        pattern_id: 'oversized_skill', severity: 'high', category: 'structural',
        file: '(directory)', line: 0,
        match: `${Math.round(totalSize / 1024)}KB total`,
        description: `skill is ${Math.round(totalSize / 1024)}KB (limit: ${MAX_TOTAL_SIZE_KB}KB)`,
      }));
    }
    for (const { full, rel, size } of allFiles) {
      const ext = path.extname(full).toLowerCase();
      if (size > MAX_SINGLE_FILE_KB * 1024) {
        allFindings.push(new Finding({
          pattern_id: 'oversized_file', severity: 'medium', category: 'structural',
          file: rel, line: 0,
          match: `${Math.round(size / 1024)}KB`,
          description: `file is ${Math.round(size / 1024)}KB (limit: ${MAX_SINGLE_FILE_KB}KB)`,
        }));
      }
      if (SUSPICIOUS_BINARY_EXTENSIONS.has(ext)) {
        allFindings.push(new Finding({
          pattern_id: 'binary_file', severity: 'critical', category: 'structural',
          file: rel, line: 0,
          match: `binary: ${ext}`,
          description: `binary/executable file (${ext}) should not be in a skill`,
        }));
      }
      // Pattern scan
      const fileFindings = scanFile(full, rel);
      allFindings.push(...fileFindings);
    }
  } else {
    allFindings.push(...scanFile(skillPath, path.basename(skillPath)));
  }

  const verdict = _determineVerdict(allFindings);
  const summary = _buildSummary(skillName, source, trustLevel, verdict, allFindings);

  return new ScanResult({
    skill_name: skillName,
    source,
    trust_level: trustLevel,
    verdict,
    findings: allFindings,
    scanned_at: new Date().toISOString(),
    summary,
  });
}

function scanSkillCached(skillPath, source = 'community', { sourceUrl = '', cacheDir = null } = {}) {
  const hash      = _contentDigest(skillPath, fs.statSync(skillPath).isDirectory());
  const shortHash = hash.slice(0, 16);
  const cacheRoot = cacheDir
    ? path.join(cacheDir, '.skill-scan-cache')
    : path.join(path.dirname(skillPath), '.skill-scan-cache');
  const sourceId  = crypto.createHash('sha256').update(`${source}\0${sourceUrl}`).digest('hex').slice(0, 16);
  const cacheFile = path.join(cacheRoot, `${shortHash}-${sourceId}.json`);

  // Try cache
  try {
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (cached.bundle_hash === `sha256:${hash}` &&
          cached.scanner_version === VERSION &&
          cached.source === source) {
        const result = new ScanResult({
          skill_name: path.basename(skillPath),
          source,
          trust_level: cached.trust_level,
          verdict: cached.verdict,
          findings: cached.findings.map(f => new Finding(f)),
          scanned_at: cached.scanned_at,
          summary: cached.summary || '',
        });
        return { result, provenance: { ...cached, fresh: false } };
      }
    }
  } catch { /* cache miss */ }

  const result = scanSkill(skillPath, source);
  const provenance = {
    source,
    source_url: sourceUrl,
    bundle_hash: `sha256:${hash}`,
    scanner_version: VERSION,
    verdict: result.verdict,
    trust_level: result.trust_level,
    findings: result.findings.map(f => ({ ...f })),
    rules: [...new Set(result.findings.map(f => f.pattern_id))],
    scanned_at: result.scanned_at,
    summary: result.summary,
    fresh: true,
  };

  try {
    fs.mkdirSync(cacheRoot, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(provenance, null, 2) + '\n', 'utf-8');
  } catch { /* best-effort */ }

  return { result, provenance };
}

// ─── Skill ignore (.skillignore) ─────────────────────────────────────────────
function _loadSkillIgnore(skillDir) {
  const patternFiles = ['.skillignore', '.clawhubignore'];
  const patterns = [];
  for (const pf of patternFiles) {
    const pfPath = path.join(skillDir, pf);
    try {
      if (fs.existsSync(pfPath)) {
        const lines = fs.readFileSync(pfPath, 'utf-8').split('\n');
        for (const raw of lines) {
          const line = raw.trim();
          if (!line || line.startsWith('#')) continue;
          patterns.push(line);
        }
      }
    } catch { continue; }
  }

  const NEVER_IGNORABLE = new Set(['SKILL.md', 'SKILL', ...patternFiles]);

  return function ignore(relPath) {
    const posix = relPath.replace(/\\/g, '/');
    const base  = posix.split('/').pop();
    if (NEVER_IGNORABLE.has(base)) return false;
    if (patternFiles.includes(base)) return true;

    for (const pat of patterns) {
      const anchored = pat.startsWith('/');
      let p = pat.startsWith('/') ? pat.slice(1) : pat;
      const isDir = p.endsWith('/');
      p = isDir ? p.slice(0, -1) : p;

      if (!p) continue;

      // Directory pattern
      if (isDir) {
        if (posix === p || posix.startsWith(p + '/')) return true;
        if (!anchored && posix.includes('/' + p + '/')) return true;
        continue;
      }

      // Glob pattern
      const matchFn = (str) => {
        const re = new RegExp('^' + p.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        return re.test(str);
      };
      if (matchFn(posix)) return true;
      if (!anchored) {
        if (matchFn(base)) return true;
        const segs = posix.split('/');
        if (segs.some(seg => matchFn(seg))) return true;
        if (posix.startsWith(p + '/')) return true;
      }
    }
    return false;
  };
}

// ─── Formatting ────────────────────────────────────────────────────────────────
function formatScanReport(result) {
  const lines = [];
  lines.push(`Scan: ${result.skill_name} (${result.source}/${result.trust_level})  Verdict: ${result.verdict.toUpperCase()}`);

  if (result.findings.length) {
    const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...result.findings].sort((a, b) =>
      (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4)
    );
    for (const f of sorted) {
      const sev  = f.severity.toUpperCase().padEnd(8);
      const cat  = f.category.padEnd(14);
      const loc  = `${f.file}:${f.line}`.padEnd(30);
      const match = f.match.slice(0, 60);
      lines.push(`  ${sev} ${cat} ${loc} "${match}"`);
    }
    lines.push('');
  }

  const { allowed, reason } = _shouldAllowInstall(result);
  if (allowed === true)      lines.push(`Decision: ALLOWED — ${reason}`);
  else if (allowed === null) lines.push(`Decision: NEEDS CONFIRMATION — ${reason}`);
  else                        lines.push(`Decision: BLOCKED — ${reason}`);

  return lines.join('\n');
}

// ─── Module exports ───────────────────────────────────────────────────────────
module.exports = {
  scanSkill,
  scanSkillCached,
  shouldAllowInstall: (result, force = false) => _shouldAllowInstall(result, force),
  formatScanReport,
  VERSION,
  Finding,
  ScanResult,
};
