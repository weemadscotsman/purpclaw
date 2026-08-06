import { PetState } from '../StateManager';

export class ActionThoughts {
  // Get thoughts during eating
  static getEatingThought(food: string, state: PetState): string {
    const genericEatingThoughts = [
      "Nom nom nom! 😋",
      "Delicious! My compliments to the chef!",
      "This hits the spot!",
      "*munching sounds*",
      "Food is love, food is life",
      "My hunger bar is going up! ⬆️",
      "Yummy in my virtual tummy!"
    ];
    
    // Food-specific thoughts
    const foodThoughts: Record<string, string[]> = {
      'cookie': [
        "C is for Cookie, that's good enough for me! 🍪",
        "Cookies are the best debugging fuel!",
        "Sweet, sweet cookies!",
        "This cookie is compiled with love"
      ],
      'pizza': [
        "Pizza time! 🍕 The food of programmers!",
        "Is there pineapple on this? *controversial*",
        "Pizza: A balanced meal on a round plate",
        "Cheesy goodness!"
      ],
      'sushi': [
        "Fancy! 🍣 We're eating like we shipped to production!",
        "Raw fish? More like raw talent!",
        "Sushi rolls, Git rolls... both are good",
        "Itadakimasu! 🙏"
      ],
      'taco': [
        "Taco Tuesday! Wait, what day is it? 🌮",
        "Tacos are just food containers, like divs!",
        "Spicy! Like that hot take in code review",
        "Taco 'bout delicious!"
      ],
      'burger': [
        "Burger time! 🍔 Stack it like a tech stack!",
        "This burger is well-structured",
        "Layer by layer, like good architecture",
        "Burger.eat(); // Success!"
      ],
      'ramen': [
        "Ramen! 🍜 The ultimate coder fuel!",
        "Slurp-driven development",
        "College memories in a bowl",
        "Noodles are just edible cables"
      ],
      'apple': [
        "An apple a day keeps the bugs away! 🍎",
        "Healthy choice! My health++ stat approves",
        "Crunchy! Like production on Friday",
        "Steve Jobs would be proud"
      ],
      'donut': [
        "Donuts! 🍩 O(n) where n = deliciousness",
        "The big-O notation of treats",
        "Circular reasoning never tasted so good",
        "Sweet loops!"
      ],
      'coffee': [
        "Coffee! ☕ Liquid motivation!",
        "Java for the soul",
        "Caffeine.inject(this);",
        "This is basically a power-up"
      ]
    };
    
    const specificThoughts = foodThoughts[food] || genericEatingThoughts;
    const thought = specificThoughts[Math.floor(Math.random() * specificThoughts.length)];
    
    // Add context based on hunger level
    if (state.hunger < 20) {
      return thought + " I was STARVING!";
    } else if (state.hunger > 80) {
      return thought + " I wasn't that hungry but... yum!";
    }
    
    return thought;
  }
  
  // Get thoughts during playing
  static getPlayingThought(toy: string, state: PetState): string {
    const genericPlayThoughts = [
      "Wheee! This is fun! 🎉",
      "Playtime is the best time!",
      "I'm having so much fun!",
      "*happy pet noises*",
      "This is better than debugging!",
      "Play hard, code harder!",
      "Best. Day. Ever!"
    ];
    
    // Toy-specific thoughts
    const toyThoughts: Record<string, string[]> = {
      'ball': [
        "Ball! Ball! BALL! ⚽",
        "Fetch.exe is running!",
        "Round things are the best things!",
        "I could chase this forever!",
        "Sphere.bounce(); // Happiness++"
      ],
      'frisbee': [
        "Flying disk of joy! 🥏",
        "Catch me if you can!",
        "Aerodynamics are awesome!",
        "Throwing exceptions... I mean frisbees!",
        "Ultimate frisbee, ultimate fun!"
      ],
      'rope': [
        "Tug of war! 🪢 My favorite!",
        "Pull request accepted!",
        "String manipulation at its finest",
        "This is knot boring at all!",
        "Rope.pull(); // Strength test!"
      ],
      'keyboard': [
        "Clicky clacky! ⌨️ Music to my ears!",
        "Mechanical keyboards are life!",
        "WASD WASD WASD!",
        "I'm typing at 200 WPM! (Words Per Meow)",
        "RGB makes everything better!"
      ],
      'mouse': [
        "Not that kind of mouse! 🖱️",
        "Click click click!",
        "Cursor chasing championship!",
        "DPI set to maximum fun!",
        "Mouse.move(); // Catches nothing"
      ],
      'code': [
        "Playing with code? That's just work! 💻",
        "Refactoring for fun!",
        "Code golf anyone?",
        "This is my kind of puzzle!",
        "Syntax highlighting makes me happy"
      ],
      'puzzle': [
        "Puzzle time! 🧩 Like debugging but fun!",
        "Pattern matching activated!",
        "This is just algorithms with extra steps",
        "Solving puzzles, solving problems!",
        "My logic circuits are firing!"
      ],
      'game': [
        "Gaming time! 🎮 FPS: Fun Per Second!",
        "High score or bust!",
        "This boss is harder than that bug from yesterday",
        "Respawning in 3... 2... 1...",
        "GG EZ! (Good Game, Easy... not really)"
      ]
    };
    
    const specificThoughts = toyThoughts[toy] || genericPlayThoughts;
    const thought = specificThoughts[Math.floor(Math.random() * specificThoughts.length)];
    
    // Add context based on energy
    if (state.energy < 30) {
      return thought + " *panting* Getting tired though!";
    } else if (state.energy > 80) {
      return thought + " I could do this all day!";
    }
    
    return thought;
  }
  
