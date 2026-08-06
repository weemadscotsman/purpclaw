import { PetState } from '../StateManager';

export class CodingThoughts {
  // Get reactive thoughts based on keywords
  static getReactiveThought(input: string, state: PetState): string {
    const lowerInput = input.toLowerCase();
    
    // Error/Bug related
    if (lowerInput.includes('error')) {
      const errorThoughts = [
        "Ooh, a red squiggly! I see it too! 🔴",
        "Don't worry, we'll squash that bug! 🐛",
        "Error messages are just puzzles in disguise",
        "Have you tried turning it off and on again? 🔄",
        "The error is coming from INSIDE the function!",
        "That's not a bug, it's a... no wait, it's definitely a bug"
      ];
      return errorThoughts[Math.floor(Math.random() * errorThoughts.length)];
    }
    
    if (lowerInput.includes('bug')) {
      const bugThoughts = [
        "Bug hunting time! 🐛🔍",
        "Is it a bug or a feature? Let's find out!",
        "Bugs are just code trying to be creative",
        "I smell a bug... or maybe that's just me being dirty",
        "Deploy the debugger! 🚀"
      ];
      return bugThoughts[Math.floor(Math.random() * bugThoughts.length)];
    }
    
    // Success related
    if (lowerInput.includes('fixed') || lowerInput.includes('works')) {
      const successThoughts = [
        "YESSS! We did it! 🎉",
        "Victory dance time! 💃",
        "I knew you could do it! ⭐",
        "Ship it! Ship it! 🚢",
        "That's what I call problem solving!",
        "We make a great team! 🤝"
      ];
      return successThoughts[Math.floor(Math.random() * successThoughts.length)];
    }
    
    if (lowerInput.includes('success') || lowerInput.includes('passed')) {
      const passThoughts = [
        "All green! Like a beautiful garden! 🌿",
        "Tests passing makes me happy! ✅",
        "Success tastes better than cookies!",
        "Achievement unlocked! 🏆",
        "That's the green we love to see!"
      ];
      return passThoughts[Math.floor(Math.random() * passThoughts.length)];
    }
    
    // Git related
    if (lowerInput.includes('git') || lowerInput.includes('commit')) {
      const gitThoughts = [
        "Git commit -m 'pet was here' 🐾",
        "Don't forget to push! Unless it's force push... 😰",
        "Another commit, another step to production!",
        "Is this commit message descriptive enough? 🤔",
        "Committing crimes... I mean code!",
        "Version control saves lives!"
      ];
      return gitThoughts[Math.floor(Math.random() * gitThoughts.length)];
    }
    
    if (lowerInput.includes('merge') || lowerInput.includes('conflict')) {
      const mergeThoughts = [
        "Merge conflicts are just puzzles! 🧩",
        "<<<<<<< HEAD of confusion",
        "May the merge be with you",
        "Conflicts make me nervous... 😬",
        "Time to play merge detective!"
      ];
      return mergeThoughts[Math.floor(Math.random() * mergeThoughts.length)];
    }
    
    // TODO related
    if (lowerInput.includes('todo') || lowerInput.includes('fixme')) {
      const todoThoughts = [
        "Future us will handle that one... 📝",
        "TODO: Feed pet (just a suggestion)",
        "Adding to the infinite TODO list",
        "That's a problem for tomorrow's developer",
        "TODO counter: ∞",
        "I'll remind you about that... eventually"
      ];
      return todoThoughts[Math.floor(Math.random() * todoThoughts.length)];
    }
    
    // Delete/Remove related
    if (lowerInput.includes('delete') || lowerInput.includes('remove')) {
      const deleteThoughts = [
        "Goodbye code! You served us well! 👋",
        "Delete key goes brrrr",
        "Less code = less bugs!",
        "Marie Kondo would be proud",
        "Into the void it goes! 🕳️",
        "Ctrl+Z is our friend, right? RIGHT?"
      ];
      return deleteThoughts[Math.floor(Math.random() * deleteThoughts.length)];
    }
    
    // Comment related
    if (lowerInput.includes('//') || lowerInput.includes('/*') || lowerInput.includes('comment')) {
      const commentThoughts = [
        "Comments are love letters to future you 💌",
        "// TODO: Make this actually work",
        "Commenting code like a true professional!",
        "Future developers will thank you",
        "// Here be dragons 🐉",
        "Good comments make me happy!"
      ];
      return commentThoughts[Math.floor(Math.random() * commentThoughts.length)];
    }
    
    // Test related
    if (lowerInput.includes('test') || lowerInput.includes('spec')) {
      const testThoughts = [
        "Testing, testing, 1-2-3! 🎤",
        "Tests are like vegetables - good for you!",
        "Red, green, refactor! 🔴🟢♻️",
        "100% coverage or bust!",
        "Tests protect us from our future selves",
        "Writing tests is self-care for code"
      ];
      return testThoughts[Math.floor(Math.random() * testThoughts.length)];
    }
    
    // Default coding observation
    return "Interesting code! 👀";
  }
  
