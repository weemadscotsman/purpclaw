const blessed = require('blessed');
const { exec } = require('child_process');

// Agent roster - 26 agents with emoji, name, chaos, and wisdom stats
const AGENTS = [
    { emoji: '🐉', name: 'DRAGON', chaos: 95, wisdom: 72 },
    { emoji: '🐺', name: 'CHONK', chaos: 78, wisdom: 88 },
    { emoji: '👻', name: 'GHOST', chaos: 62, wisdom: 95 },
    { emoji: '🦊', name: 'PYRO', chaos: 99, wisdom: 45 },
    { emoji: '🐱', name: 'NEBULA', chaos: 71, wisdom: 82 },
    { emoji: '🦅', name: 'CIPHER', chaos: 55, wisdom: 97 },
    { emoji: '🐍', name: 'VENOM', chaos: 88, wisdom: 61 },
    { emoji: '🦁', name: 'ROAR', chaos: 84, wisdom: 75 },
    { emoji: '🐻', name: 'BRUISER', chaos: 67, wisdom: 79 },
    { emoji: '🦈', name: 'FIN', chaos: 92, wisdom: 58 },
    { emoji: '🦅', name: 'HAWK', chaos: 73, wisdom: 86 },
    { emoji: '🐺', name: 'HOWL', chaos: 81, wisdom: 69 },
    { emoji: '🦄', name: 'SPARKLE', chaos: 58, wisdom: 94 },
    { emoji: '🐝', name: 'STINGER', chaos: 76, wisdom: 71 },
    { emoji: '🦂', name: 'SCORPIO', chaos: 91, wisdom: 63 },
    { emoji: '🐙', name: 'TENTACLE', chaos: 87, wisdom: 67 },
    { emoji: '🦋', name: 'WHISPER', chaos: 49, wisdom: 98 },
    { emoji: '🐞', name: 'LADYBUG', chaos: 52, wisdom: 91 },
    { emoji: '🦚', name: 'PEACOCK', chaos: 79, wisdom: 77 },
    { emoji: '🦜', name: 'SQUAWK', chaos: 83, wisdom: 60 },
    { emoji: '🦫', name: 'BEAVER', chaos: 64, wisdom: 85 },
    { emoji: '🦘', name: 'BOING', chaos: 86, wisdom: 54 },
    { emoji: '🦔', name: 'SPIKE', chaos: 70, wisdom: 80 },
    { emoji: '🦎', name: 'SCALES', chaos: 74, wisdom: 76 },
    { emoji: '🐢', name: 'SLOWPOKE', chaos: 38, wisdom: 99 },
    { emoji: '🦚', name: 'IRIS', chaos: 56, wisdom: 93 }
];

// Create screen
const screen = blessed.screen({
    smartCSR: true,
    title: 'PURPCLAW Agent Tower'
});

// Create header
const header = blessed.text({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '╔══════════════════════════════════════════════════════════════╗',
    style: {
        fg: 'cyan',
        bold: true
    },
    align: 'center'
});

const header2 = blessed.text({
    parent: screen,
    top: 1,
    left: 0,
    width: '100%',
    height: 3,
    content: '         PURPCLAW AGENT TOWER - NEURAL NETWORK STATUS         ',
    style: {
        fg: 'green',
        bold: true
    },
    align: 'center'
});

const header3 = blessed.text({
    parent: screen,
    top: 2,
    left: 0,
    width: '100%',
    height: 3,
    content: '╚══════════════════════════════════════════════════════════════╝',
    style: {
        fg: 'cyan',
        bold: true
    },
    align: 'center'
});

// Create table data for listtable
const tableData = [
    ['AGENT', 'DESIGNATION', 'STATUS', 'CHAOS', 'WISDOM']
];

AGENTS.forEach(agent => {
    tableData.push([
        agent.emoji,
        agent.name,
        'ONLINE',
        agent.chaos.toString(),
        agent.wisdom.toString()
    ]);
});

// Create listtable for agents
const agentTable = blessed.listtable({
    parent: screen,
    top: 5,
    left: 'center',
    width: '90%',
    height: 20,
    border: {
        type: 'line',
        fg: 'cyan'
    },
    tableStyle: {
        fg: 'white',
        bold: true,
        border: {
            fg: 'cyan'
        },
        header: {
            fg: 'green',
            bold: true,
            align: 'center'
        },
        cell: {
            align: 'center'
        }
    },
    data: tableData
});

// Create footer
const footer = blessed.text({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '  [Q/ESC] Quit  |  PURPCLAW Neural Network v3.077  |  26 Agents Online  ',
    style: {
        fg: 'magenta',
        bold: true
    },
    align: 'center'
});

// Status bar
const statusBar = blessed.text({
    parent: screen,
    bottom: 3,
    left: 0,
    width: '100%',
    height: 3,
    content: `  Network Status: OPERATIONAL  |  Active Agents: ${AGENTS.length}  |  Avg Chaos: ${Math.round(AGENTS.reduce((a, b) => a + b.chaos, 0) / AGENTS.length)}%  |  Avg Wisdom: ${Math.round(AGENTS.reduce((a, b) => a + b.wisdom, 0) / AGENTS.length)}%  `,
    style: {
        fg: 'green'
    },
    align: 'center'
});

// Focus on table
agentTable.focus();

// Quit on Q or Escape
screen.key(['q', 'Q', 'escape', 'escape'], (ch, key) => {
    process.exit(0);
});

// Render screen
screen.render();
