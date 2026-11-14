import { Asset } from "expo-asset";
import { Platform } from "react-native";
import type { AnalyzeResponse, LookupResponse, Mode, Scan, Voice } from "./modes";
import type { Shot } from "./types";

// Web-only fixture for design screenshots (npx expo export --platform web, then open
// index.html?shot=home|result|web|settings|translate). Text is from real server responses for
// public/demo/menu.jpg, reshaped into the new short-answer + sections contract. Returns null on
// iOS, so none of this runs in the app.

const RESULT: AnalyzeResponse = {
  spokenText: "This is the Harbor Table lunch menu, served 11 to 3, with starters, mains and desserts.",
  details: "",
  sections: [
    { title: "Starters", body: "Tomato Basil Soup (vegetarian), $7.50\nCrispy Calamari, $12.00\nCaesar Salad, $10.00" },
    {
      title: "Mains",
      body: "Grilled Salmon, lemon butter, $24.00\nMushroom Risotto (vegetarian, gluten free), $18.00\nFish Tacos (spicy), $16.50\nClassic Cheeseburger, $15.00",
    },
    { title: "Desserts", body: "Chocolate Lava Cake, $9.00\nLemon Sorbet (vegan, gluten free), $6.50" },
    { title: "Dietary notes", body: "V vegetarian, VG vegan, GF gluten free. The menu says to ask about allergens." },
    {
      title: "Full text",
      body: "HARBOR TABLE\nLunch Menu, 11am to 3pm\n\nSTARTERS\nTomato Basil Soup (V), $7.50\nCrispy Calamari, $12.00\nCaesar Salad, $10.00\n\nMAINS\nGrilled Salmon, lemon butter, $24.00\nMushroom Risotto (V, GF), $18.00\nFish Tacos (spicy), $16.50\nClassic Cheeseburger, $15.00\n\nDESSERTS\nChocolate Lava Cake, $9.00\nLemon Sorbet (VG, GF), $6.50\n\nV vegetarian, VG vegan, GF gluten free. Ask about allergens.",
    },
  ],
  webQuery: "Harbor Table restaurant menu hours reviews allergens",
  itemKind: "restaurant",
};

const LOOKUP = (hero: string): LookupResponse => ({
  spokenText:
    "From the web: Harbor Table in Southwest Harbor, Maine, is rated 4.4 out of 5 on Tripadvisor. Its website says lunch runs 11 to 2 on weekdays.",
  details: "",
  query: "Harbor Table restaurant menu hours reviews allergens",
  itemKind: "restaurant",
  image: hero,
  sections: [
    { title: "Hours", body: "Lunch Monday to Friday, 11 to 2.\nDinner Monday to Friday, 5 to 9.\nClosed until December (harbortable.net)." },
    { title: "Ratings", body: "4.4 out of 5 from 8 reviews on Tripadvisor." },
  ],
  sources: [
    {
      title: "HARBOR TABLE, Southwest Harbor - Restaurant Reviews",
      url: "https://www.tripadvisor.com/Restaurant_Review-g40898-d27779625-Reviews-Harbor_Table.html",
      thumbnail: "https://www.google.com/s2/favicons?domain=tripadvisor.com&sz=128",
    },
    { title: "Harbor Table", url: "https://www.harbortable.net/" },
  ],
});

const VOICES: Voice[] = [
  { id: "a", name: "Sarah", description: "Warm, clear and calm. American." },
  { id: "b", name: "George", description: "Steady storyteller. British." },
  { id: "c", name: "Lily", description: "Bright and friendly. British." },
];

type Demo = {
  shot: Shot | null;
  sheet: "none" | "result" | "settings" | "language" | "recent";
  mode: Mode;
  photo: number;
  voices: Voice[] | null;
  hint: string | null;
  scans: Scan[] | null;
  detection: { key: string; label: string; mode: Mode | null; confidence: number | null } | null;
};

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export function demoState(): Demo | null {
  if (Platform.OS !== "web") return null;
  const q = new URLSearchParams(globalThis.location?.search ?? "").get("shot");
  if (!q) return null;
  const photo = require("../assets/demo/menu.jpg") as number;
  const uri = Asset.fromModule(photo).uri;
  const shot: Shot = {
    id: 0,
    photo: { uri, base64: "", width: 1200, height: 1600 },
    mode: "menu",
    language: "Spanish",
    result: RESULT,
    followUps: [],
    web: { status: "done", data: LOOKUP(uri) },
  };
  return {
    shot,
    sheet: q === "result" || q === "web" ? "result" : q === "settings" ? "settings" : q === "recent" ? "recent" : "none",
    mode: q === "translate" ? "translate" : "menu",
    photo,
    voices: VOICES,
    hint: null,
    detection: q === "home" ? { key: "harbor-table-menu", label: "Harbor Table menu", mode: "menu", confidence: 0.92 } : null,
    scans: [
      { id: "1", createdAt: ago(2), mode: "menu", itemKind: "restaurant", title: "Harbor Table lunch menu", spokenText: RESULT.spokenText, sections: RESULT.sections ?? [], lookup: LOOKUP(uri), image: uri },
      { id: "2", createdAt: ago(38), mode: "menu", itemKind: "medicine", title: "Ibuprofen 200 mg tablets", spokenText: "Ibuprofen 200 milligram tablets, 50 count.", sections: [], lookup: null },
      { id: "3", createdAt: ago(190), mode: "describe", itemKind: "none", title: "Living room with a sofa ahead", spokenText: "A living room.", sections: [], lookup: null },
      { id: "4", createdAt: ago(60 * 26), mode: "translate", itemKind: "none", title: "Sign: Salida de emergencia", spokenText: "Emergency exit.", sections: [], lookup: null },
      { id: "5", createdAt: ago(60 * 24 * 3), mode: "read", itemKind: "none", title: "Letter from the water company", spokenText: "A bill.", sections: [], lookup: null },
    ],
  };
}