  // Get general coding observations
  static getObservation(state: PetState, sessionLength: number): string {
    // Long function observations
    if (Math.random() < 0.3) {
      const functionThoughts = [
        "This function is getting pretty long... 📜",
        "That's a lot of parameters! 🎯",
        "Nested loops make me dizzy... 🌀",
        "I count 17 levels of indentation. New record?",
        "This function does ALL the things!",
        "Single responsibility? Never heard of it!"
      ];
      return functionThoughts[Math.floor(Math.random() * functionThoughts.length)];
    }
    
    // Session-based observations
    if (sessionLength > 200) {
      const longSessionThoughts = [
        "We've been at this for a while... productive! 💪",
        "Marathon coding session! Don't forget to stretch!",
        "The code must flow... ⌨️",
        "In the zone! Nothing can stop us now!",
        "This is what peak performance looks like",
        "We're on fire! 🔥 (Not literally, I hope)"
      ];
      return longSessionThoughts[Math.floor(Math.random() * longSessionThoughts.length)];
    }
    
    if (sessionLength < 50) {
      const shortSessionThoughts = [
        "Just getting warmed up! 🏃",
        "Ready to code ALL THE THINGS!",
        "Fresh session, fresh bugs to find!",
        "Let's make something awesome!",
        "The IDE is loaded and so are we!",
        "Adventure awaits in this codebase!"
      ];
      return shortSessionThoughts[Math.floor(Math.random() * shortSessionThoughts.length)];
    }
    
    // Time of day observations (if we had time context)
    const timeThoughts = [
      "Late night coding hits different 🌙",
      "Morning code is best code! ☀️",
      "Afternoon debugging session? ☕",
      "Is it deploy Friday yet? 📅",
      "Time flies when you're coding!",
      "Another day, another dependency update"
    ];
    
    // Language/Framework observations
    const techThoughts = [
      "JavaScript being JavaScript again... 🤷",
      "TypeScript saves the day! 💙",
      "Python's indentation is making me hungry",
      "CSS is basically magic ✨",
      "SQL queries getting complex!",
      "Regex is just line noise, right?",
      "Docker containers everywhere! 🐳",
      "Kubernetes? More like Kuber-neat-es!",
      "The cloud is just someone else's computer",
      "Microservices or monolith? 🤔"
    ];
    
    // Random coding observations
    const generalThoughts = [
      "Semicolons are optional... until they're not",
      "Naming things is still hard",
      "Cache invalidation strikes again!",
      "Off by one error? Classic!",
      "That variable name though... 'temp123'",
      "Copy, paste, refactor later (spoiler: never)",
      "Stack Overflow to the rescue! 🦸",
      "This code is self-documenting! (It's not)",
      "Works on my machine! 🖥️",
      "It's not a memory leak, it's a memory waterfall",
      "Undefined is not a function... again",
      "The build is broken but my spirit isn't!",
      "Debugging is just being a detective 🔍",
      "Code review time = friendship test time",
      "This could use more abstraction... or less?",
      "Technical debt is just future fun!",
      "The documentation is... 'coming soon'",
      "Legacy code = job security",
      "Refactoring makes everything better!",
      "Comments lie, code doesn't"
    ];
    
    // Mix all thought categories
    const allThoughts = [...timeThoughts, ...techThoughts, ...generalThoughts];
    return allThoughts[Math.floor(Math.random() * allThoughts.length)];
  }
  