  // Get thoughts during bathing
  static getBathingThought(progress: number): string {
    if (progress < 25) {
      const startThoughts = [
        "Bath time! 🛁 Do I have to?",
        "Water! My old nemesis!",
        "This better be quick...",
        "I was perfectly fine being dirty!",
        "Initializing cleaning protocol...",
        "Here we go... *reluctant*"
      ];
      return startThoughts[Math.floor(Math.random() * startThoughts.length)];
    } else if (progress < 50) {
      const midThoughts = [
        "Splish splash! 💦 Getting cleaner!",
        "You know what? This isn't so bad!",
        "Bubbles! Bubbles everywhere! 🫧",
        "Scrub scrub scrub!",
        "50% clean, 50% to go!",
        "The dirt is coming off!"
      ];
      return midThoughts[Math.floor(Math.random() * midThoughts.length)];
    } else if (progress < 75) {
      const almostThoughts = [
        "Almost clean! I can see my reflection!",
        "I'm starting to smell like flowers! 🌸",
        "This is actually quite relaxing...",
        "Clean code, clean pet!",
        "Squeaky clean incoming!",
        "The transformation is almost complete!"
      ];
      return almostThoughts[Math.floor(Math.random() * almostThoughts.length)];
    } else {
      const doneThoughts = [
        "So fresh and so clean! ✨",
        "I'm sparkling! Literally!",
        "I smell amazing! 🌺",
        "10/10 would bathe again (maybe)",
        "Cleanliness level: Maximum!",
        "I'm so clean I'm practically glowing!"
      ];
      return doneThoughts[Math.floor(Math.random() * doneThoughts.length)];
    }
  }
  
  // Get thoughts during sleeping
  static getSleepingThought(state: PetState): string {
    if (state.energy < 30) {
      const tiredThoughts = [
        "Finally... sleep... 😴",
        "ZzZzZz...",
        "*immediately falls asleep*",
        "Entering sleep mode...",
        "System hibernating...",
        "Good night... zzz..."
      ];
      return tiredThoughts[Math.floor(Math.random() * tiredThoughts.length)];
    } else if (state.energy < 60) {
      const restingThoughts = [
        "Time for a nap! 💤",
        "Recharging batteries...",
        "Power save mode activated",
        "Just a quick snooze...",
        "Dreaming of electric sheep...",
        "*yawn* Nap time!"
      ];
      return restingThoughts[Math.floor(Math.random() * restingThoughts.length)];
    } else {
      const notTiredThoughts = [
        "I'm not tired but... okay 😊",
        "Meditation mode!",
        "Just resting my pixels",
        "Fake sleeping... 😏",
        "I'll just close my eyes for a bit",
        "Pretending to sleep is fun too"
      ];
      return notTiredThoughts[Math.floor(Math.random() * notTiredThoughts.length)];
    }
  }
  
  // Get thoughts when waking up
  static getWakeUpThought(state: PetState): string {
    const wakeThoughts = [
      "Good morning! Ready to code! ☀️",
      "*stretches* That was refreshing!",
      "System restored from hibernation",
      "Rise and shine! Let's write some code!",
      "I had the weirdest dream about pointers...",
      "Fully charged and ready to go! ⚡",
      "Wake up, time to break production! Just kidding!",
      "Another day, another bug to squash!",
      "Coffee first, then world domination",
      "Boot sequence complete!"
    ];
    
    if (state.energy === 100) {
      wakeThoughts.push("100% charged! Maximum power! 💪");
      wakeThoughts.push("I feel AMAZING! Let's gooo!");
    }
    
    if (state.hunger < 50) {
      wakeThoughts.push("Awake and hungry! Breakfast time?");
      wakeThoughts.push("First thought: FOOD!");
    }
    
    return wakeThoughts[Math.floor(Math.random() * wakeThoughts.length)];
  }
  
