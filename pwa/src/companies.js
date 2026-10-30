// Company-specific interview prep (Pro). Each company gets a profile of how it
// typically interviews and a track: the built-in decks that cover what it asks
// most, in study order. Nothing new is generated. A track installs only the
// pattern and library decks it names (reusing any already on the device) and
// lays them out as a roadmap with every stage open. Pure metadata, no DOM.
//
// Loops vary by team, level and year; the profiles describe the common shape
// and say so in the UI rather than promising an exact process.

import { pathOfPattern, patternById } from "./patterns.js";
import { libraryByKey } from "./library.js";

// A track stage is a pattern ("p:<pattern id>") or a library deck
// ("l:<library key>:<deck id>"), with a note on why it's there. Library
// stages also carry the title to show before the deck is installed.
export const COMPANIES = [
  {
    key: "google",
    name: "Google",
    blurb: "Algorithm-heavy coding rounds judged on problem solving, code quality and how you communicate, plus a Googleyness round.",
    rounds: [
      { name: "Recruiter call", what: "Background, level and team interests. No coding." },
      { name: "Technical phone screen", what: "One or two coding problems in a shared doc, 45 minutes. Talk through your approach before writing code." },
      { name: "Onsite: coding × 3–4", what: "Data structures and algorithms. Expect follow-ups that change the constraints once you have a working solution." },
      { name: "Onsite: system design", what: "Usually from L5 up: design a large service end to end and defend the trade-offs." },
      { name: "Onsite: Googleyness & leadership", what: "Behavioural: collaboration, ambiguity, doing the right thing for users." },
    ],
    tips: [
      "Code without autocomplete or running it: practise writing clean code in a plain editor.",
      "State the brute force and its complexity first, then improve it.",
      "Graphs, trees and dynamic programming come up often; know BFS/DFS cold.",
    ],
    track: [
      ["p:graph", "Graph traversal shows up in a large share of rounds."],
      ["p:tree-dfs", "Recursive tree problems and their variants."],
      ["p:tree-bfs", "Level-order and shortest-path-on-grid questions."],
      ["p:dp-1d", "Classic DP warm-ups before the 2-D ones."],
      ["p:dp-2d", "Grid and string DP, a frequent follow-up."],
      ["p:binary-search", "Including searching on the answer."],
      ["p:bs-answer", "Binary search over the answer space."],
      ["p:heap", "Top-K and scheduling problems."],
      ["p:backtracking", "Permutations, subsets and search with pruning."],
      ["p:union-find", "Connectivity questions with a twist."],
      ["p:trie", "Prefix and word-search problems."],
      ["p:dijkstra", "Weighted shortest paths for the harder rounds."],
      ["l:java-spring:system-design", "For the system design round (L5+).", "System Design"],
    ],
  },
  {
    key: "meta",
    name: "Meta",
    blurb: "Fast-paced coding rounds, usually two problems in 45 minutes, plus system or product design and a behavioural round.",
    rounds: [
      { name: "Recruiter call", what: "Role, level and timeline." },
      { name: "Technical screen", what: "Two coding problems in about 45 minutes, in a shared editor." },
      { name: "Onsite: coding × 2", what: "Two problems per round again. Speed and bug-free code matter more than exotic algorithms." },
      { name: "Onsite: system or product design", what: "System design for backend roles, product architecture for product-facing ones." },
      { name: "Onsite: behavioural", what: "Conflict, ownership, growth and impact. Have specific stories ready." },
    ],
    tips: [
      "Aim to finish each problem in about 20 minutes: practise the common patterns until they're automatic.",
      "Arrays, strings, hash maps and trees dominate; very hard DP is rarer.",
      "Walk through a test case out loud before saying you're done.",
    ],
    track: [
      ["p:hashing", "Hash map lookups are behind many first questions."],
      ["p:two-pointers", "Array and string problems in place."],
      ["p:sliding-window", "Substring and subarray questions."],
      ["p:prefix-sum", "Range sums and subarray counts."],
      ["p:stack", "Parentheses, monotonic stack and expression problems."],
      ["p:binary-search", "Sorted arrays and boundary searches."],
      ["p:tree-dfs", "Binary tree recursion, very common."],
      ["p:tree-bfs", "Level order and right-side views."],
      ["p:graph", "Islands, clones and connectivity."],
      ["p:intervals", "Merging and meeting-room problems."],
      ["p:heap", "Top-K and k-closest questions."],
      ["l:java-spring:system-design", "For the design round.", "System Design"],
    ],
  },
  {
    key: "amazon",
    name: "Amazon",
    blurb: "Coding and design rounds where every interviewer also checks the Leadership Principles, and a Bar Raiser from outside the team.",
    rounds: [
      { name: "Online assessment", what: "Timed coding problems, often with a work-style survey." },
      { name: "Phone screen", what: "One coding problem plus Leadership Principle questions." },
      { name: "Loop: coding × 2–3", what: "Practical data structures and algorithms, often framed as real business problems." },
      { name: "Loop: system design", what: "For SDE II and up: design a scalable service, with attention to cost and failure." },
      { name: "Bar Raiser", what: "An interviewer from another team who can veto the hire. Mostly behavioural." },
    ],
    tips: [
      "Prepare two STAR stories per Leadership Principle: Customer Obsession, Ownership and Dive Deep come up most.",
      "Every round includes behavioural questions, not just the last one.",
      "Graphs, trees, heaps and BFS on grids are frequent.",
    ],
    track: [
      ["p:hashing", "Counting and lookup problems."],
      ["p:two-pointers", "Array problems in place."],
      ["p:sliding-window", "Subarray and substring limits."],
      ["p:tree-bfs", "Level-order and grid BFS."],
      ["p:tree-dfs", "Tree recursion."],
      ["p:graph", "Islands, rotting oranges and friends."],
      ["p:topo-sort", "Dependency ordering, e.g. build or course order."],
      ["p:heap", "Top-K, merging and scheduling."],
      ["p:intervals", "Scheduling and overlap problems."],
      ["p:dp-1d", "Common DP warm-ups."],
      ["p:greedy", "Interval and scheduling greedy choices."],
      ["l:java-spring:system-design", "For the system design round (SDE II+).", "System Design"],
    ],
  },
  {
    key: "microsoft",
    name: "Microsoft",
    blurb: "Practical coding rounds, often on linked lists, trees and strings, with object-oriented design and an 'as appropriate' final interview.",
    rounds: [
      { name: "Recruiter call", what: "Role, team and timeline." },
      { name: "Technical screen", what: "One or two coding problems." },
      { name: "Loop: coding × 2–3", what: "Data structures and algorithms with clean, working code." },
      { name: "Loop: design", what: "Object-oriented design for earlier career, system design for senior roles." },
      { name: "As appropriate (AA)", what: "Often a senior leader: a mix of technical depth and behavioural questions." },
    ],
    tips: [
      "Linked lists, trees and string manipulation come up often: write them without helpers.",
      "Expect to explain how you'd test your code.",
      "Know a few design patterns well enough to use them in an OO design question.",
    ],
    track: [
      ["p:hashing", "Lookups and counting."],
      ["p:two-pointers", "Arrays and strings in place."],
      ["p:fast-slow", "Linked list cycles and middles."],
      ["p:stack", "Parsing and matching problems."],
      ["p:tree-dfs", "Tree recursion and validation."],
      ["p:tree-bfs", "Level-order traversals."],
      ["p:binary-search", "Searching sorted and rotated arrays."],
      ["p:backtracking", "Combinations and word search."],
      ["p:dp-1d", "Common DP problems."],
      ["p:graph", "Traversal and connectivity."],
      ["p:trie", "Autocomplete-style questions."],
      ["l:java-spring:java-design-patterns-gof", "For object-oriented design.", "Design Patterns (GoF)"],
      ["l:java-spring:system-design", "For system design (senior roles).", "System Design"],
    ],
  },
];

