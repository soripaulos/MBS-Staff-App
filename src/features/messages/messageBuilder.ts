/**
 * The premade message builder.
 *
 * Writing a message home from a phone, between lessons, is the reason most of
 * these never get sent. So the teacher taps what they mean and the app writes
 * the sentences; the draft lands in an ordinary textarea they can rewrite
 * before it goes anywhere.
 *
 * Sentences deliberately use the student's name rather than a pronoun. The
 * school records a gender field, but it is not reliably filled and a message
 * to a parent is the worst place to guess.
 *
 * Adding a topic is a matter of appending to `SECTIONS` — nothing else in the
 * app needs to know about it.
 */

export interface BuilderOption {
  key: string;
  /** Short label on the chip. */
  label: string;
  /** Sentence template; `{name}` is replaced with the student's first name. */
  sentence: string;
  tone: "good" | "neutral" | "concern";
}

export interface BuilderSection {
  key: string;
  label: string;
  hint?: string;
  options: BuilderOption[];
}

export const SECTIONS: BuilderSection[] = [
  {
    key: "overall",
    label: "How they are doing",
    hint: "The headline — everything else fills it in",
    options: [
      { key: "great", label: "Really well", sentence: "{name} is doing really well at the moment.", tone: "good" },
      { key: "good", label: "Well", sentence: "{name} is doing well.", tone: "good" },
      { key: "steady", label: "Steady", sentence: "{name} is steady and consistent in class.", tone: "neutral" },
      { key: "flag", label: "A few concerns", sentence: "There are a couple of things about {name} I would like to flag.", tone: "concern" },
      { key: "worried", label: "Worried", sentence: "I am a little concerned about how {name} is getting on.", tone: "concern" },
    ],
  },
  {
    key: "mood",
    label: "Mood in class",
    options: [
      { key: "settled", label: "Happy & settled", sentence: "{name} seems happy and settled.", tone: "good" },
      { key: "quiet", label: "Quiet", sentence: "{name} has been quieter than usual lately.", tone: "neutral" },
      { key: "tired", label: "Tired", sentence: "{name} has seemed tired in class this week.", tone: "neutral" },
      { key: "withdrawn", label: "Upset or withdrawn", sentence: "{name} has seemed upset or withdrawn in class.", tone: "concern" },
      { key: "lively", label: "Very lively", sentence: "{name} has been very lively in class.", tone: "neutral" },
    ],
  },
  {
    key: "performance",
    label: "Performance",
    options: [
      { key: "above", label: "Above expectations", sentence: "The work {name} is producing is above what I expect at this stage.", tone: "good" },
      { key: "meeting", label: "Meeting expectations", sentence: "{name} is meeting the expectations for this stage.", tone: "good" },
      { key: "improving", label: "Improving", sentence: "{name}'s work has improved noticeably.", tone: "good" },
      { key: "slipping", label: "Slipping", sentence: "{name}'s work has slipped a little recently.", tone: "concern" },
      { key: "struggling", label: "Struggling", sentence: "{name} is finding the work hard at the moment.", tone: "concern" },
    ],
  },
  {
    key: "attention",
    label: "Attention in class",
    options: [
      { key: "focused", label: "Focused", sentence: "{name} stays focused for the whole lesson.", tone: "good" },
      { key: "reminders", label: "Focused with reminders", sentence: "{name} focuses well with the occasional reminder.", tone: "neutral" },
      { key: "distracted", label: "Easily distracted", sentence: "{name} is easily distracted and needs frequent redirection.", tone: "concern" },
      { key: "disruptive", label: "Disruptive", sentence: "{name} is disrupting the lesson for others.", tone: "concern" },
    ],
  },
  {
    key: "work",
    label: "Classwork & homework",
    options: [
      { key: "complete", label: "All complete", sentence: "Classwork and homework come in complete and on time.", tone: "good" },
      { key: "mostly", label: "Mostly complete", sentence: "Most classwork and homework comes in, with the odd gap.", tone: "neutral" },
      { key: "incomplete", label: "Often incomplete", sentence: "Classwork or homework is often left incomplete.", tone: "concern" },
      { key: "missing", label: "Not handed in", sentence: "Homework has not been handed in for a while now.", tone: "concern" },
    ],
  },
  {
    key: "talking",
    label: "Talking & participation",
    options: [
      { key: "contributes", label: "Contributes well", sentence: "{name} contributes to class discussion thoughtfully.", tone: "good" },
      { key: "reserved", label: "Rarely speaks up", sentence: "{name} rarely speaks up in class — I am encouraging more of it.", tone: "neutral" },
      { key: "chatty", label: "Chats off-task", sentence: "{name} chats with friends when the class should be working.", tone: "concern" },
      { key: "interrupts", label: "Talks over others", sentence: "{name} talks over others and interrupts the lesson.", tone: "concern" },
    ],
  },
  {
    key: "peers",
    label: "With classmates",
    options: [
      { key: "sociable", label: "Gets on well", sentence: "{name} gets on well with classmates.", tone: "good" },
      { key: "kind", label: "Kind & helpful", sentence: "{name} is kind and helpful towards classmates.", tone: "good" },
      { key: "solo", label: "Keeps to themselves", sentence: "{name} tends to work alone rather than with the group.", tone: "neutral" },
      { key: "friction", label: "Some friction", sentence: "{name} has had some friction with classmates recently.", tone: "concern" },
    ],
  },
  {
    key: "routine",
    label: "Punctuality & materials",
    options: [
      { key: "ready", label: "On time & prepared", sentence: "{name} arrives on time with everything needed.", tone: "good" },
      { key: "late", label: "Arriving late", sentence: "{name} has arrived late to class several times.", tone: "concern" },
      { key: "unprepared", label: "Missing materials", sentence: "{name} often arrives without the right books or equipment.", tone: "concern" },
    ],
  },
  {
    key: "next",
    label: "What happens next",
    hint: "What, if anything, you are asking of them",
    options: [
      { key: "fyi", label: "Nothing needed", sentence: "Nothing is needed from you — I just wanted you to know.", tone: "good" },
      { key: "praise", label: "Please pass on praise", sentence: "Please do pass on how pleased I am.", tone: "good" },
      { key: "encourage", label: "Encourage at home", sentence: "A word of encouragement at home would help a lot.", tone: "neutral" },
      { key: "word", label: "Have a word", sentence: "It would help if you could have a word at home.", tone: "concern" },
      { key: "meet", label: "Ask for a meeting", sentence: "I would like to arrange a short meeting — please let me know a time that suits.", tone: "concern" },
      { key: "monitor", label: "Will keep watching", sentence: "I will keep an eye on this and let you know how it goes.", tone: "neutral" },
    ],
  },
];

