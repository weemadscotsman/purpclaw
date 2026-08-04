# PURPCLAW Skill Card Template

Every skill must become a loaded instruction card.

A skill card tells an agent how to do the job, what tools it may use, what it must not do, and how to prove the result.

## Required fields

### Identity

- `id`
- `name`
- `version`
- `owner`
- `division`
- `status`

### Purpose

What this skill is for.

### Load triggers

Use this skill when:

- trigger one
- trigger two
- trigger three

### Do not load when

Do not use this skill when:

- exclusion one
- exclusion two
- exclusion three

### Required inputs

- input name
- type
- required or optional
- validation rule

### Expected outputs

- output name
- type
- destination
- validation rule

### Required tools

Each tool must include:

- tool name
- registry id
- reason needed
- allowed action
- input schema
- output schema
- permission level

### Optional tools

Tools the agent may use if needed.

### Forbidden tools

Tools the agent must not call for this skill.

### Function call map

Map natural task steps to callable handlers.

Example:

1. inspect files -> `file_search.msearch` or local scan
2. read selected file -> `file_search.mclick` or `fs.read`
3. generate patch -> code writer
4. verify patch -> test runner
5. write receipt -> liveforge receipt

### Operating procedure

Numbered steps the agent should follow.

### Validation

How to check the result.

### Failure handling

What to do if:

- tool missing
- permission denied
- schema invalid
- output failed validation
- timeout
- conflicting memory

### Receipt requirements

What must be logged.

### Learning hooks

What should become a lesson proposal.

### Dream mode checks

What dream mode may inspect later.

## Rule

If a skill card cannot tell an agent how to use the skill, it is not a skill. It is a label wearing a tiny hat.

