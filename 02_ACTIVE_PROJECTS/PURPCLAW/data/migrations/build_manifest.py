import os, re, json
from collections import Counter

lib_dir = 'lib'
import_graph = json.load(open('data/migrations/import-graph.json'))

result = {}
for path, info in import_graph.items():
    fname = os.path.basename(path)
    path_n = path.replace(os.sep, '/')

    cls = None
    batch = None
    risk = 'low'

    # Commands -> tool-runtime
    if '/commands/' in path_n:
        cls = 'tool-runtime'
        batch = 'A'
        risk = 'low'
    # Test helpers
    elif path_n.startswith('lib/__tests__/'):
        cls = 'test-helper'
        batch = 'A'
        risk = 'low'
    elif 'test' in fname.lower() or 'spec' in fname.lower():
        cls = 'test-helper'
        batch = 'A'
        risk = 'low'
    # TTS / telemetry
    elif '/tts/' in path_n:
        cls = 'tool-runtime'
        batch = 'A'
        risk = 'low'
    elif 'telemetry' in path_n:
        cls = 'tool-runtime'
        batch = 'A'
        risk = 'low'
    # Specific known files
    elif path_n == 'lib/event-bus.js':
        cls = 'service-adapter'
        batch = 'B'
        risk = 'medium'
    elif path_n == 'lib/llm-provider.js':
        cls = 'provider'
        batch = 'B'
        risk = 'high'
    elif path_n == 'lib/memory-client.js':
        cls = 'memory'
        batch = 'C'
        risk = 'critical'
    elif path_n == 'lib/agent-gateway.js':
        cls = 'memory'
        batch = 'C'
        risk = 'critical'
    elif path_n == 'lib/smith-neo.js':
        cls = 'orchestration'
        batch = 'C'
        risk = 'high'
    elif path_n == 'lib/harness/engine.js':
        cls = 'harness'
        batch = 'C'
        risk = 'high'
    elif path_n == 'lib/harness/task-schema.js':
        cls = 'harness'
        batch = 'C'
        risk = 'high'
    elif path_n == 'lib/harness/result-schema.js':
        cls = 'harness'
        batch = 'C'
        risk = 'high'
    elif '/harness/' in path_n:
        cls = 'harness'
        batch = 'C'
        risk = 'high'
    elif '/context' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'high'
    elif path_n == 'lib/mcp-server.js':
        cls = 'core-runtime'
        batch = 'B'
        risk = 'high'
    elif '/session' in path_n:
        cls = 'session'
        batch = 'C'
        risk = 'high'
    elif 'scoped-memory' in path_n:
        cls = 'memory'
        batch = 'C'
        risk = 'high'
    elif 'agent-loop' in path_n or 'agent-router' in path_n or 'agent-component' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'high'
    elif '/workflow' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'medium'
    elif '/tool-runtime' in path_n or 'tool-gate' in path_n:
        cls = 'tool-runtime'
        batch = 'B'
        risk = 'medium'
    elif path_n == 'lib/tools/index.js':
        cls = 'tool-implementation'
        batch = 'B'
        risk = 'critical'
    elif 'tools-pc' in path_n:
        cls = 'tool-implementation'
        batch = 'B'
        risk = 'medium'
    elif 'event-workflow' in path_n or 'event-ledger' in path_n:
        cls = 'orchestration'
        batch = 'B'
        risk = 'medium'
    elif 'approval' in path_n:
        cls = 'orchestration'
        batch = 'B'
        risk = 'medium'
    elif 'exec-policy' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'high'
    elif 'secret' in path_n or 'vault' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'high'
    elif 'secrets' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'high'
    elif 'plugin' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'medium'
    elif 'cron' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'low'
    elif 'doctor' in path_n:
        cls = 'compatibility'
        batch = 'A'
        risk = 'low'
    elif 'donor' in path_n:
        cls = 'compatibility'
        batch = 'A'
        risk = 'low'
    elif 'cowork' in path_n:
        cls = 'compatibility'
        batch = 'A'
        risk = 'low'
    elif 'evolution' in path_n or 'self-evolution' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'medium'
    elif 'parity' in path_n:
        cls = 'compatibility'
        batch = 'A'
        risk = 'low'
    elif 'feature-parity' in path_n:
        cls = 'compatibility'
        batch = 'A'
        risk = 'low'
    elif 'awaken' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'medium'
    elif 'index-manager' in path_n:
        cls = 'memory'
        batch = 'C'
        risk = 'medium'
    elif 'omni/truth-scanner' in path_n:
        cls = 'tool-implementation'
        batch = 'B'
        risk = 'medium'
    elif 'routing-decisions' in path_n:
        cls = 'routing'
        batch = 'B'
        risk = 'high'
    elif 'model-router' in path_n:
        cls = 'routing'
        batch = 'B'
        risk = 'high'
    elif 'graph-runtime' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'medium'
    elif 'goal-manager' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'low'
    elif 'eval-manager' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'low'
    elif 'task-manager' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'low'
    elif 'team-manager' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'low'
    elif 'trace-manager' in path_n:
        cls = 'tool-runtime'
        batch = 'A'
        risk = 'low'
    elif 'surface-capabilities' in path_n:
        cls = 'tool-runtime'
        batch = 'B'
        risk = 'low'
    elif 'screen-' in path_n or 'camera' in path_n:
        cls = 'tool-implementation'
        batch = 'A'
        risk = 'low'
    elif 'desktop-launcher' in path_n:
        cls = 'tool-runtime'
        batch = 'A'
        risk = 'low'
    elif 'a2a-runtime' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'medium'
    elif 'code-interpreter' in path_n:
        cls = 'tool-implementation'
        batch = 'B'
        risk = 'high'
    elif 'artifact-manager' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'low'
    elif 'attachment-manager' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'low'
    elif 'invocation-manager' in path_n:
        cls = 'orchestration'
        batch = 'B'
        risk = 'low'
    elif 'instruction-resolver' in path_n:
        cls = 'orchestration'
        batch = 'B'
        risk = 'low'
    elif 'namespace-store' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'low'
    elif 'skill-registry' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'low'
    elif 'usage-governor' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'medium'
    elif 'messaging-runtime' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'medium'
    elif 'path-security' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'high'
    elif 'program-optimizer' in path_n:
        cls = 'compatibility'
        batch = 'A'
        risk = 'low'
    elif 'project-requirements' in path_n:
        cls = 'compatibility'
        batch = 'A'
        risk = 'low'
    elif 'repo-mapper' in path_n:
        cls = 'compatibility'
        batch = 'A'
        risk = 'low'
    elif 'chaos-campaign' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'low'
    elif 'chat-agent' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'low'
    elif 'tower-agent-child' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'medium'
    elif '/runtime/' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'medium'
    elif '/core/' in path_n:
        cls = 'orchestration'
        batch = 'C'
        risk = 'medium'
    elif '/hooks/' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'low'
    elif '/kanban/' in path_n:
        cls = 'core-runtime'
        batch = 'B'
        risk = 'low'
    elif '/tools/parity/' in path_n or '/parity/hooks/' in path_n:
        cls = 'compatibility'
        batch = 'A'
        risk = 'low'
    elif 'api-harness-kernel' in path_n:
        cls = 'harness'
        batch = 'C'
        risk = 'critical'
    elif '/omni/' in path_n:
        cls = 'tool-implementation'
        batch = 'B'
        risk = 'medium'
    else:
        cls = 'unknown'
        batch = 'Z'
        risk = 'high'

    dest_prefix = 'packages/core'
    if cls in ['tool-runtime', 'tool-implementation']:
        dest_prefix = 'packages/tools'
    elif cls in ['test-helper']:
        dest_prefix = 'tests/fixtures'
    elif cls in ['compatibility', 'unknown']:
        dest_prefix = 'packages/shared'

    result[path] = {
        'source': path,
        'destination': f'{dest_prefix}/{path}',
        'classification': cls,
        'batch': batch,
        'risk': risk,
        'importedBy': info.get('imported_by', []),
        'imports': info.get('imports', []),
        'status': 'live',
    }

with open('data/migrations/lib-classification.json', 'w') as f:
    json.dump(result, f, indent=2)

counts = Counter(v['classification'] for v in result.values())
print('Classification counts:')
for k, v in counts.most_common():
    print(f'  {k}: {v}')
print(f'Total: {len(result)}')

# Build path crosswalk
crosswalk = {}
for src, info in result.items():
    crosswalk[src] = {
        'destination': info['destination'],
        'classification': info['classification'],
        'risk': info['risk'],
        'batch': info['batch'],
    }

with open('data/migrations/path-crosswalk.json', 'w') as f:
    json.dump(crosswalk, f, indent=2)
print('Crosswalk written')