/** Worst tone picked, which decides the subject line's wording. */
export function overallTone(picks: Record<string, string>): "good" | "neutral" | "concern" {
  let worst: "good" | "neutral" | "concern" = "good";
  for (const s of SECTIONS) {
    const o = s.options.find((x) => x.key === picks[s.key]);
    if (!o) continue;
    if (o.tone === "concern") return "concern";
    if (o.tone === "neutral") worst = "neutral";
  }
  return worst;
}

export function draftSubject(fullName: string, picks: Record<string, string>): string {
  const first = (fullName || "your child").split(/\s+/)[0];
  const tone = overallTone(picks);
  if (tone === "concern") return `A word about ${first}`;
  if (tone === "good") return `Good news about ${first}`;
  return `An update on ${first}`;
}

/**
 * Compose the body. Sentences run in section order, which is deliberate: the
 * headline first, the detail in the middle, the ask last.
 */
export function draftMessage(fullName: string, picks: Record<string, string>, extra: string): string {
  const first = (fullName || "your child").split(/\s+/)[0];
  const lines: string[] = [];
  for (const s of SECTIONS) {
    const o = s.options.find((x) => x.key === picks[s.key]);
    if (o) lines.push(o.sentence.replace(/\{name\}/g, first));
  }
  const body = lines.join(" ");
  const tail = extra.trim();
  return [body, tail].filter(Boolean).join("\n\n");
}
