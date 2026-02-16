export type AppExample = {
  title: string;
  body: string;
  surface: string;
};

export type AppDefinition = {
  slug: string;
  name: string;
  description: string;
  longDescription: string;
  connected: boolean;
  logo: string;
  logoBg: string;
  examples: AppExample[];
};

const defaultExamples: AppExample[] = [
  {
    title: "Summarize a thread",
    body: "Pull the key decisions and next steps from the last 10 messages.",
    surface: "from-sky-100 via-white to-indigo-50",
  },
  {
    title: "Draft a response",
    body: "Generate a reply that sounds friendly and confirms the timeline.",
    surface: "from-amber-100 via-white to-rose-50",
  },
  {
    title: "Find action items",
    body: "List tasks, owners, and due dates mentioned in the conversation.",
    surface: "from-emerald-100 via-white to-lime-50",
  },
];

export const APPS: AppDefinition[] = [
  {
    slug: "gmail",
    name: "Gmail",
    description: "Triage and draft emails faster with AI assistance.",
    longDescription:
      "Connect Gmail to summarize threads, draft replies, and surface follow-ups that need attention. Automate inbox triage and keep the team aligned on customer communications.",
    connected: false,
    logo: "/apps/gmail.png",
    logoBg: "#FFFFFF",
    examples: [
      {
        title: "Summarize a thread",
        body: "Summarize this customer thread and highlight outstanding questions.",
        surface: "from-rose-100 via-white to-amber-50",
      },
      {
        title: "Draft a reply",
        body: "Write a warm follow-up confirming delivery by Friday.",
        surface: "from-amber-100 via-white to-orange-50",
      },
      {
        title: "Prioritize inbox",
        body: "List the top 5 urgent emails from today and explain why.",
        surface: "from-emerald-100 via-white to-lime-50",
      },
    ],
  },
  {
    slug: "whatsapp",
    name: "WhatsApp",
    description: "Respond to customers and coordinate teams in real time.",
    longDescription:
      "Bring WhatsApp conversations into Omicron to draft replies, summarize chats, and keep sales or support teams in sync. Ideal for high-touch customer channels.",
    connected: false,
    logo: "/apps/whatsapp.svg",
    logoBg: "#FFFFFF",
    examples: [
      {
        title: "Summarize a chat",
        body: "Summarize this chat and capture any follow-ups.",
        surface: "from-emerald-100 via-white to-green-50",
      },
      {
        title: "Draft a response",
        body: "Create a polite reply acknowledging the issue and next steps.",
        surface: "from-teal-100 via-white to-sky-50",
      },
      {
        title: "Capture intent",
        body: "List buying signals and decision criteria mentioned in this thread.",
        surface: "from-lime-100 via-white to-emerald-50",
      },
    ],
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Turn noisy channels into crisp updates and action items.",
    longDescription:
      "Sync Slack to collect status updates, summarize channel activity, and post responses or recaps automatically. Keep your team aligned without manual copy/paste.",
    connected: false,
    logo: "/apps/slack.png",
    logoBg: "#FFFFFF",
    examples: defaultExamples,
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Update docs, runbooks, and specs with fresh context.",
    longDescription:
      "Use Notion with Omicron to draft meeting summaries, update product specs, or keep knowledge bases up to date. Turn conversations into structured documentation.",
    connected: false,
    logo: "/apps/notion.svg",
    logoBg: "#FFFFFF",
    examples: defaultExamples,
  },
  {
    slug: "google-drive",
    name: "Google Drive",
    description: "Search files, summarize docs, and generate deliverables.",
    longDescription:
      "Connect Google Drive to locate key docs fast, summarize long files, and draft new content based on existing assets across your workspace.",
    connected: false,
    logo: "/apps/google-drive.png",
    logoBg: "#FFFFFF",
    examples: defaultExamples,
  },
  {
    slug: "google-calendar",
    name: "Google Calendar",
    description: "Plan meetings, summarize agendas, and manage follow-ups.",
    longDescription:
      "Sync your calendar to auto-generate agendas, highlight conflicts, and send recap notes with action items after meetings.",
    connected: false,
    logo: "/apps/google-calendar.png",
    logoBg: "#FFFFFF",
    examples: defaultExamples,
  },
  {
    slug: "zoom",
    name: "Zoom",
    description: "Capture transcripts, summaries, and action items.",
    longDescription:
      "Use Zoom with Omicron to summarize calls, extract decisions, and distribute action items to your team after every meeting.",
    connected: false,
    logo: "/apps/zoom.svg",
    logoBg: "#FFFFFF",
    examples: defaultExamples,
  },
  {
    slug: "dropbox",
    name: "Dropbox",
    description: "Organize assets, draft briefs, and locate key files.",
    longDescription:
      "Connect Dropbox to scan file folders, generate creative briefs, and keep the latest assets on hand when teams need them most.",
    connected: false,
    logo: "/apps/dropbox.svg",
    logoBg: "#FFFFFF",
    examples: defaultExamples,
  },
];

export const YOUR_APPS = APPS.filter((app) => app.connected);

export const getAppBySlug = (slug: string) =>
  APPS.find((app) => app.slug === slug);
