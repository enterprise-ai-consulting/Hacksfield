/** Every word on the Audio page, in one place. */
import { generationProvider, personalInstallation } from "@/config/installation";

const byteplus = generationProvider === "byteplus";

export type AudioSurface = "speech" | "music";

export const audioTabs: { surface: AudioSurface; label: string }[] = [
  { surface: "speech", label: "Text to Speech" },
  { surface: "music", label: "Music" },
];

export const audioCopy = {
  speech: {
    scriptLabel: "Script",
    scriptHint: "Write exactly what the voice should say. Punctuation sets the pauses.",
    scriptInfo: "Every character is read aloud. The price follows the length of the script.",
    hero: {
      title: "Give any script a voice",
      lead: "Natural speech from your own words, ready to drop into a project",
      cards: [
        { title: "Choose a voice", body: "Pick a model, then a voice, a mood and a pace", art: "audio/speech-voices" },
        { title: "Write and generate", body: "Paste your script, set the details and press Generate", art: "audio/speech-settings" },
      ],
    },
  },
  music: {
    scriptLabel: "Describe the track",
    scriptHint: byteplus ? "Describe the genre, mood, instruments and tempo for a 4–15 second clip." : "Genre, mood, instruments, tempo. Add lyrics in the settings below.",
    scriptInfo: byteplus ? "Seedance creates a video with music, then Hacksfield extracts an MP3. Billed at video rates; the price shown reserves your budget. Turn Instrumental off and describe vocals in the prompt if wanted." : "Say what it should sound like. Turn Instrumental off to add a voice and words.",
    hero: {
      title: "Score your next idea",
      lead: byteplus ? "Create a short BytePlus soundtrack, ready as a downloadable MP3" : "Describe a sound and get a finished track in under a minute",
      cards: [
        { title: "Describe the sound", body: "Name a genre, a mood and the instruments you hear", art: "audio/music-describe" },
        { title: byteplus ? "Choose 4–15 seconds" : "Add words or keep it pure", body: byteplus ? "Try a short melody, a sting or an instrumental idea. Generation can take several minutes." : "Write your own lyrics, or leave the track instrumental", art: "audio/music-lyrics" },
      ],
    },
  },
  model: "Model",
  batch: "Batch size",
  optional: "Optional",
  advanced: "Advanced settings",
  generate: "Generate",
  history: "History",
  howItWorks: "How it works",
  filters: "Filters",
  filterAll: "Everything",
  filterFavorites: "Favourites",
  filterSpeech: "Speech only",
  filterMusic: "Music only",
  noFavorites: "Nothing marked as a favourite yet.",
  noMatches: "Nothing here for this filter.",
  showAll: "Show everything",
  listLabel: "Your audio",
  queued: "In line",
  running: "Making it",
  failedNote: personalInstallation ? "Check the error before trying again. Provider work may still be billable." : "Your credits are back in your balance.",
  failedFallback: "This one did not work.",
  tryAgain: "Try it again",
  useAgain: "Use these settings",
  download: "Download",
  favorite: "Add to favourites",
  unfavorite: "Remove from favourites",
  remove: "Remove",
  cancel: "Cancel",
  removeTitle: "Remove this track?",
  removeBody: personalInstallation ? "The file is deleted for good and cannot come back. Provider charges are not reversed." : "The file is deleted for good and cannot come back. Credits spent on it are not returned.",
  removeConfirm: "Remove for good",
  keep: "Keep it",
  play: "Play",
  pause: "Pause",
  seek: "Position",
  noResult: personalInstallation ? "The model sent no playable audio. Check provider usage before trying again." : "The model sent nothing back. Your credits for it were returned.",
  guestNote: personalInstallation ? "Your audio is saved on this Mac in your local session." : "You are trying Hacksfield as a guest. Create an account to keep what you make.",
  visitorNote: "Write a script and press Generate to hear it. Sign in to see your history.",
  createAccount: "Create account",
  signIn: "Sign in",
  dismiss: "Dismiss",
  needAccount: "Create an account to keep going.",
} as const;
