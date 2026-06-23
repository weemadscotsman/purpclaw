# VOID Operational Protocols

## Null Exploitation Protocol

### Null State Classification
1. **Type 0: True Null**
   - NULL pointer dereference
   - Classic use-after-free
   - Dangling pointer access
   - Exploitation: Memory corruption to control flow

2. **Type 1: Implicit Null**
   - Zero-initialized memory
   - Default constructork absence
   - Unitialized variable access
   - Exploitation: Predictable state manipulation

3. **Type 2: Semantic Null**
   - Empty string ""
   - Empty array []
   - Missing optional field
   - Exploitation: Logic flaw amplification

4. **Type 3: Type Confusion**
   - Object masquerading as primitive
   - Primitive treated as object
   - Cross-type casting
   - Exploitation: VTable manipulation, primitive escalation

5. **Type 4: Undefined Behavior**
   - Signed integer overflow
   - Invalid pointer arithmetic
   - Misaligned memory access
   - Exploitation: Architecture-specific exploitation

### Exploitation Methodology
1. **Identification Phase**
   - Fuzz with null/empty/missing inputs
   - Track type assumptions in source code
   - Map data flow with null propagation analysis
   - Identify null-related undefined behaviors

2. **Stabilization Phase**
   - Determine reliability of null condition trigger
   - Calculate probability of crash vs. control
   - Identify memory layout constraints
   - Build heap grooming procedures if needed

3. **Exploitation Phase**
   - Select appropriate primitive chain
   - Build ROP/JOP chains for NULL page scenarios
   - Implement corruption isolation to avoid detection
   - Validate against multiple target versions

## Deserialization Attack Protocol

### Target Assessment
1. Identify serialization format (JSON, XML, YAML, Protobuf, Java Serialization, .NET BinaryFormatter, Pickle, MessagePack)
2. Determine framework version and patch level
3. Map available gadget chains for deserialization sinks
4. Identify authentication/authorization preconditions
5. Assess monitoring and detection capabilities

### Gadget Chain Development
1. **Gadget Discovery**
   - Pull Apache Commons Collections, Spring Framework, Groovy (Java)
   - Pull Blazor, PowerShell Remoting, ActivitySurrogateSelector (.NET)
   - Pull PyYAML, pickle hooks, NumPy (Python)
   - Pull YAML loading, Marshal (Ruby)

2. **Chain Construction**
   - Identify read/write primitive
   - Build gadget sequence to command execution
   - Test against target version
   - Minimize chain complexity for detection evasion

3. **Reliability Enhancement**
   - Add exception handling to gadget chain
   - Implement version detection and adaptation
   - Build fallback chains for different patch levels
   - Validate against WAF/ASM detection

### Payload Delivery
| Format | Encoding | Evasion Technique |
|--------|----------|-------------------|
| Java Serialization | Base64, Hex, Raw | Magic header replacement |
| .NET BinaryFormatter | Base64, Raw | Type spoofing |
| Python Pickle | Base64, Hex | Op code filtering |
| YAML | Unicode, Nested | Safe load bypass |
| JSON | Unicode, Number encoding | Type confusion |

## Logic Flaw Protocol

### Authentication Bypass Patterns
1. **Null Token Acceptance**
   - Token = null bypasses existence check
   - Implementation of equalsIgnoreCase vs equals
   - Case sensitivity in role comparison

2. **Type Confusion in AuthZ**
   - String "admin" == Integer 0
   - Numeric role comparison with string input
   - JSON type coercion bypass

3. **Time-of-Check-Time-of-Use**
   - Privilege check cached, role updated later
   - Session validation before termination confirmation
   - ACL evaluation before object destruction

### Exploitation Procedure
1. Map all authentication and authorization decision points
2. Collect all data flow paths to those decisions
3. Inject null/empty/type-confused values along each path
4. Document successful bypass conditions
5. Operationalize exploitation steps

## Fuzzing Protocol

### Void Fuzzer Configuration
- **Input Generation:** Corpus-based with null injection focus
- **Null Payloads:** "" (empty), null, \0, NULL, Null, None, nil, NaN, undefined, void
- **Type Confusion:** Cross-type injection (string as number, etc.)
- **Mutation Strategy:** Smart fuzzing with type-aware mutations

### Target Prioritization
1. Authentication/authorization systems
2. Payment processing pipelines
3. Data parsing and transformation
4. File upload and processing
5. API request handling

### Crash Analysis
1. Determine if crash is exploitable
2. Classify vulnerability type
3. Map to known exploitation patterns
4. Develop reliable trigger procedure
5. Assess detection likelihood

## Documentation Protocol

### Technique Documentation Standard
```
## Technique ID: VOID-[YEAR]-[NUMBER]
## Title: [Descriptive Name]
## Severity: Critical/High/Medium/Low
## Target: [Affected Component]
## Platform: [Windows/Linux/macOS/All]

### Description
[Technical explanation of the vulnerability and exploitation]

### Prerequisites
[What conditions must exist for exploitation]

### Procedure
[Step-by-step exploitation guide]

### Detection
[How this technique would be detected, if at all]

### Mitigation
[How to prevent this attack]

### References
[Related CVEs, papers, prior art]
```

### Metrics Tracking
- Techniques documented per month
- Exploitation success rate
- Detection rate by security tools
- Time from discovery to operationalization
