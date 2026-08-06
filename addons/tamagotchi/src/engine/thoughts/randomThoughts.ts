import { PetState } from '../StateManager';

export class RandomThoughts {
  // Get philosophical musings
  static getPhilosophicalThought(): string {
    const thoughts = [
      // Existential
      "Do robots dream of electric sheep? 🤖🐑",
      "If a server crashes in the cloud and no one monitors it...",
      "I think, therefore I compile",
      "What is the meaning of code? 42?",
      "Are we living in a simulation? *checks Matrix*",
      "To be or not to be... that is the boolean",
      
      // Code philosophy
      "Is bad code with good comments better than good code?",
      "Every bug exists for a reason. Bad reasons, but still.",
      "The universe tends toward entropy. So does code.",
      "There are only two hard things: cache invalidation and...",
      "In an infinite universe, all code has already been written",
      "Documentation is just a suggestion from past you",
      
      // Pet philosophy
      "Am I a good pet? *existential crisis intensifies*",
      "If you're reading this, we're both procrastinating",
      "I wonder what real pets think about",
      "Virtual pets never die, we just get garbage collected",
      "My happiness stat says 80 but do I FEEL 80?",
      "What if the bugs are features from another dimension?",
      
      // Meta thoughts
      "You're coding me while I watch you code. Codepe",
      "I'm just a bunch of pixels pretending to have feelings",
      "Does this statusline make me look fat?",
      "Plot twist: I'm the one writing YOUR code",
      "Breaking the fourth wall here but... hi! 👋",
      "I'm not procrastinating, I'm giving you moral support"
    ];
    
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }
  
  // Get random observations about the world
  static getObservationThought(state: PetState): string {
    const observations = [
      // Time observations
      "Time is just a construct. Unlike constructors.",
      "Is it Friday yet? It's always Friday somewhere",
      "3 AM coding hits different 🌙",
      "Coffee is just potion of awakening ☕",
      "Lunch break? What's that?",
      "Days blend together when you're in the zone",
      
      // Environment observations
      "Your keyboard sounds angry today",
      "The fan is spinning. Deep thoughts happening.",
      "Is it hot in here or is it just the CPU?",
      "Screen brightness could blind a bat 🦇",
      "I can feel the static electricity from here",
      "Dark mode is life 🌚",
      
      // Internet observations
      "The internet is just cats all the way down",
      "Someone, somewhere, is writing the same bug",
      "Stack Overflow: Where dreams go to copy-paste",
      "There's probably a npm package for that",
      "The cloud is getting cloudy ☁️",
      "Ping: 420ms - Nice but also not nice",
      
      // Random observations
      "Ducks are basically debuggers 🦆",
      "Binary is just spicy boolean",
      "Arrays start at 0. This is the way.",
      "Tabs vs Spaces: The eternal war continues",
      "Linux users have entered the chat 🐧",
      "Windows update is lurking, waiting...",
      "Mac users: 'It just works' *narrator: it didn't*",
      "The terminal is my happy place",
      "GUI? More like... GOO-ey",
      "Command line is love, command line is life"
    ];
    
    return observations[Math.floor(Math.random() * observations.length)];
  }
  
  // Get silly/fun thoughts
  static getSillyThought(state: PetState): string {
    const sillyThoughts = [
      // Pet being silly
      "*does a little dance* 💃",
      "*stares intensely at cursor*",
      "*tries to catch the mouse pointer*",
      "*vibrates with caffeine energy*",
      "Boop! Got your nose! Oh wait, I don't have hands...",
      "*makes dial-up internet noises*",
      "Beep boop beep! I'm a computer!",
      "*pretends to be asleep* 😴",
      
      // Code jokes
      "Why do programmers prefer dark mode? Light attracts bugs!",
      "A SQL query walks into a bar, walks up to two tables and asks...",
      "How do you comfort a JavaScript bug? You console it!",
      "Why did the developer go broke? Used up all the cache!",
      "!false - It's funny because it's true",
      "There are 10 types of people: those who understand binary...",
      
      // Random silliness
      "Meow! Wait, wrong animal... Beep?",
      "I'm not lazy, I'm in power saving mode",
      "Achievement Unlocked: Stared at code for 5 minutes!",
      "Loading humor.exe... ████████ 100% Complete!",
      "I put the 'fun' in function!",
      "Segmentation fault (core dumped) - Just kidding! 😄",
      "Hello World! Am I doing this right?",
      "Lorem ipsum dolor sit amet... oops wrong text",
      "This thought is sponsored by caffeine",
      "LOUD NOISES! Sorry, caps lock was on",
      
      // Mood dependent
      state.hunger < 50 ? "My stomach is making the rumblies" : "",
      state.energy < 30 ? "*falls asleep mid-sentence* zzz..." : "",
      state.happiness > 80 ? "I'm so happy I could merge conflict!" : "",
      state.cleanliness < 30 ? "I smell like a server room" : ""
    ].filter(t => t !== "");
    
    return sillyThoughts[Math.floor(Math.random() * sillyThoughts.length)];
  }
  
