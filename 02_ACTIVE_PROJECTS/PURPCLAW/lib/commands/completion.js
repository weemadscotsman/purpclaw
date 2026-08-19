'use strict';
/**
 * lib/commands/completion.js — shell completion for purpclaw.
 *
 *   purpclaw completion bash
 *   purpclaw completion zsh
 *   purpclaw completion powershell
 *
 * Completion data derives from lib/cli/registry.js — the same table that
 * drives dispatch and help, never a second hand-maintained list.
 */
const REGISTRY = require('../cli/registry');

function names() {
  return REGISTRY.commands().map(c => c.name);
}

function bash() {
  const cmds = names().join(' ');
  return '# purpclaw bash completion\n'
    + '_purpclaw_completions() {\n'
    + '  local cur="${COMP_WORDS[COMP_CWORD]}"\n'
    + '  local cmds="' + cmds + '"\n'
    + '  COMPREPLY=( $(compgen -W "$cmds" -- "$cur") )\n'
    + '}\n'
    + 'complete -F _purpclaw_completions purpclaw\n';
}

function zsh() {
  const cmds = names().join(' ');
  return '#compdef purpclaw\n'
    + '# purpclaw zsh completion\n'
    + '_purpclaw() {\n'
    + '  local -a cmds\n'
    + '  cmds=(' + cmds.split(' ').join(' ') + ')\n'
    + '  _describe \'command\' cmds\n'
    + '}\n'
    + '_purpclaw "$@"\n';
}

function powershell() {
  const cmds = names().join(' ');
  return '# purpclaw PowerShell completion\n'
    + 'Register-ArgumentCompleter -Native -CommandName purpclaw -ScriptBlock {\n'
    + '  param($wordToComplete)\n'
    + "  $cmds = '" + cmds + "' -split ' '\n"
    + '  $cmds | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {\n'
    + "    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)\n"
    + '  }\n'
    + '}\n';
}

function run(args) {
  const shell = (args[0] || '').toLowerCase();
  const script = shell === 'bash' ? bash() : shell === 'zsh' ? zsh() : shell === 'powershell' || shell === 'pwsh' ? powershell() : null;
  if (!script) {
    console.error('Usage: purpclaw completion <bash|zsh|powershell>');
    console.error('  bash:       eval "$(purpclaw completion bash)"');
    console.error('  zsh:        purpclaw completion zsh > ~/.zfunc/_purpclaw');
    console.error('  powershell: Add to $PROFILE');
    process.exit(2);
  }
  process.stdout.write(script);
  return Promise.resolve();
}

module.exports = { name: 'completion', run };
