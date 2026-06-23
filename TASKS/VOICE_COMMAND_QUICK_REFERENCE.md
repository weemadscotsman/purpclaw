# Voice Command Quick Reference

## Agent Operations

### Spawn Agents
- `"spawn an agent in engineering to write a function"`
- `"spawn 3 agents in security to monitor system"`
- `"spawn agent in media ops to edit video"`

### Check Status
- `"get status"`
- `"show agents in engineering"`
- `"what is the status of security"`
- `"how many agents are working"`

### Manage Agents
- `"kill agents in engineering"`
- `"stop all agents in media ops"`
- `"move 2 agents from data mining to ai research"`

## Division Control

### Set Priorities
- `"set engineering priority to high"`
- `"set security priority to maximum"`
- `"set media ops priority to low"`

### Boost/Throttle
- `"boost infrastructure"`
- `"throttle design"`
- `"boost all divisions"`

## System Commands

### General Tasks
- `"what is the current time"`
- `"check system status"`
- `"list all files in current directory"`

### Help
- `"what commands can I use"`
- `"show available divisions"`
- `"help with voice commands"`

## Division Names

### Primary Divisions
- **Engineering** (aliases: engineer, code)
- **AI Research** (aliases: research, ai)
- **Media Ops** (aliases: media, video, audio)
- **Security** (aliases: secure)
- **Data Mining** (aliases: data, mining)
- **Design** (aliases: graphic)
- **Management** (aliases: manage)
- **Infrastructure** (aliases: infra, system)

### Default Division
- **Management** (used when no division specified)

## Command Patterns

### Basic Pattern
`[action] [quantity] agents [in/for] [division] [to task]`

### Examples
- Action: `spawn`, `kill`, `move`, `get`, `show`
- Quantity: `a`, `an`, `1`, `2`, `3`, etc.
- Division: Any division name or alias
- Task: Description of what the agent should do

## Tips

1. **Be specific with division names**
   - Use full names: "engineering" not "eng"
   - Or use common aliases: "code" for engineering

2. **Include the task**
   - Always say what the agent should do
   - Example: "to write a function", "to monitor system"

3. **Check status first**
   - Use `"get status"` before making changes
   - See which divisions have active agents

4. **Use natural language**
   - The system understands variations
   - "show me the agents in security" works
   - "what's the status of engineering" works

## Testing Commands

To test the system, use these sample commands:

1. `"spawn an agent in engineering to test the system"`
2. `"get status"`
3. `"spawn 2 agents in security to run diagnostics"`
4. `"show agents in security"`
5. `"kill agents in engineering"`
6. `"set ai research priority to high"`
7. `"boost security"`
8. `"what is the current time"`