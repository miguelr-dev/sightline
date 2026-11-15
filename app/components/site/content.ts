// Copy and data for the marketing site. Spoken examples are real SightLine answers
// for the photos in /public/site, lightly shortened.

export const APP_PATH = "/app";

export const IMG = {
  menu: "/site/menu.webp",
  sign: "/site/sign.webp",
  medicine: "/site/medicine.webp",
  can: "/site/can.webp",
  bottle: "/site/bottle.webp",
  menuPortrait: "/site/menu-portrait.webp",
  signPortrait: "/site/sign-portrait.webp",
  medicinePortrait: "/site/medicine-portrait.webp",
};

// The menu lines are a literal translation of the chalkboard in the photo (public/site/menu.webp):
// "MENÚ DEL DÍA: 1º Gazpacho andaluz, o Ensalada mixta. 2º El guiso de hoy, o Asado ibérico en su
// jugo con patatas. POSTRE: Fruta natural, o helado, o café. Pan y copa de vino: 14'90€".
export const MENU_LINE =
  "Menu of the day: 1st: Andalusian gazpacho, or mixed salad. 2nd: Today's stew, or Iberian roast in its juices with potatoes. Dessert: Fresh fruit, or ice cream, or coffee. Bread and a glass of wine: €14.90.";
export const HERO_LINE = MENU_LINE;

export type ModeKey = "read" | "describe" | "menu" | "translate";

export const MODE_UI: { key: ModeKey; label: string; hint: string }[] = [
  { key: "read", label: "Read", hint: "Reads all visible text aloud." },
  { key: "describe", label: "Describe", hint: "Describes the scene in front of you." },
  { key: "menu", label: "Menu / Label", hint: "Summarizes a menu, product, or medicine label." },
  { key: "translate", label: "Translate", hint: "Reads the text and translates it." },
];

export const MODE_PANELS: { key: ModeKey; name: string; img: string; alt: string; quote: string; what: string; position?: string }[] = [
  {
    key: "read",
    name: "Read",
    img: IMG.bottle,
    alt: "A white prescription bottle of Nateglinide 60 milligram tablets on a marble counter.",
    quote: "Nateglinide tablets, 60 milligrams. 90 tablets. The directions are turned away: rotate the bottle a quarter turn to the left.",
    what: "Reads the text on whatever you're holding, and tells you how to turn it when part of the label is out of view.",
  },
  {
    key: "describe",
    name: "Describe",
    img: IMG.can,
    alt: "A hand holding a small black can of Fitch and Leedes Indian Tonic with a yellow label.",
    quote: "A small can of Fitch and Leedes Indian Tonic, held in your hand. The top looks sealed, so it appears unopened.",
    what: "Says what you're showing it. Point it at a room instead and it describes the scene, obstacles first.",
  },
  {
    key: "menu",
    name: "Menu / Label",
    img: IMG.medicine,
    alt: "A box of Sandoz methylprednisolone 4 milligram tablets with a dosing blister pack.",
    quote: "Methylprednisolone, 4 milligrams, 21 tablets. Day 1: 2 tablets before breakfast, 1 after lunch, 1 after supper, 2 at bedtime.",
    what: "Menus, packages, and medicine labels, summarized: prices, warnings, allergens, and expiry dates, always said out loud.",
  },
  {
    key: "translate",
    name: "Translate",
    img: IMG.sign,
    alt: "A street sign in Logroño, Spain, reading Prohibido uso de monopatín, with a crossed-out skateboarder.",
    quote: "This is a Spanish sign on a pole. It says: Skateboarding prohibited.",
    what: "Signs, menus, and labels in 13 languages, spoken back to you in a voice for your language.",
    position: "50% 52%",
  },
];

export const SAMPLES = [
  {
    title: "Menu in Seville",
    mode: "Translate",
    img: IMG.menu,
    alt: "A chalkboard Menú del día in Spanish beside café tables in Seville.",
    said: "This is a Spanish chalkboard menu of the day. First course: Andalusian gazpacho, a cold tomato and vegetable soup, or a mixed salad. Second course: today's stew, or Iberian pork roast in its own juices with potatoes. Dessert: fresh fruit, ice cream, or coffee. Bread and a glass of wine: 14 euros 90.",
  },
  {
    title: "Street sign",
    mode: "Translate",
    img: IMG.sign,
    alt: "A street sign in Logroño, Spain, reading Prohibido uso de monopatín, with a crossed-out skateboarder.",
    said: "This is a Spanish sign on a pole. It says: Skateboarding prohibited. It shows a person on a skateboard with a red diagonal line through it.",
  },
  {
    title: "Medicine",
    mode: "Menu / Label",
    img: IMG.medicine,
    alt: "A box of Sandoz methylprednisolone 4 milligram tablets with a six-day blister pack.",
    said: "This is a prescription pack of methylprednisolone tablets, 4 milligrams, by Sandoz, 21 tablets, prescription only. It is a six-day blister pack. Three tablets in the first day row appear to be already removed. Day 1: 2 tablets before breakfast, 1 after lunch, 1 after supper, 2 at bedtime.",
  },
  {
    title: "Tonic can",
    mode: "Describe",
    img: IMG.can,
    alt: "A hand holding a small black can of Fitch and Leedes Indian Tonic with a yellow oval label.",
    said: "This is a small can of Fitch and Leedes Indian Tonic, a sparkling tonic flavoured drink, held in your hand. The can is black with a yellow oval label showing a sailing ship. The top looks sealed, so it appears unopened.",
  },
];