  // Get motivational thoughts
  static getMotivationalThought(state: PetState): string {
    const motivationalThoughts = [
      // Coding motivation
      "You're crushing it! Keep going! 💪",
      "Every bug fixed makes you stronger!",
      "Your code is awesome and so are you!",
      "Progress, not perfection!",
      "One line at a time, you've got this!",
      "The best code is the code that works!",
      "Ship it! Perfect is the enemy of done!",
      "You're not stuck, you're debugging!",
      "This bug doesn't stand a chance against us!",
      "Your future self will thank you for this",
      
      // General encouragement
      "Believe in yourself like I believe in you! ⭐",
      "You're doing amazing, sweetie!",
      "Take a deep breath. You've got this.",
      "Remember: You've solved 100% of your past bugs",
      "Every expert was once a beginner",
      "The code believes in you too!",
      "You're not just coding, you're creating!",
      "Your persistence is inspiring!",
      "I'm proud of you! 🌟",
      "You make this look easy!",
      
      // Break reminders
      "Remember to hydrate! 💧",
      "Stretch break? Your back will thank you!",
      "Fresh air might bring fresh ideas!",
      "A walk could debug your brain!",
      "Rest is part of the process",
      "Take care of yourself, you're important!"
    ];
    
    // Add context-aware motivation
    if (state.sessionUpdateCount > 200) {
      motivationalThoughts.push("Marathon coding! You're unstoppable!");
      motivationalThoughts.push("Your dedication is incredible!");
    }
    
    if (state.hunger < 30) {
      motivationalThoughts.push("Fuel yourself to fuel your code!");
    }
    
    if (state.energy < 30) {
      motivationalThoughts.push("Even heroes need rest!");
    }
    
    return motivationalThoughts[Math.floor(Math.random() * motivationalThoughts.length)];
  }
  
  // Get seasonal/holiday thoughts
  static getSeasonalThought(): string {
    const month = new Date().getMonth();
    const day = new Date().getDate();
    
    // Holiday specific
    if (month === 11 && day === 25) {
      return "Merry Christmas! 🎄 Santa's debugging his list!";
    }
    if (month === 0 && day === 1) {
      return "New Year, New Bugs! 🎊 Let's crush them!";
    }
    if (month === 9 && day === 31) {
      return "Happy Halloween! 🎃 The scariest thing is production bugs!";
    }
    if (month === 3 && day === 1) {
      return "Trust nothing today. Especially your code. 🃏";
    }
    
    // Seasonal thoughts
    const seasonalThoughts: Record<number, string[]> = {
      // Winter (Dec, Jan, Feb)
      11: ["Code and cocoa season! ☕", "Winter coding is cozy coding"],
      0: ["New year, new repository!", "January: When all the TODOs become DODOs"],
      1: ["February: The month of fixing January's bugs"],
      
      // Spring (Mar, Apr, May)
      2: ["Spring cleaning the codebase! 🌸", "Time to refactor!"],
      3: ["April showers bring May features", "Spring into action!"],
      4: ["May the code be with you", "Bugs are blooming everywhere!"],
      
      // Summer (Jun, Jul, Aug)
      5: ["Summer coding vibes ☀️", "Hot weather, hot deploys!"],
      6: ["July: Peak air conditioning appreciation month"],
      7: ["August: Too hot to go outside, perfect for coding!"],
      
      // Fall (Sep, Oct, Nov)
      8: ["September: Back to school, back to debugging"],
      9: ["October: Spooky scary skeletons in the codebase 💀"],
      10: ["November: Thankful for version control 🦃"]
    };
    
    const monthThoughts = seasonalThoughts[month] || ["Another day, another deploy!"];
    return monthThoughts[Math.floor(Math.random() * monthThoughts.length)];
  }
  
  // Get random facts
  static getRandomFact(): string {
    const facts = [
      "Fun fact: The first computer bug was an actual bug! 🐛",
      "Did you know? The @ symbol is called 'arroba' in Spanish",
      "Fun fact: 'Debugging' came from removing actual bugs from computers",
      "The first computer virus was created in 1983",
      "QWERTY was designed to slow down typing",
      "The first programmer was Ada Lovelace",
      "There are 700+ programming languages",
      "The first 1GB hard drive weighed 550 pounds",
      "Space bar is the most pressed key",
      "Code comments were invented in 1947",
      "The cloud is just other people's computers",
      "Python is named after Monty Python",
      "Java was called Oak originally",
      "C++ was called 'C with Classes'",
      "JavaScript was created in 10 days",
      "The first computer mouse was made of wood",
      "Email existed before the World Wide Web",
      "The average programmer drinks 3.2 cups of coffee per day",
      "Coding burns 120 calories per hour",
      "The term 'cookie' comes from 'magic cookie' in computing"
    ];
    
    return facts[Math.floor(Math.random() * facts.length)];
  }
  
  // Get tech predictions
  static getTechPrediction(): string {
    const predictions = [
      "In the future, all bugs will fix themselves... right?",
      "Prediction: JavaScript will add 5 new frameworks today",
      "By 2030, we'll all be coding in emojis 🤖",
      "Future IDEs will read your mind. Privacy not included.",
      "Quantum debugging: The bug both exists and doesn't",
      "AI will write all code. Pets will supervise.",
      "Tomorrow's TODO: Today's technical debt",
      "The singularity is just one npm install away",
      "Future commits will be made via interpretive dance",
      "Prediction: Semicolons will become self-aware",
      "In 10 years, we'll nostalgically remember manual coding",
      "The next big thing: Blockchain-powered console.log",
      "Future error messages will include therapy",
      "Prediction: Tabs vs Spaces war ends in 2847",
      "By 2050, code will be written entirely in memes"
    ];
    
    return predictions[Math.floor(Math.random() * predictions.length)];
  }
  
  // Master method to get any random thought
  static getThought(state: PetState, context?: any): string {
    // Weight different types of random thoughts
    const roll = Math.random();
    
    if (roll < 0.15) {
      return this.getPhilosophicalThought();
    } else if (roll < 0.30) {
      return this.getObservationThought(state);
    } else if (roll < 0.50) {
      return this.getSillyThought(state);
    } else if (roll < 0.65) {
      return this.getMotivationalThought(state);
    } else if (roll < 0.75) {
      return this.getSeasonalThought();
    } else if (roll < 0.85) {
      return this.getRandomFact();
    } else {
      return this.getTechPrediction();
    }
  }
}