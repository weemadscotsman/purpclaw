export interface TranscriptSegment {
  time: string;
  text: string;
}

export const transcriptData: TranscriptSegment[] = [
  {
    time: "13:40",
    text: "That's kind of like the next layer of irony is that that new clean room rewrite is DMCA proof. Enthropic can't touch it. Claw Code also launched"
  },
  {
    time: "13:50",
    text: "with a a press release very very publicly. And as a part of the leak,"
  },
  {
    time: "13:54",
    text: "we've uncovered that claude code. Part of that they had this undercover mode where basically they would use claude code to go and change various repos. It"
  },
  {
    time: "14:03",
    text: "was specifically said that claude code shouldn't ever say that cloud code made any of it or made any changes. So it's basically a way for anthropic to hide"
  },
  {
    time: "14:11",
    text: "anthropic's involvement in insert development processes. That mode, that feature got leaked in this process. I mean you you can't make this stuff up."
  },
  {
    time: "14:20",
    text: "It happened on April Fools. I mean, you can't make this stuff up. This is real life. But really fast, I do think it's important for us to point out this"
  },
  {
    time: "14:28",
    text: "article by Jyn. So again, he's the person behind a lot of this. And so his initial point about the fact that developers are excited or terrified. You"
  },
  {
    time: "14:36",
    text: "know, this is what a lot of people are going to be talking about. How is it possible to create a clean room implementation of something this massive in two hours? How does how does it"
  },
  {
    time: "14:44",
    text: "affect the software development industry? But his point, what he's saying is is something a little bit different. And keep in mind this is a"
  },
  {
    time: "14:51",
    text: "person with 25 billion cloudcoded tokens that were used. This is a person that somewhere else he mentions that he's obsessed with the agentic scaffolding."
  },
  {
    time: "15:00",
    text: "So this is somebody that lives and breathes AI agents. He's saying if you're staring at the generated Python files, you're looking at the wrong"
  },
  {
    time: "15:07",
    text: "layer. The code is a byproduct. The Rust port that followed is also a byproduct."
  },
  {
    time: "15:11",
    text: "The thing worth studying in the claw code repository is the system that produced all of it. Claw code was always a showcase. The point was never the"
  },
  {
    time: "15:19",
    text: "Python files or the Rust crate. The point was the Clawip based agent coordination system that built them while the developer was asleep. By the"
  },
  {
    time: "15:27",
    text: "way, I'm still trying to understand everything within the system. So, keep in mind it's been less than 48 hours at this point. So, I think everyone's"
  },
  {
    time: "15:35",
    text: "slowly processing everything, but there's like a lot to process. So, Claw Whip is this harness engine. I think this whole thing will deserve its own video down the road. So he continues,"
  },
  {
    time: "15:45",
    text: "\"Here's what the system actually looks like in practice. A person opens a Discord on their phone, types in a sentence, and puts the phone down. They might go make coffee. They might go to sleep. The agents read the message,"
  },
  {
    time: "15:55",
    text: "break the work into tasks, assign roles amongst themselves, write code, test it, argue over it, fix what fails, and push."
  },
  {
    time: "16:02",
    text: "When everything passes, the person checks back in the morning. The port is done. No terminal, no IDE, no SSH session, no split pane Vim setup,"
  },
  {
    time: "16:11",
    text: "Discord, a chat.\" By the way, if you don't know what these things mean,"
  },
  {
    time: "16:15",
    text: "that's kind of the point. We're approaching a time or maybe we're in the time when maybe you no longer need to. I know a big part of people watching are"
  },
  {
    time: "16:24",
    text: "developers. The people who are non-developers, pay attention because maybe you have never used a terminal or you know what SSH is, but if you can use"
  },
  {
    time: "16:32",
    text: "a chat app, the amount of things that you're going to be able to to do with that by relying on these AI coding agents, well, it's changing rapidly. By"
  },
  {
    time: "16:41",
    text: "the way, it doesn't mean that you don't have to learn anything, but it might mean that this is like the best time to start learning a lot of this stuff. He continues, \"This is the part that most"
  },
  {
    time: "16:49",
    text: "people skip over, right? The read includes the screenshots of the OMX, oh my codeex workflow running in terminal panes, and people assume the developer"
  },
  {
    time: "16:56",
    text: "was sitting in front of those panes the whole time, manually steering each step."
  },
  {
    time: "17:00",
    text: "The terminal sessions belong to the agent. The human's interface was a Discord channel, a text box, a send button. three tools that make this work"
  },
  {
    time: "17:09",
    text: "and they each handle a different part of the problem. I'm going to quickly summarize, but do read this article."
  },
  {
    time: "17:13",
    text: "It's not that long and uh it's going to be an important one. It has 66,000 views. That's criminally low. So, he"
  },
  {
    time: "17:20",
    text: "mentions the Oh my CEX OMX. So, that was built on top of OpenI's open- source codeex. Then we have Clawhip or I assume"
  },
  {
    time: "17:28",
    text: "it's claw. The claw whip like you're whipping the claw, I'm assuming. Clawhip is the notification and event router running as a background demon. It"
  },
  {
    time: "17:36",
    text: "watches git commits, github issues and etc etc. The point is this thing claw whip keeps all monitoring work outside"
  },
  {
    time: "17:43",
    text: "of the agents context window and the oh my open agent provides the coordination logic between multiple agent. Here's kind of the important part. None of"
  },
  {
    time: "17:51",
    text: "these tools alone would have shipped clock code in an hour. Wired together they form a closed development loop. The human provides directions through"
  },
  {
    time: "17:59",
    text: "discord. The agents provide labor. The human that kicked off the process they may be sleeping. they might be making themselves a sand the agents they keep  behind those events was specific and practic here it is stop staying up all night at hackathons typing code by hand"
  },
  {
    time: "18:25",
    text: "that era is over instead spend your energy designing agent systems and setting up the coordination between them"
  },
  {
    time: "18:32",
    text: "you sleep they work. And here's kind of the next smart question to ask. If you've sort of internalized what he's saying, this idea that you should no"
  },
  {
    time: "18:41",
    text: "longer be the one writing code, you should be building systems, the processes that that build the code, optimizing agentic swarms, as it were,"
  },
  {
    time: "18:49",
    text: "right? If if if that's the thing that you should be doing, if that's the thing, that's the new desired skill,"
  },
  {
    time: "18:54",
    text: "that's the killer skill, what's the next important question? Well, when a system can port an entire codebase in 60 minutes, what becomes expensive? And the"
  },
  {
    time: "19:01",
    text: "answer is knowing what to build, knowing why, understanding how the pieces should fit together, having a clear mental model of the target architecture, being"
  },
  {
    time: "19:09",
    text: "able to decompose that into tasks an agent can execute, and knowing how to set up the coordination so multiple agents stay productive in parallel."
  },
  {
    time: "19:18",
    text: "These are the skills that get more valuable as agents get stronger. A faster agent does not reduce the need for clear thinking. It increases it."
  },
  {
    time: "19:25",
    text: "There's a specific fear floating around the developer communities right now. The worries that AI will type faster than humans and make them unnecessary. Claw"
  },
  {
    time: "19:33",
    text: "code looks like confirmation of that fear on the surface. One hour an entire system rebuilt. But look at what the developer actually did during that hour."
  },
  {
    time: "19:41",
    text: "He typed maybe 10 sentences into a Discord channel. The skill that produced clock code was not typing speed. It was architectural clarity, task"
  },
  {
    time: "19:50",
    text: "decomposition, and system design. Those do not get cheaper as agents improve."
  },
  {
    time: "19:54",
    text: "They get scarce. Please do read this article cuz there's tons of stuff in there. This person is a very clear thinker, a great author. He's slicing"
  },
  {
    time: "20:03",
    text: "through time and showing you a glimpse into the future. I wish I could do it justice, but I also don't want to read the whole thing. So, please, please read it. I'll I'll link it. What I'll do is"
  },
  {
    time: "20:11",
    text: "I'll have a link to a post that's going to have all of this, including all of the links, and little summaries that's going to go out as part of my newsletter. You should sign up, but all"
  },
  {
    time: "20:19",
    text: "of this will be available whether or not you're signed up for the newsletter,"
  },
  {
    time: "20:22",
    text: "including links to everything that we've talked about here. But his point is that the gap between can build and cannot build is closing fast. Developers used"
  },
  {
    time: "20:30",
    text: "to compete on what they could build. Now that differentiator is kind of being erased. So what do people compete on instead? Well, noise, visibility judgement tast connewctio and reliability are a must"
  }
];
