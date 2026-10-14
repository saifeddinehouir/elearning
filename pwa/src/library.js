// Built-in deck libraries: ready-made course decks shipped as JSON under
// library/<key>/ (with an index.json listing them in study order). Unlike the
// pattern paths, nothing is generated and nothing is locked — installing a
// library imports every deck into the daily mix and lays them out as a
// roadmap in the suggested order. Pure metadata, no DOM.

export const LIBRARIES = [
  {
    key: "java-spring",
    name: "Java & Spring Boot",
    blurb: "Backend interview prep: Java core, concurrency, design patterns, Spring Core, Boot, Web, Data/JPA, databases, testing and system design.",
    dir: "library/java-spring/",
    icon: "coffee",
    short: "Java, Spring, databases, testing, system design",
    // Kept in sync with index.json by tests/library.test.mjs.
    deckCount: 12,
    questionCount: 521,
  },
  {
    key: "devops",
    name: "DevOps & Infrastructure",
    blurb: "From Linux and networking to CI/CD, Docker, Kubernetes, Terraform, Ansible, AWS, observability and DevSecOps.",
    dir: "library/devops/",
    icon: "server",
    short: "Linux, CI/CD, Docker, Kubernetes, Terraform, AWS, SRE",
    deckCount: 10,
    questionCount: 196,
  },
];

export const libraryByKey = new Map(LIBRARIES.map((l) => [l.key, l]));

// Decks installed from a library carry libraryKey = "<library>:<deck id>".
export const libraryKeyFor = (lib, deckId) => `${lib.key}:${deckId}`;
export const libraryOfDeck = (deck) =>
  deck && deck.libraryKey ? libraryByKey.get(String(deck.libraryKey).split(":")[0]) || null : null;