export const CHAPTERS = [
  { s: 0, e: 15, title: "It spots the menu" },
  { s: 15, e: 28, title: "Just ask" },
  { s: 28, e: 44, title: "Read any sign" },
  { s: 44, e: 58, title: "Know what you’re holding" },
  { s: 58, e: 70, title: "Hear the world" },
];
export const FILM_LENGTH = 70;

export const MORE_FEATURES = [
  { title: "Auto mode", body: "Leave it on Auto and SightLine works out whether you're showing it a menu, a label, a sign, or a room, and answers the right way." },
  { title: "Detect", body: "Hold your phone steady on something. A card pops up, “Menú del día · Tap to read”, and nothing is read until you tap it." },
  { title: "Barcodes", body: "Point at a barcode and hear the product: nutrition, ingredients, allergens, and any FDA recalls, from Open Food Facts and openFDA." },
  { title: "Book mode", body: "SightLine reads a printed page sentence by sentence, highlights where it is, and tells you when to turn the page." },
  { title: "From the web", body: "Point at a product or a restaurant and SightLine checks the web for recalls and FDA warnings first, then nutrition, prices, and reviews, with sources." },
  { title: "Ask your history", body: "“How much was the salmon?” SightLine keeps the text of what you scanned, so you can ask about it later." },
  { title: "A natural voice", body: "Answers are read by lifelike ElevenLabs voices, with your phone's own voice as a backup." },
  { title: "Hands-free hat camera", body: "Clip a small camera to your cap and keep both hands free. Your phone speaks what the hat sees." },
];

export const A11Y_FEATURES = [
  { title: "Screen readers", body: "Every control is labelled for VoiceOver and TalkBack, and answers are announced as they arrive. Turn Auto-speak off in Settings so SightLine never talks over your reader." },
  { title: "High contrast", body: "White text on a dark band over the camera, black on white in answers, and every text color passes WCAG AA. The selected mode is underlined, not just colored." },
  { title: "Big targets", body: "Every control is at least 44 points. The shutter is the biggest button on the screen and never moves." },
  { title: "Feel it", body: "A tap of haptic feedback when it starts looking, and another when the answer is ready, so you know without looking." },
  { title: "Your speed", body: "Speech from 0.75x to 1.5x, replay any time, and a Stop button that stops right away." },
  { title: "Zoom in close", body: "Tap 1×, 2× or 5×, or pinch, to zoom the camera on small print. Tap your photo in an answer to magnify it up to 8×, in high contrast or inverted. Text follows your phone's text size, and every animation respects Reduce Motion." },
];

export const FAQS = [
  { q: "Is it free?", a: "Yes. SightLine is free during early access." },
  { q: "Do I need to download anything?", a: "No. Open the link in your phone's browser. You can add it to your home screen so it opens like an app." },
  { q: "Which phones work?", a: "Any recent iPhone or Android phone with a modern browser, such as Safari or Chrome. An iPhone app is in testing." },
  { q: "Which languages can it translate?", a: "English, Spanish, French, German, Italian, Portuguese, Chinese, Japanese, Korean, Arabic, Hindi, Vietnamese, and Tagalog." },
  { q: "Is my photo saved?", a: "No. Photos are never stored. SightLine keeps the text of recent answers for this device so you can ask about them later, and you can clear that history in Settings." },
  { q: "Does it work with VoiceOver and TalkBack?", a: "Yes. Every control is labelled, answers are announced by your screen reader, and text follows your phone's text size. Turn Auto-speak off so SightLine doesn't talk over it." },
  { q: "What is the hat camera?", a: "A small camera you clip to a cap. It sends what it sees to SightLine, and your phone reads it out loud, so both hands stay free." },
  { q: "Does it work offline?", a: "Not yet. SightLine needs a connection to describe a photo. Offline reading is on our roadmap." },
  { q: "How accurate is it?", a: "Very good on clear, well-lit photos. When it isn't sure, it says so and tells you how to retake the photo. For medicine, always double-check with a pharmacist." },
];

export const PHOTO_CREDITS = [
  { title: "What's on menu in Seville", by: "Clarence from Hong Kong", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/", src: "https://commons.wikimedia.org/wiki/File:What%27s_on_menu_in_Seville_(4103767878).jpg" },
  { title: "Logroño, no skateboarding sign", by: "Zarateman", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", src: "https://commons.wikimedia.org/wiki/File:Logro%C3%B1o_-_Prohibido_el_uso_de_monopat%C3%ADn_(no_skateboarding_sign).jpg" },
  { title: "Sandoz Methylprednisolone 4mg", by: "unknown author", license: "public domain", licenseUrl: "", src: "https://commons.wikimedia.org/wiki/File:Sandoz.Methylprednisolone.4mg.jpg" },
  { title: "Nateglinide 60 mg bottle", by: "Grendelkhan", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", src: "https://commons.wikimedia.org/wiki/File:Nateglinide_60_mg_bottle,_Zydus,_front_view.jpg" },
  { title: "Finch & Leedes Indian Tonic", by: "Wiki.cullin", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", src: "https://commons.wikimedia.org/wiki/File:Finch_%26_Leedes_-_Indian_Tonic_-_Sparking_Flavoured_Drink_-_Can.jpg" },
];
