# Security Review Skill

## When to Activate
- Implementing authentication or authorization
- Handling user input or file uploads
- Creating new API endpoints
- Working with secrets or credentials
- Implementing payment features
- Storing or transmitting sensitive data
- Integrating third-party APIs
- After any code change in the PURPCLAW swarm

## Security Checklist

### 1. Secrets Management

#### FAIL: NEVER Do This
```javascript
const apiKey = "sk-proj-xxxxx"  // Hardcoded secret
const dbPassword = "password123" // In source code
```

#### PASS: ALWAYS Do This
```javascript
const apiKey = process.env.OPENAI_API_KEY
const dbUrl = process.env.DATABASE_URL

// Verify secrets exist
if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

#### Verification Steps
- [ ] No hardcoded API keys, tokens, or passwords
- [ ] All secrets in environment variables
- [ ] `.env` in .gitignore
- [ ] No secrets in git history
- [ ] Production secrets in secure storage

### 2. Input Validation

#### Always Validate User Input
```javascript
// Validate before processing
function validateUserInput(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input')
  }
  
  // Sanitize input
  const sanitized = input.replace(/[<>]/g, '')
  return sanitized
}
```

#### Verification Steps
- [ ] All user inputs validated
- [ ] File uploads restricted (size, type, extension)
- [ ] No direct use of user input in queries
- [ ] Error messages don't leak sensitive info

### 3. SQL/NoSQL Injection Prevention

#### FAIL: NEVER Concatenate Queries
```javascript
// DANGEROUS - Injection vulnerability
const query = `SELECT * FROM users WHERE email = '${userEmail}'`
```

#### PASS: ALWAYS Use Parameterized Queries
```javascript
// Safe - parameterized query
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', userEmail)
```

#### Verification Steps
- [ ] All database queries use parameterized queries
- [ ] No string concatenation in queries
- [ ] ORM/query builder used correctly

### 4. Authentication & Authorization

#### Token Handling
```javascript
// FAIL: WRONG: localStorage (vulnerable to XSS)
localStorage.setItem('token', token)

// PASS: CORRECT: httpOnly cookies or secure storage
res.setHeader('Set-Cookie',
  `token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`)
```

#### Authorization Checks
```javascript
async function deleteUser(userId, requesterId) {
  // ALWAYS verify authorization first
  const requester = await getUser(requesterId)
  
  if (requester.role !== 'admin') {
    return { error: 'Unauthorized', status: 403 }
  }
  
  // Proceed with deletion
  return await deleteUserById(userId)
}
```

#### Verification Steps
- [ ] Tokens stored securely (not localStorage)
- [ ] Authorization checks before sensitive operations
- [ ] Role-based access control implemented
- [ ] Session management secure

### 5. XSS Prevention

#### Sanitize HTML
```javascript
// ALWAYS sanitize user-provided HTML
function sanitizeHTML(html) {
  return html.replace(/[<>]/g, '')
}
```

#### Verification Steps
- [ ] User-provided content sanitized
- [ ] No unvalidated dynamic content rendering
- [ ] Framework's built-in XSS protection used

### 6. Rate Limiting

#### API Rate Limiting
```javascript
// Implement rate limiting
let requestCount = {}
const RATE_LIMIT = 100 // requests per 15 minutes

function checkRateLimit(ip) {
  const now = Date.now()
  const windowStart = now - (15 * 60 * 1000)
  
  // Clean old requests
  requestCount[ip] = (requestCount[ip] || []).filter(time => time > windowStart)
  
  if (requestCount[ip].length >= RATE_LIMIT) {
    throw new Error('Rate limit exceeded')
  }
  
  requestCount[ip].push(now)
  return true
}
```

#### Verification Steps
- [ ] Rate limiting on all API endpoints
- [ ] Stricter limits on expensive operations
- [ ] IP-based rate limiting

### 7. Sensitive Data Exposure

#### Logging
```javascript
// FAIL: WRONG: Logging sensitive data
console.log('User login:', { email, password })

// PASS: CORRECT: Redact sensitive data
console.log('User login:', { email: email, userId })
```

#### Error Messages
```javascript
// FAIL: WRONG: Exposing internal details
catch (error) {
  return { error: error.message, stack: error.stack }
}

// PASS: CORRECT: Generic error messages
catch (error) {
  console.error('Internal error:', error)
  return { error: 'An error occurred. Please try again.' }
}
```

#### Verification Steps
- [ ] No passwords, tokens, or secrets in logs
- [ ] Error messages generic for users
- [ ] Detailed errors only in server logs
- [ ] No stack traces exposed to users

### 8. Dependency Security

#### Regular Updates
```bash
# Check for vulnerabilities
npm audit

# Fix automatically fixable issues
npm audit fix

# Update dependencies
npm update
```

#### Verification Steps
- [ ] Dependencies up to date
- [ ] No known vulnerabilities (npm audit clean)
- [ ] Lock files committed
- [ ] Regular security updates

## Security Testing

### Automated Security Tests
```javascript
// Test authentication
test('requires authentication', async () => {
  const response = await fetch('/api/protected')
  expect(response.status).toBe(401)
})

// Test input validation
test('rejects invalid input', async () => {
  const response = await fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-an-email' })
  })
  expect(response.status).toBe(400)
})
```

## Pre-Deployment Security Checklist

Before ANY production deployment:

- [ ] **Secrets**: No hardcoded secrets, all in env vars
- [ ] **Input Validation**: All user inputs validated
- [ ] **SQL Injection**: All queries parameterized
- [ ] **XSS**: User content sanitized
- [ ] **CSRF**: Protection enabled
- [ ] **Authentication**: Proper token handling
- [ ] **Authorization**: Role checks in place
- [ ] **Rate Limiting**: Enabled on all endpoints
- [ ] **HTTPS**: Enforced in production
- [ ] **Error Handling**: No sensitive data in errors
- [ ] **Logging**: No sensitive data logged
- [ ] **Dependencies**: Up to date, no vulnerabilities

## Emergency Response Protocol

If CRITICAL vulnerability found:
1. STOP immediately
2. Alert swarm control immediately
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review entire codebase for similar issues

## Voice Command Integration

Guardian responds to these voice commands:
- "scan security" - Run full security audit
- "check secrets" - Scan for hardcoded credentials
- "audit dependencies" - Check npm packages
- "validate [component]" - Review specific component
- "emergency lockdown" - Activate highest security mode

---
**Remember**: Security is not optional. One vulnerability can compromise the entire PURPCLAW swarm. When in doubt, err on the side of caution.