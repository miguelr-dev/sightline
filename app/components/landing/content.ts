// Everything the landing page shows that you might want to change lives here.
//
// Swapping in real photos: replace the files in public/landing/ (same names), or point
// `image` / `imageTall` at new files. `image` is the wide crop (16:10, used from 735 px up),
// `imageTall` the phone crop (4:5). Leave `imageTall` out and the wide image is cropped to fit.
// Images fill their frame with object-fit: cover, so any size works.
//
// The demo video: drop public/landing/demo.mp4 (and optionally public/landing/demo-poster.jpg)
// in place, or paste a YouTube link into DEMO_VIDEO.youtubeUrl. See VideoDemo.tsx.

export type Slide = {
  id: string;
  image: string;
  imageTall?: string;
  alt: string;
  /** What's in the photo, shown above the caption. */
  label: string;
  /** The mode that produced the answer. */
  mode: string;
  /** What SightLine said (a real response). */
  said: string;
};

export const SLIDES: Slide[] = [
  {
    id: "cereal",
    image: "/landing/hero-cereal-wide.webp",
    imageTall: "/landing/hero-cereal-tall.webp",
    alt: "A box of Oat Crunch Honey Almond cereal on a kitchen counter, next to an iPhone showing SightLine's answer under a photo of the box.",
    label: "Cereal box",
    mode: "Menu / Label",
    said: "Oat Crunch Honey Almond whole grain cereal, 14 ounce box, 160 calories and 12 grams of sugar per three-quarter cup.",
  },
  {
    id: "medicine",
    image: "/landing/hero-medicine-wide.webp",
    imageTall: "/landing/hero-medicine-tall.webp",
    alt: "A box of acetaminophen 500 mg caplets beside an iPhone. SightLine's From the web card reports recent recalls of acetaminophen 500 mg caplets, with fda.gov as the first source.",
    label: "Medicine box",
    mode: "From the web",
    said: "There are recent recalls of acetaminophen 500 milligram Extra Strength caplets. Check your lot number or ask a pharmacist whether yours is affected.",
  },
  {
    id: "menu",
    image: "/landing/hero-menu-wide.webp",
    imageTall: "/landing/hero-menu-tall.webp",
    alt: "The Harbor Table lunch menu on a wooden table, beside an iPhone where SightLine summarizes the menu.",
    label: "Restaurant menu",
    mode: "Menu / Label",
    said: "Harbor Table lunch menu, served 11am to 3pm. Starters, mains and desserts range from 6.50 to 24 dollars.",
  },
  {
    id: "sign",
    image: "/landing/hero-sign-wide.webp",
    imageTall: "/landing/hero-sign-tall.webp",
    alt: "A red Spanish street sign reading Precaución, Obras en la acera, beside an iPhone where SightLine translates it into English.",
    label: "Street sign in Spanish",
    mode: "Translate",
    said: "The red sign says: Caution. Sidewalk work ahead. Cross to the other side.",
  },
  {
    id: "can",
    image: "/landing/hero-can-wide.webp",
    imageTall: "/landing/hero-can-tall.webp",
    alt: "A can of Volt energy drink beside an iPhone where SightLine is speaking the drink's caffeine and sugar content.",
    label: "Energy drink",
    mode: "Menu / Label",
    said: "VOLT Energy Drink, Citrus Lime, zero sugar, 16 fluid ounces with 200 milligrams of caffeine per can.",
  },
];

/** Seconds each hero slide stays up while the slideshow plays. */
export const SLIDE_SECONDS = 6;

export const DEMO_VIDEO = {
  /** Paste a YouTube link here (watch, share or embed form) and it is used first. */
  youtubeUrl: "",
  /** Used if the file exists in public/. */
  file: "/landing/demo.mp4",
  /** Poster for the file above, if present, and its alt text. */
  poster: "/landing/demo-poster.jpg",
  posterAlt: "Opening frame of the SightLine demo video.",
  /** Short silent walkthrough used until the real demo is in place, if present. */
  placeholderFile: "/landing/walkthrough.mp4",
  /** The poster shown when nothing else is set. */
  fallbackPoster: "/landing/video-poster.webp",
  fallbackPosterAlt:
    "The Harbor Table menu on a wooden table beside an iPhone showing SightLine's menu summary and a From the web card.",
  title: "SightLine demo",
};

export const GITHUB_URL = "https://github.com/miguelr-dev/sightline";

export const MODES = [
  {
    name: "Read",
    hint: "Reads all visible text aloud, in natural reading order.",
    image: "/landing/phone-mode-read.webp",
    alt: "SightLine in Read mode, pointed at a street sign. The last answer reads: Precaución. Obras en la acera.",
  },
  {
    name: "Describe",
    hint: "Two or three sentences about the scene, most important first.",
    image: "/landing/phone-mode-describe.webp",
    alt: "SightLine in Describe mode, pointed at a living room with a door marked Exit, a sofa and a coffee table.",
  },
  {
    name: "Menu / Label",
    hint: "Names, prices, doses, warnings and allergens from a menu, product or medicine.",
    image: "/landing/phone-mode-menu.webp",
    alt: "SightLine in Menu / Label mode, pointed at the Harbor Table lunch menu.",
  },
  {
    name: "Translate",
    hint: "Reads the text and speaks it in any of 13 languages.",
    image: "/landing/phone-mode-translate.webp",
    alt: "SightLine in Translate mode set to English, pointed at a Spanish street sign.",
  },
];

/** Translate languages, each written in its own language. */
export const LANGUAGES: { name: string; native: string; lang: string; dir?: "rtl" }[] = [
  { name: "English", native: "English", lang: "en" },
  { name: "Spanish", native: "Español", lang: "es" },
  { name: "French", native: "Français", lang: "fr" },
  { name: "German", native: "Deutsch", lang: "de" },
  { name: "Italian", native: "Italiano", lang: "it" },
  { name: "Portuguese", native: "Português", lang: "pt" },
  { name: "Chinese", native: "中文", lang: "zh" },
  { name: "Japanese", native: "日本語", lang: "ja" },
  { name: "Korean", native: "한국어", lang: "ko" },
  { name: "Arabic", native: "العربية", lang: "ar", dir: "rtl" },
  { name: "Hindi", native: "हिन्दी", lang: "hi" },
  { name: "Vietnamese", native: "Tiếng Việt", lang: "vi" },
  { name: "Tagalog", native: "Tagalog", lang: "tl" },
];

export const VOICE_COMMANDS = [
  "Read this",
  "Describe",
  "What's on the menu",
  "Translate to Spanish",
  "Look it up",
  "Repeat",
  "Stop",
  "Help",
];

export const WEB_SOURCES = [
  // Real sources from the lookups shown in the screenshots.
  { title: "A-S Medication Solutions Issues Voluntary Nationwide Recall", domain: "fda.gov", kind: "Recall" },
  { title: "FDA Announces Nationwide Recall of More Than 100,000 Bottles", domain: "health.com", kind: "News" },
  { title: "Harbor Table", domain: "harbortable.net", kind: "Hours" },
  { title: "Harbor Table, Southwest Harbor: Restaurant Reviews", domain: "tripadvisor.com", kind: "Reviews" },
];
