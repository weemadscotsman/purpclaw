'use strict';

/**
 * purpclaw init — scaffold a new project.
 *
 *   purpclaw init <type> [name]    # scaffold a project
 *   purpclaw init --list            # show available types
 *
 * Types: node, python, react, nextjs, python-pip, rust, golang, arduino, bare
 *
 *   purpclaw init node myapi        # creates myapi/
 *   purpclaw init nextjs dashboard  # creates dashboard/ with Next.js
 *   purpclaw init python ml-tool    # creates ml-tool/ with venv + requirements.txt
 */

const fs = require('fs');
const path = require('path');

const PROJECT_TYPES = {
  node: {
    files: {
      'package.json': JSON.stringify({
        name: '{{name}}',
        version: '1.0.0',
        type: 'module',
        main: 'src/index.js',
        scripts: { start: 'node src/index.js', test: 'node --test test/' },
        keywords: [],
        license: 'MIT',
      }, null, 2),
      'src/index.js': `// {{name}}\nconsole.log('Hello from {{name}}');\n`,
      'README.md': `# {{name}}\n\nBuilt with PurpClaw.\n`,
      '.gitignore': `node_modules/\n.env\n*.log\ndist/\nbuild/\n`,
    },
  },
  python: {
    files: {
      '{{name}}/requirements.txt': `# {{name}}\nrequests\n`,
      '{{name}}/__init__.py': `# {{name}}\n__version__ = '0.1.0'\n`,
      '{{name}}/main.py': `#!/usr/bin/env python3\n"""{{name}}"""\n\ndef main():\n    print('Hello from {{name}}')\n\nif __name__ == '__main__':\n    main()\n`,
      '{{name}}/setup.py': `from setuptools import setup, find_packages\nsetup(name='{{name}}', version='0.1.0', packages=find_packages())\n`,
      'README.md': `# {{name}}\n\nBuilt with PurpClaw.\n`,
      '.gitignore': `__pycache__/\n*.py[cod]\n*$py.class\nvenv/\n.venv/\n.env\n*.egg-info/\ndist/\nbuild/\n`,
    },
  },
  react: {
    files: {
      'package.json': JSON.stringify({
        name: '{{name}}',
        version: '1.0.0',
        private: true,
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.3.0', 'react-dom': '^18.3.0' },
        devDependencies: { '@vitejs/plugin-react': '^4.3.0', vite: '^5.4.0' },
      }, null, 2),
      'vite.config.js': `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })\n`,
      'index.html': `<!doctype html>\n<html lang="en">\n  <head><title>{{name}}</title></head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`,
      'src/main.jsx': `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App.jsx'\nReactDOM.createRoot(document.getElementById('root')).render(<App />)\n`,
      'src/App.jsx': `export default function App() {\n  return <h1>Hello from {{name}}</h1>\n}\n`,
      'README.md': `# {{name}}\n\nBuilt with PurpClaw + React.\n`,
      '.gitignore': `node_modules/\n.env\ndist/\nbuild/\n`,
    },
  },
  nextjs: {
    files: {
      'package.json': JSON.stringify({
        name: '{{name}}',
        version: '1.0.0',
        private: true,
        scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
        dependencies: { next: '^15.0.0', react: '^18.3.0', 'react-dom': '^18.3.0' },
      }, null, 2),
      'next.config.js': `/** @type {import('next').NextConfig} */\nconst nextConfig = {}\nmodule.exports = nextConfig\n`,
      'app/page.js': `export default function Page() {\n  return <h1>Hello from {{name}}</h1>\n}\n`,
      'app/layout.js': `export const metadata = { title: '{{name}}' }\nexport default function Layout({ children }) {\n  return <html><body>{children}</body></html>\n}\n`,
      'app/globals.css': `body { font-family: system-ui, sans-serif; margin: 2rem; }\n`,
      'README.md': `# {{name}}\n\nBuilt with PurpClaw + Next.js 15.\n`,
      '.gitignore': `node_modules/\n.env\n.next/\nout/\n`,
    },
  },
  rust: {
    files: {
      'Cargo.toml': `[package]\nname = "{{name}}"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`,
      'src/main.rs': `fn main() {\n    println!("Hello from {{name}}");\n}\n`,
      'README.md': `# {{name}}\n\nBuilt with PurpClaw + Rust.\n`,
      '.gitignore': `target/\n*.exe\n`,
    },
  },
  golang: {
    files: {
      'go.mod': `module {{name}}\n\ngo 1.22\n`,
      'cmd/main.go': `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from {{name}}")\n}\n`,
      'README.md': `# {{name}}\n\nBuilt with PurpClaw + Go.\n`,
      '.gitignore': `*.exe\n{{name}}\ntest Coverage\n`,
    },
  },
  arduino: {
    files: {
      '{{name}}.ino': `// {{name}}\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  Serial.println("Hello from {{name}}");\n  delay(1000);\n}\n`,
      'README.md': `# {{name}}\n\nArduino project built with PurpClaw.\n`,
      '.gitignore': `*.hex\nlib/\n`,
    },
  },
  bare: {
    files: {
      'README.md': `# {{name}}\n\nBuilt with PurpClaw.\n`,
      '.gitignore': `*.o\n*.bin\n*.elf\nbuild/\n`,
    },
  },
};

async function run(args, ctx) {
  const listArg = args.includes('--list') || args.includes('-l');

  if (listArg) {
    console.log('\n\x1b[36mPURPCLAW init — available types:\x1b[0m\n');
    for (const [type, cfg] of Object.entries(PROJECT_TYPES)) {
      const fCount = Object.keys(cfg.files).length;
      console.log(`  ${type.padEnd(10)} ${fCount} file(s)`);
    }
    console.log('\n  Usage: purpclaw init <type> [project-name]\n');
    return;
  }

  const typeArg = args.find(a => !a.startsWith('--'));
  const nameArg = args[args.indexOf(typeArg) + 1];
  const name = nameArg || typeArg || 'myproject';
  const type = PROJECT_TYPES[typeArg] ? typeArg : null;

  if (!type) {
    console.error(`\n\x1b[31mUnknown project type: ${typeArg}\x1b[0m`);
    console.error('  Run \x1b[36mpurpclaw init --list\x1b[0m to see available types.\n');
    return;
  }

  const targetDir = path.resolve(name);
  if (fs.existsSync(targetDir)) {
    console.error(`\n\x1b[31mDirectory already exists: ${targetDir}\x1b[0m\n`);
    return;
  }

  console.log(`\n  \x1b[36mPURPCLAW init\x1b[0m — scaffolding ${type} project as "${name}"`);

  fs.mkdirSync(targetDir, { recursive: true });
  const template = PROJECT_TYPES[type];

  for (const [filePath, content] of Object.entries(template.files)) {
    const actualPath = filePath.replace('{{name}}', name);
    const fullPath = path.join(targetDir, actualPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const actualContent = content.replace(/{{name}}/g, name);
    fs.writeFileSync(fullPath, actualContent, 'utf8');
    console.log(`  \x1b[32m+\x1b[0m ${actualPath}`);
  }

  // Also scaffold purpclaw.toml
  const purpclawToml = `[project]
name = "${name}"
type = "${type}"
version = "0.1.0"

[agent]
permission = "workspace"
model = "auto"

[paths]
read = ["."]
write = ["."]
`;
  fs.writeFileSync(path.join(targetDir, 'purpclaw.toml'), purpclawToml, 'utf8');
  console.log(`  \x1b[32m+\x1b[0m purpclaw.toml`);

  console.log(`\n\x1b[32mProject scaffolded at ./${name}/\x1b[0m\n`);
}

module.exports = { run };