export const companyByKey = new Map(COMPANIES.map((c) => [c.key, c]));

// A company track's roadmap is marked builtin = "company:<key>".
export const COMPANY_PREFIX = "company:";
export const companyRoadmapKey = (company) => `${COMPANY_PREFIX}${company.key}`;
export const companyOfRoadmapKey = (builtin) =>
  typeof builtin === "string" && builtin.startsWith(COMPANY_PREFIX) ? companyByKey.get(builtin.slice(COMPANY_PREFIX.length)) || null : null;

/**
 * A company's track resolved against the built-in content:
 *   { kind: "pattern", title, pattern, path, index, why } |
 *   { kind: "library", title, lib, deckId, why }
 * Throws on an unknown reference, so a typo fails the tests, not the app.
 */
export function trackStages(company) {
  return company.track.map(([ref, why, title]) => {
    const [kind, a, b] = ref.split(":");
    if (kind === "p") {
      const pattern = patternById.get(a);
      const path = pathOfPattern.get(a);
      if (!pattern || !path) throw new Error(`${company.key}: unknown pattern ${a}`);
      return { kind: "pattern", title: pattern.name, pattern, path, index: path.patterns.indexOf(pattern), why };
    }
    if (kind === "l") {
      const lib = libraryByKey.get(a);
      if (!lib || !b) throw new Error(`${company.key}: unknown library deck ${ref}`);
      return { kind: "library", title: title || b, lib, deckId: b, why };
    }
    throw new Error(`${company.key}: bad track ref ${ref}`);
  });
}

// Short summary for cards: "11 patterns · 2 library decks".
export function trackSummary(company) {
  const stages = trackStages(company);
  const p = stages.filter((s) => s.kind === "pattern").length;
  const l = stages.length - p;
  return [p ? `${p} pattern${p === 1 ? "" : "s"}` : null, l ? `${l} library deck${l === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
}