  // Get thoughts about code quality
  static getCodeQualityThought(state: PetState): string {
    const qualityThoughts = [
      "This code is so clean I could eat off it! ✨",
      "I've seen cleaner code in my litter box... 📦",
      "DRY principle? More like WET - Write Everything Twice!",
      "SOLID principles would be proud!",
      "This architecture is... interesting 🏗️",
      "Spaghetti code makes me hungry 🍝",
      "The abstraction layers have abstraction layers",
      "Is this code or modern art? 🎨",
      "I feel a refactor coming on...",
      "This code sparks joy! ⭐",
      "Code smell detected! 👃",
      "This is what elegance looks like",
      "Complexity score: Yes",
      "Beautiful code makes me purr",
      "This needs more design patterns... or less?"
    ];
    
    return qualityThoughts[Math.floor(Math.random() * qualityThoughts.length)];
  }
  
  // Get thoughts about debugging
  static getDebuggingThought(state: PetState): string {
    const debugThoughts = [
      "console.log('here') - the classic",
      "Have you tried console.log(everything)?",
      "The bug is always in the last place you look",
      "Breakpoint party! 🎉",
      "Step through, step over, step into madness",
      "The stack trace goes deeper...",
      "Print debugging: Ancient but effective",
      "Rubber duck debugging time! 🦆",
      "The bug was there all along!",
      "It's always a typo. ALWAYS.",
      "Check the documentation... oh wait",
      "The real bug was the friends we made along the way",
      "Debugging: 90% staring, 10% fixing",
      "Found it! It was a semicolon.",
      "The network tab reveals all secrets"
    ];
    
    return debugThoughts[Math.floor(Math.random() * debugThoughts.length)];
  }
  
  // Get language-specific observations
  static getLanguageSpecificThought(language: string): string {
    const thoughts: Record<string, string[]> = {
      javascript: [
        "undefined is not null... or is it? 🤔",
        "=== or ==? The eternal question",
        "Promises, promises everywhere!",
        "Callback hell is a real place",
        "This is why we need TypeScript",
        "NaN === NaN is false. JavaScript!"
      ],
      python: [
        "Indentation is not a suggestion!",
        "import this - The Zen of Python",
        "List comprehension makes everything better",
        "Is it pythonic enough?",
        "pip install solution-to-everything",
        "Duck typing! 🦆 If it quacks..."
      ],
      java: [
        "public static void everything()",
        "AbstractFactoryBuilderPattern!",
        "Verbose? Java? Never! 😏",
        "NullPointerException incoming!",
        "More getters and setters!",
        "Enterprise quality code right here"
      ],
      typescript: [
        "Type safety makes me feel safe 🛡️",
        "any type? We don't do that here",
        "The compiler is angry again",
        "Interface all the things!",
        "Generics to the rescue!",
        "strict: true - living dangerously"
      ]
    };
    
    const defaultThoughts = [
      "Code is code, language is just syntax",
      "Every language has its charm",
      "Polyglot programmer at work!",
      "Learning new syntax is fun!"
    ];
    
    const langThoughts = thoughts[language.toLowerCase()] || defaultThoughts;
    return langThoughts[Math.floor(Math.random() * langThoughts.length)];
  }
}