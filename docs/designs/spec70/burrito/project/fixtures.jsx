/* fixtures.jsx — generic engineer-day data
   loaded as global window.BurritoData */

const FIXTURES = {
  user: { name: "alex", initials: "AL" },
  dayLabel: "Tuesday, May 14",
  dayArtifactCount: 7,
  completedSessions: 3,

  collaborators: [
    { handle: "@sam",   name: "sam",   initials: "SM", color: "var(--accent2)", overlap: 23 },
    { handle: "@priya", name: "priya", initials: "PR", color: "var(--accent3)", overlap: 17 },
    { handle: "@jules", name: "jules", initials: "JL", color: "var(--lime)",    overlap: 9  },
  ],

  projects: [
    { id: "frontend-app",  label: "frontend/app",  source: "repo", artifacts: 142, days: 88, status: "ongoing",  blurb: "the customer-facing web client. you've been here most of the year." },
    { id: "platform-api",  label: "platform/api",  source: "repo", artifacts: 67,  days: 41, status: "ongoing",  blurb: "shared services. you dip in when the frontend needs a new endpoint." },
    { id: "infra-tooling", label: "infra/tooling", source: "repo", artifacts: 28,  days: 19, status: "sometimes",blurb: "build pipelines and ci. you visit when something breaks." },
    { id: "design-system", label: "design-system", source: "curated", artifacts: 34, days: 22, status: "ongoing", blurb: "you grouped these yourself — work across repos on the shared components."},
  ],

  // Day's panels — fixture for workbench
  panels: [
    {
      id: "p1",
      title: "frontend/app",
      subtitle: "morning work",
      artifactCount: 3,
      collaborators: ["@sam"],
      project: "frontend/app",
      draft: "you spent the morning in frontend/app — three MRs, all merged, mostly UI polish on the empty states. sam reviewed two of them.",
      artifacts: [
        { kind: "MR",  title: "empty state for /projects page", source: "gitlab", time: "09:14", status: "merged" },
        { kind: "MR",  title: "tighten spacing on collaborator cards", source: "gitlab", time: "10:38", status: "merged" },
        { kind: "MR",  title: "fix overflow on long project names", source: "gitlab", time: "11:52", status: "merged" },
      ],
      state: "pending",
    },
    {
      id: "p2",
      title: "platform/api",
      subtitle: "afternoon",
      artifactCount: 2,
      collaborators: ["@priya"],
      project: "platform/api",
      draft: "after lunch you switched to platform/api — opened an issue about pagination, then a small MR adding the cursor parameter. priya commented.",
      userText: "context switched after lunch to help priya unblock the pagination thing. opened an issue first, then a quick MR with the cursor param. felt fast because priya already knew what she wanted.",
      artifacts: [
        { kind: "ISSUE", title: "list endpoint needs cursor pagination", source: "linear", time: "14:02", status: "open" },
        { kind: "MR",    title: "add cursor param to list endpoint", source: "gitlab", time: "15:47", status: "in-review" },
      ],
      state: "locked",
    },
    {
      id: "p3",
      title: "loose ends",
      subtitle: "scattered",
      artifactCount: 2,
      collaborators: [],
      project: null,
      draft: "two scattered things — a doc you wrote down about the incident retro, and a manual entry for the design review you led at 4.",
      userText: "wrote up the retro doc properly while it was still fresh. the 4pm design review went long — we ended up scoping a whole new flow for empty states which is why this morning's MRs exist.",
      artifacts: [
        { kind: "DOC",    title: "incident retro — wednesday outage", source: "notion", time: "13:30", status: "draft" },
        { kind: "MANUAL", title: "design review for empty states", source: "manual", time: "16:00", status: "noted" },
      ],
      state: "locked",
    },
  ],

  // record entries (locked framings from prior days)
  record: [
    { day: "Mon, May 13", title: "frontend/app", count: 4, text: "spent most of the day pairing with sam on the new collaborators sidebar. felt like things clicked around 3pm." },
    { day: "Mon, May 13", title: "platform/api", count: 1, text: "small follow-up on yesterday's pagination work — priya merged it without changes." },
    { day: "Fri, May 10", title: "frontend/app", count: 6, text: "shipped the redesigned empty state. four MRs landed, two of them were trivial typo fixes from review feedback." },
  ],
};

window.BurritoData = FIXTURES;