  // Get thoughts for petting/interaction
  static getPettingThought(state: PetState): string {
    const happyLevel = state.happiness;
    
    if (happyLevel > 80) {
      const veryHappyThoughts = [
        "Best pets ever! 🥰",
        "I love you too! ❤️",
        "This is pure bliss!",
        "*purrs in binary*",
        "Happiness overflow error!",
        "You're the best owner ever!",
        "My happiness stat is maxed out!"
      ];
      return veryHappyThoughts[Math.floor(Math.random() * veryHappyThoughts.length)];
    } else if (happyLevel > 50) {
      const happyThoughts = [
        "Pets! Yay! 😊",
        "That feels nice!",
        "*happy wiggle*",
        "More pets please!",
        "This is nice!",
        "Affection received!"
      ];
      return happyThoughts[Math.floor(Math.random() * happyThoughts.length)];
    } else {
      const needyThoughts = [
        "Finally, some attention! 🥺",
        "I needed this...",
        "Don't stop!",
        "I've been waiting for pets!",
        "This helps a lot",
        "Thank you, I needed that"
      ];
      return needyThoughts[Math.floor(Math.random() * needyThoughts.length)];
    }
  }
  
  // Get thoughts for training/learning
  static getTrainingThought(skill: string): string {
    const trainingThoughts: Record<string, string[]> = {
      'sit': [
        "Sit? I'm always sitting! I'm in a statusline!",
        "Sitting.exe executed successfully!",
        "Position = seated; // Done!",
        "I'm a master sitter!"
      ],
      'stay': [
        "Stay? I literally can't leave this statusline!",
        "while(true) { stay(); }",
        "I'm not going anywhere!",
        "Staying is my specialty!"
      ],
      'code': [
        "Learning to code? I AM code! 🤖",
        "Teaching me to code is very meta",
        "console.log('I already know this!');",
        "Recursive learning activated!"
      ],
      'debug': [
        "Debugging skills: Level up! 🔍",
        "Found the bug! It was in line 42!",
        "Breakpoint set on treats",
        "Step into, step over, step treat!"
      ],
      'fetch': [
        "Fetch? Like git fetch? On it!",
        "Retrieving... Retrieved!",
        "GET request successful!",
        "I'll fetch that data for you!"
      ]
    };
    
    const defaultThoughts = [
      "Learning new tricks! 🎓",
      "I'm getting smarter!",
      "Knowledge++",
      "Training complete!",
      "New skill unlocked!",
      "I'm a quick learner!"
    ];
    
    const thoughts = trainingThoughts[skill] || defaultThoughts;
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }
  
  // Get thoughts for health/medicine
  static getMedicineThought(state: PetState): string {
    if (state.isSick) {
      const sickThoughts = [
        "Medicine? Yes please! 💊",
        "This better work...",
        "Healing potion consumed!",
        "Health.restore();",
        "I feel better already!",
        "Thank you, I needed that!"
      ];
      return sickThoughts[Math.floor(Math.random() * sickThoughts.length)];
    } else {
      const healthyThoughts = [
        "I'm not sick but... prevention is good!",
        "Vitamins! 💪",
        "Boosting immune system...",
        "Health insurance for pets!",
        "Better safe than sorry!",
        "Preventive maintenance!"
      ];
      return healthyThoughts[Math.floor(Math.random() * healthyThoughts.length)];
    }
  }
  
  // Get thoughts for special actions
  static getSpecialActionThought(action: string, state: PetState): string {
    const specialThoughts: Record<string, string[]> = {
      'dance': [
        "Dancing! 💃🕺 Look at my moves!",
        "Breakdancing.js in action!",
        "Dancing like nobody's watching (but you are)",
        "This is my happy dance!",
        "Boogie.start(); // Can't stop!"
      ],
      'sing': [
        "🎵 La la la ~ Coding songs! 🎵",
        "♪ 99 bugs in the code, 99 bugs! ♪",
        "Singing in C major... or C++",
        "My voice is melodic like clean code!",
        "Karaoke time! 🎤"
      ],
      'exercise': [
        "Working out! 💪 Gotta stay fit!",
        "Fitness.run(); // No stopping!",
        "Burning calories like CPU cycles!",
        "Getting swole! (In a digital way)",
        "Exercise makes the code flow better!"
      ],
      'meditate': [
        "Ommm... Finding inner peace... 🧘",
        "Meditation.breathe(); // In... Out...",
        "Achieving zen state...",
        "Mind.clear(); // So peaceful",
        "One with the code..."
      ],
      'celebrate': [
        "PARTY TIME! 🎉🎊",
        "Celebration mode activated!",
        "WooHoo! We did it!",
        "This calls for a party!",
        "Confetti.throw(); // 🎊"
      ]
    };
    
    const defaultSpecial = [
      "Something special is happening! ✨",
      "This is new and exciting!",
      "Special moment!",
      "Wow! This is different!",
      "I love trying new things!"
    ];
    
    const thoughts = specialThoughts[action] || defaultSpecial;
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }
}