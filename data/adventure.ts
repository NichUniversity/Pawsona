export type StoryAttribute =
  | "speed"
  | "intelligence"
  | "mischief"
  | "strength"
  | "energy";

export type StoryChoice = {
  text: string;
  attribute: StoryAttribute;
  next: string; // id of the next StoryNode
};

export type StoryNode = {
  id: string;
  story: string;
  choices: StoryChoice[];
  isEnding?: boolean;
  givesBook?: boolean; // true only on the node where the witch hands over the Storybook
};

export type StoryArea = {
  start: string; // id of the first node
  nodes: Record<string, StoryNode>;
};

export const ADVENTURES: Record<string, StoryArea> = {
  "Magical Forest": {
    start: "forest-start",
    nodes: {
      "forest-start": {
        id: "forest-start",
        story:
          "You and your pet step into the Magical Forest. The trees glow with a mysterious light as a hidden path appears before you.",
        choices: [
          {
            text: "Follow the glowing trail 🌟",
            attribute: "intelligence",
            next: "forest-trail", // correct path
          },
          {
            text: "Run deeper into the forest 🐾",
            attribute: "speed",
            next: "forest-end-run",
          },
          {
            text: "Investigate the strange sounds 👂",
            attribute: "mischief",
            next: "forest-end-investigate",
          },
        ],
      },

      "forest-trail": {
        id: "forest-trail",
        story:
          "The glowing trail winds between ancient trees, humming with quiet magic. Up ahead, it splits — one branch follows the sound of trickling water, the other drifts off toward a flickering light in the underbrush.",
        choices: [
          {
            text: "Follow the sound of running water 💧",
            attribute: "energy",
            next: "forest-clearing", // correct path
          },
          {
            text: "Chase the flickering light into the underbrush ✨",
            attribute: "speed",
            next: "forest-end-underbrush",
          },
        ],
      },

      "forest-clearing": {
        id: "forest-clearing",
        story:
          "The water leads you into a moonlit clearing. At its center stands a small, crooked cottage with a lantern glowing in the window.",
        choices: [
          {
            text: "Knock on the door 🚪",
            attribute: "strength",
            next: "forest-witch",
          },
        ],
      },

      "forest-witch": {
        id: "forest-witch",
        story:
          'The door creaks open to reveal a kindly old witch. She smiles down at your pet. "I\'ve been waiting for a companion brave enough to find me," she says, holding out a worn leather book.',
        choices: [
          {
            text: "Accept her gift 📖",
            attribute: "intelligence",
            next: "forest-book",
          },
          {
            text: "Ask what the book does ❓",
            attribute: "mischief",
            next: "forest-book",
          },
        ],
      },

      "forest-book": {
        id: "forest-book",
        story:
          '"This is the Storybook of Bonds," the witch explains. "Write about your pet\'s days in your own words, and it will help you understand them more deeply than ever before." The book glows warmly as it settles into your hands.',
        choices: [],
        isEnding: true,
        givesBook: true,
      },

      "forest-end-run": {
        id: "forest-end-run",
        story:
          "You and your pet race deep into the trees, but the glow fades and the trail disappears behind you. Tired but happy, you head home — maybe the forest holds a path you haven't tried yet.",
        choices: [],
        isEnding: true,
      },

      "forest-end-investigate": {
        id: "forest-end-investigate",
        story:
          "You creep toward the sounds, but they turn out to be nothing more than wind through the branches. The forest grows quiet, and it feels like time to head back — maybe another trail leads somewhere new.",
        choices: [],
        isEnding: true,
      },

      "forest-end-underbrush": {
        id: "forest-end-underbrush",
        story:
          "You chase the flickering light off the trail, but it vanishes into the dark underbrush. You and your pet turn back, a little muddy but no worse for it — perhaps the water's path leads somewhere better.",
        choices: [],
        isEnding: true,
      },
    },
  },

  "Frostpaw Tundra": {
    start: "frostpaw-1",
    nodes: {
      "frostpaw-1": {
        id: "frostpaw-1",
        story:
          "The wind howls as you and your pet step onto the frozen tundra. Snowdrifts stretch in every direction, and strange paw prints vanish into a blizzard.",
        choices: [
          {
            text: "Track the mysterious prints 🐾",
            attribute: "speed",
            next: "frostpaw-2",
          },
          {
            text: "Dig a shelter in the snow ❄️",
            attribute: "strength",
            next: "frostpaw-2",
          },
          {
            text: "Listen for signs of the creature 👂",
            attribute: "intelligence",
            next: "frostpaw-2",
          },
        ],
      },
      "frostpaw-2": {
        id: "frostpaw-2",
        story:
          "You find a frozen cave glowing with a soft blue light. Something inside seems to be waiting.",
        choices: [
          {
            text: "Push forward into the cave 🕳️",
            attribute: "strength",
            next: "frostpaw-end",
          },
          {
            text: "Sniff out any danger 🐽",
            attribute: "mischief",
            next: "frostpaw-end",
          },
          {
            text: "Warm up before going further 🔥",
            attribute: "energy",
            next: "frostpaw-end",
          },
        ],
      },
      "frostpaw-end": {
        id: "frostpaw-end",
        story:
          "Inside the cave, you find nothing but sparkling ice crystals and the warm satisfaction of a day well explored. Your pet is worn out but happy.",
        choices: [],
        isEnding: true,
      },
    },
  },

  "Crystal Caverns": {
    start: "crystal-1",
    nodes: {
      "crystal-1": {
        id: "crystal-1",
        story:
          "Deep underground, the Crystal Caverns sparkle with countless gems embedded in the walls. Every step echoes.",
        choices: [
          {
            text: "Climb toward the glittering ceiling 🧗",
            attribute: "strength",
            next: "crystal-2",
          },
          {
            text: "Study the crystal patterns 🔬",
            attribute: "intelligence",
            next: "crystal-2",
          },
          {
            text: "Chase the echoing sounds 🏃",
            attribute: "speed",
            next: "crystal-2",
          },
        ],
      },
      "crystal-2": {
        id: "crystal-2",
        story:
          "A narrow crystal bridge stretches over a deep chasm. It looks fragile.",
        choices: [
          {
            text: "Dash across quickly 💨",
            attribute: "speed",
            next: "crystal-end",
          },
          {
            text: "Test each crystal carefully 🧠",
            attribute: "intelligence",
            next: "crystal-end",
          },
          {
            text: "Sneak along the edge 🐾",
            attribute: "mischief",
            next: "crystal-end",
          },
        ],
      },
      "crystal-end": {
        id: "crystal-end",
        story:
          "You make it across the bridge and find a quiet grotto full of glowing crystals — a perfect place to rest before heading home.",
        choices: [],
        isEnding: true,
      },
    },
  },

  "Bone Desert": {
    start: "bone-1",
    nodes: {
      "bone-1": {
        id: "bone-1",
        story:
          "The sun blazes over the Bone Desert, its sands littered with ancient fossils. A trail of bones leads toward the horizon.",
        choices: [
          {
            text: "Dig up buried treasure ⛏️",
            attribute: "strength",
            next: "bone-2",
          },
          {
            text: "Follow the bone trail 🦴",
            attribute: "mischief",
            next: "bone-2",
          },
          {
            text: "Scout ahead for water 🏜️",
            attribute: "speed",
            next: "bone-2",
          },
        ],
      },
      "bone-2": {
        id: "bone-2",
        story:
          "A massive fossilized skeleton looms overhead, its ribs forming an eerie archway.",
        choices: [
          {
            text: "Investigate the skeleton 🔍",
            attribute: "intelligence",
            next: "bone-end",
          },
          {
            text: "Power through the heat 💪",
            attribute: "energy",
            next: "bone-end",
          },
          {
            text: "Rest in its shade 😌",
            attribute: "energy",
            next: "bone-end",
          },
        ],
      },
      "bone-end": {
        id: "bone-end",
        story:
          "Beneath the ribcage you find nothing but old bones and the wide open sky. Your pet trots home, tired and sandy but full of stories.",
        choices: [],
        isEnding: true,
      },
    },
  },
};