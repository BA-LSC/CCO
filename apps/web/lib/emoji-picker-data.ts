export const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂"] as const;

export type EmojiPickerGroup = {
  label: string;
  keywords: readonly string[];
  emojis: readonly string[];
};

export const EMOJI_PICKER_GROUPS: readonly EmojiPickerGroup[] = [
  {
    label: "Smileys",
    keywords: [
      "smile", "face", "happy", "sad", "laugh", "lol", "cry", "tear", "angry", "mad",
      "sick", "sleep", "think", "wink", "cool", "party", "scared", "shock", "pleading",
      "robot", "ghost", "skull", "alien", "pumpkin", "halloween", "nerd", "yawn",
    ],
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "😊",
      "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘", "😋", "😜", "🤪",
      "🤔", "🤨", "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬",
      "😮", "😲", "😳", "🥺", "😢", "😭", "😤", "😡", "🤬", "😱",
      "😨", "😰", "😥", "😓", "🤗", "🤭", "🫢", "🫣", "🤫", "🤐",
      "😴", "🥱", "😎", "🤓", "🧐", "🥳", "🤯", "🤮", "🤢", "🤡",
      "👻", "💀", "☠️", "👽", "🤖", "🎃",
    ],
  },
  {
    label: "Gestures",
    keywords: [
      "hand", "thumb", "up", "down", "yes", "no", "clap", "wave", "pray", "thanks",
      "muscle", "strong", "peace", "point", "ok", "fist", "bump", "salute", "shrug",
      "facepalm", "nail", "hug", "selfie", "write",
    ],
    emojis: [
      "👍", "👎", "👏", "🙌", "🙏", "🤝", "💪", "✌️", "🤞", "🤟",
      "🤘", "👋", "🖐️", "✋", "🫶", "👊", "✊", "🫡", "👌", "🤌",
      "🤏", "☝️", "👆", "👇", "👈", "👉", "🫵", "🤙", "🫰", "🙋",
      "🙅", "🙆", "🙇", "🤷", "🤦", "💁", "🫂", "🤳", "✍️", "💅",
    ],
  },
  {
    label: "Hearts",
    keywords: ["heart", "love", "valentine", "broken", "kiss", "couple", "letter"],
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❤️‍🔥", "❤️‍🩹", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟",
      "♥️", "💌", "💑", "💏", "🫶",
    ],
  },
  {
    label: "Objects",
    keywords: [
      "fire", "hot", "star", "spark", "hundred", "check", "cross", "alert", "question",
      "idea", "bell", "party", "celebrate", "gift", "trophy", "win", "target", "pin",
      "link", "talk", "chat", "eye", "watch", "note", "write", "lock", "key", "music",
      "sing", "photo", "camera", "game", "play", "tool", "phone", "computer",
    ],
    emojis: [
      "🔥", "✨", "⭐", "🌟", "💫", "💥", "⚡", "💯", "✅", "❌",
      "❗", "❓", "💡", "🔔", "📢", "📣", "🎉", "🎊", "🎁", "🏆",
      "🎯", "📌", "📎", "🔗", "💬", "💭", "🗯️", "👀", "👁️", "📝",
      "📋", "📁", "🔒", "🔓", "🔑", "🎵", "🎶", "🎤", "🎧", "📸",
      "🎮", "🕹️", "🎲", "🧩", "🛠️", "⚙️", "🔧", "💻", "📱", "⌚",
    ],
  },
  {
    label: "Nature",
    keywords: [
      "sun", "moon", "rain", "storm", "snow", "cloud", "rainbow", "flower", "rose",
      "plant", "leaf", "earth", "world", "ocean", "water", "mountain", "tree", "cactus",
    ],
    emojis: [
      "☀️", "🌤️", "⛅", "🌥️", "☁️", "🌧️", "⛈️", "🌩️", "❄️", "🌨️",
      "🌈", "🌙", "🌛", "🌜", "⭐", "🌸", "🌺", "🌻", "🌹", "🥀",
      "🌷", "🌼", "🍀", "🌿", "🍁", "🍂", "🌍", "🌎", "🌏", "🌊",
      "🏔️", "⛰️", "🌵", "🌴", "🪴",
    ],
  },
  {
    label: "Food",
    keywords: [
      "apple", "fruit", "orange", "lemon", "banana", "watermelon", "grape", "berry",
      "strawberry", "peach", "avocado", "corn", "carrot", "pizza", "burger", "taco",
      "burrito", "sushi", "noodle", "pasta", "salad", "donut", "cake", "cupcake",
      "chocolate", "popcorn", "drink", "coffee", "tea", "soda", "beer", "cheers", "wine", "ice",
    ],
    emojis: [
      "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍒", "🥝",
      "🍑", "🥑", "🌽", "🥕", "🍕", "🍔", "🌮", "🌯", "🍣", "🍜",
      "🍝", "🥗", "🍩", "🧁", "🍰", "🍫", "🍿", "🧃", "☕", "🍵",
      "🥤", "🍺", "🍻", "🥂", "🍷", "🧊",
    ],
  },
  {
    label: "Animals",
    keywords: [
      "dog", "cat", "mouse", "hamster", "rabbit", "bunny", "fox", "bear", "panda",
      "koala", "tiger", "lion", "cow", "pig", "frog", "monkey", "chicken", "penguin",
      "bird", "duck", "eagle", "unicorn", "bee", "butterfly", "snail", "turtle", "snake",
      "lizard", "octopus", "squid", "shrimp", "fish", "dolphin", "whale", "shark",
      "crocodile", "elephant", "pet", "animal",
    ],
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
      "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦆", "🦅",
      "🦄", "🐝", "🦋", "🐌", "🐢", "🐍", "🦎", "🐙", "🦑", "🦐",
      "🐠", "🐬", "🐳", "🦈", "🐊", "🐘",
    ],
  },
  {
    label: "Activities",
    keywords: [
      "soccer", "football", "basketball", "baseball", "tennis", "volleyball", "rugby",
      "pool", "ping pong", "badminton", "boxing", "martial", "golf", "bowling", "ski",
      "surf", "bike", "gym", "workout", "yoga", "theater", "art", "paint", "movie",
      "film", "book", "read", "grad", "school", "guitar", "piano", "trumpet", "drum", "sport",
    ],
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸",
      "🥊", "🥋", "⛳", "🎳", "🎿", "⛷️", "🏄", "🚴", "🏋️", "🧘",
      "🎭", "🎨", "🎬", "📚", "🎓", "🎤", "🎸", "🎹", "🎺", "🥁",
    ],
  },
  {
    label: "Travel",
    keywords: [
      "car", "taxi", "bus", "police", "ambulance", "fire truck", "bike", "scooter",
      "motorcycle", "plane", "fly", "rocket", "ufo", "helicopter", "boat", "sail",
      "train", "home", "house", "office", "hospital", "school", "castle", "liberty",
      "tower", "bridge", "camp", "beach", "ferris", "travel",
    ],
    emojis: [
      "🚗", "🚕", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚲", "🛵",
      "🏍️", "✈️", "🚀", "🛸", "🚁", "⛵", "🚂", "🚆", "🏠", "🏢",
      "🏥", "🏫", "🏰", "🗽", "🗼", "🌉", "⛺", "🏕️", "🏖️", "🎡",
    ],
  },
  {
    label: "Symbols",
    keywords: [
      "recycle", "warning", "ban", "stop", "adult", "ok", "new", "cool", "up", "red",
      "orange", "yellow", "green", "blue", "purple", "black", "white", "brown", "play",
      "pause", "record", "skip", "shuffle", "repeat", "plus", "minus", "multiply", "color",
    ],
    emojis: [
      "♻️", "⚠️", "🚫", "⛔", "🔞", "🆗", "🆕", "🆒", "🆙", "🔴",
      "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "▶️", "⏸️",
      "⏹️", "⏺️", "⏭️", "⏮️", "🔀", "🔁", "🔂", "➕", "➖", "✖️",
    ],
  },
];

function groupMatchesQuery(group: EmojiPickerGroup, query: string): boolean {
  if (group.label.toLowerCase().includes(query)) return true;
  return group.keywords.some((keyword) => keyword.includes(query));
}

export function filterEmojiPickerGroups(query: string): EmojiPickerGroup[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return EMOJI_PICKER_GROUPS.map((group) => ({
      label: group.label,
      keywords: group.keywords,
      emojis: [...group.emojis],
    }));
  }

  return EMOJI_PICKER_GROUPS.flatMap((group) => {
    const matchesGroup = groupMatchesQuery(group, normalized);
    const emojis = matchesGroup
      ? [...group.emojis]
      : group.emojis.filter((emoji) => emoji.includes(normalized));

    if (emojis.length === 0) return [];

    return [{
      label: group.label,
      keywords: group.keywords,
      emojis,
    }];
  });
}
