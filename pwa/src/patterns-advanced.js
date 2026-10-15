// "Advanced Patterns" path: harder patterns that build on the core path.
// Same shape as PATTERNS in patterns.js (authored correct choice first).
// `confusers` are chosen so no decoy is ALSO a valid way to solve every
// problem in the stage: a recognition question must have one right answer.
// Pure data, no imports.

export const ADVANCED_PATTERNS = [
  {
    id: "mono-deque",
    name: "Monotonic Deque",
    tagline: "Best-of-window in O(1), even inside a DP.",
    signals: [
      "Max / min of every window of size k",
      "dp[i] depends on the best dp[j] over a sliding range of j",
      "Shortest subarray with sum ≥ K when negatives exist (prefix sums + deque)",
    ],
    idea: "Keep indices in a deque whose values are monotonic. Pop from the back anything the new element dominates, pop from the front anything that left the window. The front is always the window's best.",
    template: `dq = deque()   # indices, values decreasing
for i, x in enumerate(nums):
    while dq and nums[dq[-1]] <= x:
        dq.pop()
    dq.append(i)
    if dq[0] <= i - k:
        dq.popleft()
    if i >= k - 1:
        out.append(nums[dq[0]])`,
    complexity: "O(n) amortised · O(k) space",
    confusers: ["two-pointers", "stack", "binary-search", "greedy"],
    problems: [
      {
        title: "Sliding Window Maximum",
        difficulty: "hard",
        statement: "Return the maximum of every contiguous window of size k, in O(n).",
        why: "Max of every fixed window → a decreasing deque of indices whose front is the window maximum. A heap would be O(n log n) with lazy deletion.",
        q: {
          type: "approach",
          prompt: "Why is the deque solution O(n) despite a while loop inside the for loop?",
          choices: [
            "Every index is pushed once and popped at most once in total",
            "The while loop runs at most k times",
            "Deques support O(1) search",
            "It isn't — it's O(n · k)",
          ],
          explanation: "Amortised analysis: across the whole run there are at most n pushes and n pops, whatever the inner loop does on a given step.",
        },
      },
      {
        title: "Shortest Subarray with Sum at Least K",
        difficulty: "hard",
        statement: "Return the length of the shortest non-empty subarray whose sum is at least K. Values may be negative; n is up to 10⁵.",
        why: "Negatives break the plain sliding window. Take prefix sums P and keep a deque of indices with increasing P; pop the front while P[i] − P[front] ≥ K.",
        q: {
          type: "approach",
          prompt: "Why may you pop index j from the BACK when P[j] ≥ P[i]?",
          choices: [
            "Any future end prefers starting at i: it's later (shorter) and its prefix is smaller or equal (bigger sum)",
            "Because prefix sums are sorted",
            "To keep the deque size at most K",
            "Because j has left the window",
          ],
          explanation: "j is dominated by i on both length and sum, so it can never be the best start again.",
        },
      },
      {
        title: "Constrained Subsequence Sum",
        difficulty: "hard",
        statement: "Choose a non-empty subsequence with maximum sum, where any two consecutive chosen indices are at most k apart.",
        why: "dp[i] = nums[i] + max(0, max of dp over the previous k indices): a sliding-window maximum over the DP array itself.",
        q: {
          type: "fill_blank",
          prompt: "dp[i] = nums[i] + ______",
          choices: ["max(0, max of dp over the last k indices)", "dp[i − k]", "max(dp[i − 1], dp[i − 2])", "the sum of the last k dp values"],
          explanation: "Either start fresh at i (add 0) or extend the best subsequence ending within the last k positions — that max comes from the deque front.",
        },
      },
    ],
  },
  {
    id: "bs-answer",
    name: "Binary Search on the Answer",
    tagline: "Guess the answer, check it, halve the range.",
    signals: [
      "“Minimise the maximum …” or “maximise the minimum …”",
      "A numeric answer range where “can it be done with X?” is monotonic",
      "Huge values (up to 10⁹) but a greedy O(n) feasibility check",
    ],
    idea: "Don't construct the answer — guess it. Write feasible(x), prove it's monotonic, and binary-search the boundary between impossible and possible.",
    template: `def feasible(limit):
    parts, cur = 1, 0
    for x in nums:
        if cur + x > limit:
            parts, cur = parts + 1, 0
        cur += x
    return parts <= k

lo, hi = max(nums), sum(nums)
while lo < hi:
    mid = (lo + hi) // 2
    if feasible(mid): hi = mid
    else: lo = mid + 1`,
    complexity: "O(n log(range))",
    confusers: ["greedy", "heap", "sliding-window", "prefix-sum"],
    problems: [
      {
        title: "Split Array Largest Sum",
        difficulty: "hard",
        statement: "Split an array of non-negative integers into k non-empty contiguous parts so the largest part-sum is as small as possible. Return that sum.",
        why: "“Minimise the maximum” + a greedy check (can every part stay ≤ X using at most k parts?) that's monotonic in X.",
        q: {
          type: "approach",
          prompt: "Why is the greedy check — fill each part as full as allowed — correct?",
          choices: [
            "Packing a part as full as possible never increases the number of parts needed later",
            "It tries every possible split",
            "Because the array is sorted",
            "It's only a heuristic",
          ],
          explanation: "Ending a part earlier only pushes more elements into later parts, so the greedy part count is the minimum for that limit.",
        },
      },
      {
        title: "Magnetic Force Between Two Balls",
        difficulty: "medium",
        statement: "Place m balls into baskets at given positions so that the minimum distance between any two balls is as large as possible.",
        why: "“Maximise the minimum gap” → binary-search the gap; greedily drop each ball at the first position ≥ previous + gap.",
        q: {
          type: "approach",
          prompt: "Before running the greedy feasibility check you must:",
          choices: ["Sort the positions", "Remove duplicate positions", "Build prefix sums", "Put the gaps in a heap"],
          explanation: "The greedy walks positions left to right, which only makes sense on sorted positions.",
        },
      },
      {
        title: "Kth Smallest Element in a Sorted Matrix",
        difficulty: "medium",
        statement: "In an n×n matrix whose rows and columns are sorted ascending, return the k-th smallest value.",
        why: "Binary-search the VALUE and count entries ≤ mid with a staircase walk from the bottom-left corner in O(n).",
        q: {
          type: "complexity",
          prompt: "Time of value binary search + staircase counting, with value range R?",
          choices: ["O(n log R)", "O(n² log n)", "O(k log n)", "O(log R)"],
          explanation: "log R rounds, each counting in O(n) by moving up or right along the staircase.",
        },
      },
    ],
  },
  {
    id: "dijkstra",
    name: "Dijkstra / Weighted Shortest Path",
    tagline: "Expand the closest node first.",
    signals: [
      "Shortest path with non-negative edge weights",
      "“Minimum cost / time / effort” to reach a node or cell",
      "A grid where each move has a different cost",
    ],
    idea: "Always expand the closest unfinished node using a min-heap of (distance, node). With non-negative weights, the first time a node is popped its distance is final.",
    template: `dist = {src: 0}
pq = [(0, src)]
while pq:
    d, u = heapq.heappop(pq)
    if d > dist.get(u, inf):
        continue              # stale entry
    for v, w in adj[u]:
        nd = d + w
        if nd < dist.get(v, inf):
            dist[v] = nd
            heapq.heappush(pq, (nd, v))`,
    complexity: "O((V + E) log V)",
    confusers: ["tree-bfs", "bfs-state", "topo-sort", "greedy"],
    problems: [
      {
        title: "Network Delay Time",
        difficulty: "medium",
        statement: "A signal starts at node k in a directed graph with travel-time weights. Return how long until every node receives it, or −1.",
        why: "Single-source shortest paths with non-negative weights; the answer is the largest of those distances.",
        q: {
          type: "approach",
          prompt: "What does `if d > dist[u]: continue` protect against?",
          choices: [
            "Processing stale heap entries left behind after a shorter path was found",
            "Negative edge weights",
            "Cycles in the graph",
            "Integer overflow",
          ],
          explanation: "Heaps don't support decrease-key, so outdated (longer) entries stay in the heap and must be skipped.",
        },
      },
      {
        title: "Path With Minimum Effort",
        difficulty: "medium",
        statement: "Move through a grid of heights; a path's effort is its largest absolute height difference between neighbouring cells. Minimise the effort from top-left to bottom-right.",
        why: "Weighted grid shortest path where cost = max edge, not sum. Dijkstra still works because a path's cost never decreases as it grows.",
        q: {
          type: "approach",
          prompt: "Which alternative ALSO solves it correctly?",
          choices: [
            "Binary search on the effort + BFS/DFS reachability check",
            "Plain BFS counting steps",
            "Greedy: always step to the lowest neighbour",
            "1-D DP over rows, moving only right and down",
          ],
          explanation: "“Can I get through with effort ≤ X?” is monotonic, so binary search on the answer works too. Paths may need to go up and left, which rules out the DP.",
        },
      },
      {
        title: "Cheapest Flights Within K Stops",
        difficulty: "medium",
        statement: "Find the cheapest price from src to dst using at most k stops.",
        why: "Shortest path with a cap on edges used → Bellman-Ford limited to k + 1 rounds, or Dijkstra over (node, stops) states.",
        q: {
          type: "approach",
          prompt: "Why does Dijkstra over nodes alone give wrong answers here?",
          choices: [
            "A cheap path that uses too many stops can finalise a node, hiding a pricier path that respects the limit",
            "Prices can be negative",
            "The graph is undirected",
            "Dijkstra can't handle cycles",
          ],
          explanation: "The state must include stops used; otherwise “best cost to reach v” ignores whether you can still afford the remaining hops.",
        },
      },
    ],
  },
  {
    id: "bfs-state",
    name: "BFS over States",
    tagline: "When position alone isn't the whole story.",
    signals: [
      "Fewest moves, where the state needs more than a position (keys held, nodes visited)",
      "Puzzles: lock wheels, sliding tiles, word ladders",
      "A small state space you can encode as a tuple or bitmask",
    ],
    idea: "Make the BFS node a full state — (cell, keys mask), (node, visited mask), a board string — and keep the visited set over states, not positions.",
    template: `start = (0, 1 << 0)            # (node, visited mask)
q = deque([(start, 0)])
seen = {start}
while q:
    (u, mask), d = q.popleft()
    if mask == full:
        return d
    for v in adj[u]:
        s = (v, mask | 1 << v)
        if s not in seen:
            seen.add(s)
            q.append((s, d + 1))`,
    complexity: "O(#states × branching)",
    confusers: ["dijkstra", "backtracking", "tree-bfs", "union-find"],
    problems: [
      {
        title: "Shortest Path Visiting All Nodes",
        difficulty: "hard",
        statement: "In a connected undirected graph with at most 12 nodes, return the length of the shortest walk that visits every node. You may start anywhere and revisit nodes.",
        why: "Fewest moves + you must track which nodes are visited → BFS over (node, mask), starting from every node at once.",
        q: {
          type: "complexity",
          prompt: "How many states can the BFS visit?",
          choices: ["n · 2ⁿ", "n!", "2ⁿ", "n²"],
          explanation: "Any of n current nodes combined with any of 2ⁿ visited subsets.",
        },
      },
      {
        title: "Open the Lock",
        difficulty: "medium",
        statement: "A 4-wheel combination lock starts at 0000; one move turns one wheel by one notch. Avoid the dead-end combinations and return the fewest moves to reach the target.",
        why: "Each combination is a state with 8 neighbours; fewest moves in an unweighted state graph → BFS.",
        q: {
          type: "complexity",
          prompt: "At most how many states can the BFS visit?",
          choices: ["10,000", "8", "40", "10⁸"],
          explanation: "Four wheels with ten digits each: 10⁴ combinations.",
        },
      },
      {
        title: "Shortest Path to Get All Keys",
        difficulty: "hard",
        statement: "On a grid with keys a–f and matching locks A–F, return the fewest steps needed to collect every key.",
        why: "Which keys you hold changes where you can go → BFS over (row, col, keys mask).",
        q: {
          type: "approach",
          prompt: "Why can't the visited set be just (row, col)?",
          choices: [
            "Coming back to a cell holding more keys is a new state that may open new paths",
            "Each cell may be visited only once",
            "It would use too little memory",
            "Keys can be dropped",
          ],
          explanation: "Paths often need to walk back through visited cells after picking up a key.",
        },
      },
    ],
  },
  {
    id: "mst",
    name: "Minimum Spanning Tree",
    tagline: "Connect everything for the least total cost.",
    signals: [
      "Connect all points / cities with minimum total cost",
      "“Cheapest network”, “min cost to connect”",
      "A weighted graph where you need a tree that touches every node",
    ],
    idea: "Kruskal: sort the edges by weight and add each one that joins two different components (union-find). Prim: grow one tree, always adding the cheapest edge that leaves it.",
    template: `edges.sort()                    # (w, u, v)
total = used = 0
for w, u, v in edges:
    if union(u, v):             # different components
        total += w
        used += 1
        if used == n - 1:
            break`,
    complexity: "O(E log E) Kruskal · O(V²) array-based Prim",
    confusers: ["dijkstra", "topo-sort", "graph", "sweep"],
    problems: [
      {
        title: "Min Cost to Connect All Points",
        difficulty: "medium",
        statement: "Given points on a plane, connect all of them with minimum total Manhattan distance.",
        why: "Connect everything at minimum total cost → MST. On this complete graph, O(n²) Prim beats sorting all n² edges.",
        q: {
          type: "complexity",
          prompt: "For n points (a complete graph), which is asymptotically best?",
          choices: ["Prim with a plain array, O(n²)", "Kruskal, O(n² log n)", "Dijkstra from point 0", "BFS from point 0"],
          explanation: "With E ≈ n², Kruskal pays an extra log for sorting; array Prim scans n candidates n times. Dijkstra finds shortest paths, not a minimum tree.",
        },
      },
      {
        title: "Connecting Cities With Minimum Cost",
        difficulty: "medium",
        statement: "Given weighted roads between n cities, return the minimum cost to connect all of them, or −1 if that's impossible.",
        why: "Classic Kruskal + union-find; it's impossible when fewer than n − 1 edges get accepted.",
        q: {
          type: "approach",
          prompt: "How does Kruskal detect that connecting everything is impossible?",
          choices: [
            "Fewer than n − 1 edges were accepted after scanning all of them",
            "Some edge was rejected",
            "Two edges have equal weight",
            "The heaviest edge was used",
          ],
          explanation: "A spanning tree on n nodes has exactly n − 1 edges; fewer means some component never joined.",
        },
      },
      {
        title: "Critical and Pseudo-Critical Edges in MST",
        difficulty: "hard",
        statement: "Classify each edge as critical (in every MST) or pseudo-critical (in some MSTs but not all).",
        why: "Rerun Kruskal per edge: excluding it raises the MST weight → critical; forcing it in keeps the weight → pseudo-critical.",
        q: {
          type: "approach",
          prompt: "An edge is CRITICAL when:",
          choices: [
            "The MST built without it costs more, or can't connect the graph",
            "It has the smallest weight",
            "It appears in the first MST you find",
            "Forcing it into the MST keeps the same total",
          ],
          explanation: "The last option is the test for pseudo-critical; critical means every MST needs it.",
        },
      },
    ],
  },
  {
    id: "lis",
    name: "LIS & Patience Sorting",
    tagline: "Longest increasing subsequence in O(n log n).",
    signals: [
      "“Longest increasing / non-decreasing subsequence”",
      "Nesting or stacking items with two dimensions (envelopes, boxes)",
      "n up to 10⁵, so the O(n²) DP is too slow",
    ],
    idea: "Keep tails[k] = the smallest tail of any increasing subsequence of length k + 1. For each x, binary-search the first tail ≥ x and replace it, or append. The length of tails is the answer.",
    template: `tails = []
for x in nums:
    i = bisect_left(tails, x)
    if i == len(tails):
        tails.append(x)
    else:
        tails[i] = x
return len(tails)`,
    complexity: "O(n log n) time · O(n) space",
    confusers: ["stack", "sliding-window", "heap", "two-pointers"],
    problems: [
      {
        title: "Longest Increasing Subsequence",
        difficulty: "medium",
        statement: "Return the length of the longest strictly increasing subsequence, in O(n log n).",
        why: "Patience sorting: a tails array updated by binary search.",
        q: {
          type: "trace",
          prompt: "After processing [10, 9, 2, 5, 3, 7], tails is:",
          choices: ["[2, 3, 7]", "[2, 5, 7]", "[10, 9, 2]", "[2, 3, 5, 7]"],
          explanation: "10 → [10]; 9 replaces 10; 2 replaces 9; 5 appends; 3 replaces 5; 7 appends → [2, 3, 7]. Note tails isn't itself a valid subsequence; only its length matters.",
        },
      },
      {
        title: "Russian Doll Envelopes",
        difficulty: "hard",
        statement: "Envelope (w, h) fits inside another only if both its width and height are strictly smaller. Return the maximum nesting depth.",
        why: "Sort by width, then run LIS on the heights: a 2-D chain reduced to 1-D LIS.",
        q: {
          type: "approach",
          prompt: "Why sort equal widths by height DESCENDING?",
          choices: [
            "So two envelopes with the same width can't both appear in the increasing height sequence",
            "To make the LIS longer",
            "Binary search requires it",
            "It doesn't matter",
          ],
          explanation: "With ascending heights, [3,4] and [3,5] could chain even though equal widths can't nest.",
        },
      },
      {
        title: "Minimum Operations to Make a Subsequence",
        difficulty: "hard",
        statement: "target has distinct values. Return the minimum number of insertions into arr so that target becomes a subsequence of it. Both can have 10⁵ elements.",
        why: "Map arr's values to their index in target; the longest common subsequence becomes an LIS over those indices — O(n log n) instead of an O(n·m) table.",
        q: {
          type: "approach",
          prompt: "The answer equals:",
          choices: [
            "len(target) − LIS of the mapped indices",
            "The LIS of arr",
            "len(arr) − len(target)",
            "len(target) − len(arr)",
          ],
          explanation: "The LIS is the longest part of target already present in order; every other target element must be inserted.",
        },
      },
    ],
  },
  {
    id: "interval-dp",
    name: "Interval DP",
    tagline: "dp over ranges i..j, split at every k.",
    signals: [
      "A choice splits the range into independent left and right parts (burst, cut, merge)",
      "The state is a SUBARRAY i..j, not a prefix",
      "Cost depends on which element is handled last (or first) in a range",
    ],
    idea: "Define dp[i][j] over the range i..j, try every split point k, combine dp[i][k] with dp[k][j], and fill the table in order of increasing range length.",
    template: `for length in range(2, n + 1):
    for i in range(0, n - length + 1):
        j = i + length - 1
        dp[i][j] = min(
            dp[i][k] + dp[k + 1][j] + cost(i, k, j)
            for k in range(i, j)
        )`,
    complexity: "O(n³) time · O(n²) space",
    confusers: ["greedy", "backtracking", "heap", "state-dp"],
    problems: [
      {
        title: "Burst Balloons",
        difficulty: "hard",
        statement: "Bursting balloon i earns nums[left] × nums[i] × nums[right] using its current neighbours. Choose the order that maximises total coins.",
        why: "Pick which balloon bursts LAST in the open range (i, j): its neighbours are then fixed as i and j, splitting the range into independent halves.",
        q: {
          type: "approach",
          prompt: "Why reason about the LAST balloon burst in a range, not the first?",
          choices: [
            "The last one's neighbours are the range boundaries, so the left and right sub-ranges become independent",
            "It's always the largest balloon",
            "It makes the recursion O(n)",
            "The first one has no neighbours",
          ],
          explanation: "If you pick the first burst, its removal changes the neighbours of everything around it, so sub-problems aren't independent.",
        },
      },
      {
        title: "Minimum Cost to Cut a Stick",
        difficulty: "hard",
        statement: "Cut a stick at given positions; each cut costs the current length of the piece being cut. Choose the cutting order that minimises total cost.",
        why: "Sort the cuts and add both ends; dp[i][j] = (cuts[j] − cuts[i]) + min over k between them of dp[i][k] + dp[k][j].",
        q: {
          type: "complexity",
          prompt: "With c cuts, what's the time complexity?",
          choices: ["O(c³)", "O(c²)", "O(c log c)", "O(2ᶜ)"],
          explanation: "O(c²) ranges, each trying O(c) split points.",
        },
      },
      {
        title: "Palindrome Partitioning II",
        difficulty: "hard",
        statement: "Return the minimum number of cuts needed to split a string into palindromic pieces.",
        why: "A range table marks which s[i..j] are palindromes; a 1-D DP over end positions then counts the fewest cuts.",
        q: {
          type: "fill_blank",
          prompt: "isPal[i][j] = (s[i] == s[j]) and ______",
          choices: ["(j − i < 2 or isPal[i + 1][j − 1])", "isPal[i][j − 1]", "isPal[i − 1][j + 1]", "(j − i) is even"],
          explanation: "Matching ends wrap a palindrome only if the inside is one too (or there is no inside).",
        },
      },
    ],
  },
  {
    id: "bitmask-dp",
    name: "Bitmask DP",
    tagline: "Subsets of a tiny set as DP states.",
    signals: [
      "n ≤ 20 or so, and you must track WHICH items were used",
      "Assignment / matching / travelling-salesman flavour",
      "Brute force over orders (n!) is too slow but 2ⁿ is fine",
    ],
    idea: "Encode the set of used items as a bitmask. dp[mask] (or dp[mask][last]) is the best result having used exactly those items; transition by adding one unused item.",
    template: `dp = [inf] * (1 << n)
dp[0] = 0
for mask in range(1 << n):
    k = bin(mask).count("1")       # next person to assign
    if k >= n:
        continue
    for job in range(n):
        if not mask & (1 << job):
            nxt = mask | (1 << job)
            dp[nxt] = min(dp[nxt], dp[mask] + cost[k][job])`,
    complexity: "O(2ⁿ · n), or O(2ⁿ · n²) with a 'last' index",
    confusers: ["greedy", "dp-2d", "heap", "interval-dp"],
    problems: [
      {
        title: "Find the Shortest Superstring",
        difficulty: "hard",
        statement: "Given up to 12 words, return the shortest string that contains each of them as a substring.",
        why: "Word order matters and n is tiny → TSP-style dp[mask][last] using pairwise overlap savings.",
        q: {
          type: "complexity",
          prompt: "Time of dp[mask][last] with pairwise transitions?",
          choices: ["O(2ⁿ · n²)", "O(n!)", "O(2ⁿ)", "O(n³)"],
          explanation: "2ⁿ · n states, each trying n next words. n! is the brute force over orders it replaces.",
        },
      },
      {
        title: "Partition to K Equal Sum Subsets",
        difficulty: "medium",
        statement: "Can an array of at most 16 numbers be split into k subsets with equal sums?",
        why: "Track the used numbers as a mask; dp[mask] = how full the bucket currently being built is (sum of used values mod target).",
        q: {
          type: "approach",
          prompt: "Which quick check rules out many inputs before any search?",
          choices: [
            "Return false if total % k != 0 or the largest value exceeds total / k",
            "Sort descending and return true",
            "Return false whenever n is odd",
            "Return false whenever k == 1",
          ],
          explanation: "Each subset must sum to exactly total / k, which must be an integer and at least the largest value.",
        },
      },
      {
        title: "Number of Ways to Wear Different Hats",
        difficulty: "hard",
        statement: "10 people each like some of 40 hats. Count the ways for everyone to wear a different hat they like.",
        why: "Put the 10 PEOPLE in the mask (not the 40 hats): iterate over hats, dp[mask] = ways to hat that set of people.",
        q: {
          type: "approach",
          prompt: "Why use a mask over people instead of hats?",
          choices: ["2¹⁰ states is tiny; 2⁴⁰ is impossible", "Hats come in a fixed order", "People can share hats", "It's an arbitrary choice"],
          explanation: "Always put the smaller set in the mask.",
        },
      },
    ],
  },
  {
    id: "tree-dp",
    name: "DP on Trees",
    tagline: "Each subtree returns a small tuple of states.",
    signals: [
      "Each tree node has a choice (take / skip, camera / no camera)",
      "A subtree's answer needs MORE than one number (best with the node vs. without it)",
      "“For every node, compute …” (re-rooting)",
    ],
    idea: "Post-order DFS returns a small tuple of states per node, e.g. (best if taken, best if skipped), and the parent combines its children's tuples. Re-rooting adds a second pass to shift the root.",
    template: `def dfs(node):
    if not node:
        return (0, 0)            # (take, skip)
    lt, ls = dfs(node.left)
    rt, rs = dfs(node.right)
    take = node.val + ls + rs
    skip = max(lt, ls) + max(rt, rs)
    return (take, skip)`,
    complexity: "O(n) time · O(h) space",
    confusers: ["tree-bfs", "heap", "union-find", "backtracking"],
    problems: [
      {
        title: "House Robber III",
        difficulty: "medium",
        statement: "Houses form a binary tree; robbing two directly-linked houses alerts the police. Maximise the loot.",
        why: "Each node returns (rob it, skip it): two states per subtree, combined post-order.",
        q: {
          type: "approach",
          prompt: "If you rob a node, its children contribute:",
          choices: ["Their 'skip' values", "Their 'take' values", "max(take, skip) for each", "Nothing at all"],
          explanation: "Robbing the parent forbids robbing either child, but the grandchildren are still fair game, and 'skip' already accounts for them.",
        },
      },
      {
        title: "Binary Tree Cameras",
        difficulty: "hard",
        statement: "A camera watches its own node, its parent and its children. Return the minimum number of cameras that watch every node.",
        why: "Per-node states (has camera / covered / not covered) decided bottom-up; cameras go on the parents of uncovered nodes.",
        q: {
          type: "approach",
          prompt: "Why put a camera on a leaf's PARENT rather than the leaf?",
          choices: [
            "The parent covers the leaf, its sibling and its own parent — a superset of what the leaf covers",
            "Leaves can't hold cameras",
            "It's cheaper to compute",
            "It keeps the tree balanced",
          ],
          explanation: "An exchange argument: moving a leaf's camera up never covers less.",
        },
      },
      {
        title: "Sum of Distances in Tree",
        difficulty: "hard",
        statement: "For every node in a tree of n nodes, return the sum of its distances to all other nodes, in O(n).",
        why: "Re-rooting DP: one DFS gets subtree sizes and the root's answer; a second shifts the root to each child.",
        q: {
          type: "fill_blank",
          prompt: "ans[child] = ans[parent] − size[child] + ______",
          choices: ["(n − size[child])", "size[parent]", "1", "(n − 1)"],
          explanation: "Moving the root to child brings its size[child] nodes one step closer and pushes the other n − size[child] one step further away.",
        },
      },
    ],
  },
  {
    id: "state-dp",
    name: "State-Machine DP",
    tagline: "A few modes per step, rolled forward.",
    signals: [
      "Each step you're in one of a few modes (holding, just sold, cooling down)",
      "Stock trading with fees, cooldowns or a cap on transactions",
      "Counting sequences under rules about recent history",
    ],
    idea: "Name the states, write how each is reached from the previous step's states, and roll them forward in O(1) memory.",
    template: `hold, sold, rest = -inf, 0, 0
for p in prices:
    hold, sold, rest = (
        max(hold, rest - p),   # keep holding / buy
        hold + p,              # sell today
        max(rest, sold),       # cool down / stay out
    )
return max(sold, rest)`,
    complexity: "O(n · states) time · O(states) space",
    confusers: ["greedy", "sliding-window", "heap", "two-pointers"],
    problems: [
      {
        title: "Stock with Cooldown",
        difficulty: "medium",
        statement: "Trade a stock any number of times, but after selling you must wait one day before buying again. Maximise profit.",
        why: "Three states per day — holding, just sold, resting — with the cooldown forcing sold → rest → buy.",
        q: {
          type: "approach",
          prompt: "When buying today, which state must yesterday have been?",
          choices: ["rest (not 'just sold')", "sold", "hold", "Any state"],
          explanation: "Selling yesterday triggers the cooldown, so buys only come from rest.",
        },
      },
      {
        title: "Stock with At Most K Transactions",
        difficulty: "hard",
        statement: "You may complete at most k buy-sell transactions. Maximise profit.",
        why: "States per transaction index: buy[j] and sell[j] for j = 1..k, all updated each day.",
        q: {
          type: "approach",
          prompt: "When k ≥ n / 2, the problem becomes:",
          choices: [
            "Unlimited transactions — sum every positive day-to-day gain",
            "A single transaction",
            "Impossible to solve exactly",
            "A binary search on the profit",
          ],
          explanation: "You can't use more than n / 2 transactions anyway, so the cap stops mattering — skip the O(n·k) table.",
        },
      },
      {
        title: "Student Attendance Record II",
        difficulty: "hard",
        statement: "Count length-n attendance strings over {A, L, P} with fewer than 2 'A's in total and never 3 'L's in a row, modulo 10⁹ + 7.",
        why: "State = (absences so far, current run of L's): 2 × 3 = 6 states rolled forward n times.",
        q: {
          type: "complexity",
          prompt: "Time complexity of rolling the 6 states forward?",
          choices: ["O(n)", "O(3ⁿ)", "O(n²)", "O(n log n)"],
          explanation: "Constant work per character. (Matrix exponentiation of the 6×6 transition can even get O(log n).)",
        },
      },
    ],
  },
  {
    id: "kmp",
    name: "String Matching (KMP / Rolling Hash)",
    tagline: "Linear-time pattern search and substring checks.",
    signals: [
      "Find a pattern in a text faster than O(n·m)",
      "Longest prefix that's also a suffix; periodic or repeated strings",
      "Compare many substrings for equality (rolling hash)",
    ],
    idea: "KMP precomputes lps[i], the longest proper prefix of pattern[:i + 1] that's also its suffix, so a mismatch jumps back instead of restarting. Rolling hashes compare substrings in O(1).",
    template: `lps = [0] * len(p)
k = 0
for i in range(1, len(p)):
    while k and p[i] != p[k]:
        k = lps[k - 1]
    if p[i] == p[k]:
        k += 1
    lps[i] = k`,
    complexity: "O(n + m)",
    confusers: ["sliding-window", "trie", "stack", "dp-2d"],
    problems: [
      {
        title: "First Occurrence in a String (KMP)",
        difficulty: "medium",
        statement: "Return the first index where needle occurs in haystack, with O(n + m) worst-case time.",
        why: "Guaranteed linear substring search → KMP's failure function.",
        q: {
          type: "trace",
          prompt: "What is lps for the pattern \"aabaaab\"?",
          choices: ["[0,1,0,1,2,2,3]", "[0,1,0,1,2,3,3]", "[0,0,0,1,2,2,3]", "[0,1,0,1,2,2,2]"],
          explanation: "At index 5 ('a') the match of length 2 fails against 'b', falls back to lps[1] = 1, then matches → 2. Index 6 ('b') extends to 3.",
        },
      },
      {
        title: "Shortest Palindrome",
        difficulty: "hard",
        statement: "Add the fewest characters to the FRONT of s to make it a palindrome. s can be 5 × 10⁴ characters.",
        why: "The longest palindromic prefix of s is the final lps value of s + '#' + reverse(s).",
        q: {
          type: "approach",
          prompt: "Why put a separator like '#' between s and its reverse?",
          choices: [
            "So the matched prefix can't run past the end of s into the reversed copy",
            "To mark the centre of the palindrome",
            "To make the length odd",
            "It speeds up the loop",
          ],
          explanation: "Without it, for s = \"aaa\" the lps could exceed len(s), which makes no sense as a prefix of s.",
        },
      },
      {
        title: "Longest Duplicate Substring",
        difficulty: "hard",
        statement: "Return any longest substring that occurs at least twice in s (n up to 3 × 10⁴).",
        why: "Binary-search the length L; check “does some length-L substring repeat?” with a rolling hash in O(n).",
        q: {
          type: "approach",
          prompt: "What makes the length binary-searchable?",
          choices: [
            "If some length-L substring repeats, a shorter repeat exists too (its prefix)",
            "Hash values are monotonic in L",
            "The string is sorted",
            "Longer substrings are rarer, so it's random",
          ],
          explanation: "Feasibility is monotonic: true up to the answer, false after it.",
        },
      },
    ],
  },
  {
    id: "fenwick",
    name: "Fenwick / Segment Tree",
    tagline: "Range queries with updates, in O(log n).",
    signals: [
      "Prefix or range sums WITH updates mixed in",
      "“How many smaller values have I seen so far?”",
      "Range min / max on data that keeps changing",
    ],
    idea: "A Fenwick tree stores partial sums over power-of-two blocks: update and prefix query both walk O(log n) indices using i & −i. Segment trees generalise to min/max and range updates.",
    template: `def update(i, delta):          # 1-indexed
    while i <= n:
        tree[i] += delta
        i += i & -i

def query(i):                  # sum of [1..i]
    s = 0
    while i > 0:
        s += tree[i]
        i -= i & -i
    return s`,
    complexity: "O(log n) per update / query · O(n) space",
    confusers: ["prefix-sum", "binary-search", "heap", "sweep"],
    problems: [
      {
        title: "Range Sum Query – Mutable",
        difficulty: "medium",
        statement: "Support updating single elements and querying range sums, many times each, interleaved.",
        why: "Plain prefix sums cost O(n) per update; a Fenwick tree makes both operations O(log n).",
        q: {
          type: "approach",
          prompt: "What does i & −i compute?",
          choices: ["The lowest set bit of i — the size of the block tree[i] covers", "i modulo 2", "The highest set bit of i", "The two's complement of i"],
          explanation: "In two's complement, −i flips every bit above the lowest 1, so AND keeps only that bit.",
        },
      },
      {
        title: "Count of Smaller Numbers After Self",
        difficulty: "hard",
        statement: "For each element, count how many elements to its right are smaller, in O(n log n).",
        why: "Scan right to left, compress the values, and ask the Fenwick tree how many smaller values were already inserted.",
        q: {
          type: "approach",
          prompt: "Why compress the values first?",
          choices: [
            "Values may be huge or negative; the tree needs small indices 1..m",
            "To sort the output",
            "To remove duplicates from the answer",
            "Fenwick trees only store booleans",
          ],
          explanation: "Only relative order matters, so map the m distinct values to ranks.",
        },
      },
      {
        title: "Falling Squares",
        difficulty: "hard",
        statement: "Squares drop one by one onto a number line and stack. After each drop, report the height of the tallest stack.",
        why: "Range-max query plus range-assign update over compressed coordinates → a segment tree with lazy propagation.",
        q: {
          type: "approach",
          prompt: "Why is a segment tree a better fit than a Fenwick tree here?",
          choices: [
            "It needs range max with range-assign updates; Fenwick trees suit invertible operations like sums",
            "Fenwick trees are asymptotically slower",
            "Fenwick trees can't use compressed coordinates",
            "They're interchangeable here",
          ],
          explanation: "Max isn't invertible, so you can't subtract prefixes to get a range answer.",
        },
      },
    ],
  },
  {
    id: "sweep",
    name: "Sweep Line",
    tagline: "Sort the events, sweep, track what's active.",
    signals: [
      "Events at points in time or space (starts and ends)",
      "“Maximum overlap”, “skyline”, “total area covered”",
      "Process sorted endpoints while keeping an active set",
    ],
    idea: "Turn every interval into events (+1 at its start, −1 at its end), sort them, and sweep left to right while maintaining the active set: a counter, a heap or a sorted map.",
    template: `events = []
for s, e in intervals:
    events.append((s, +1))
    events.append((e, -1))
events.sort()        # (x, -1) sorts before (x, +1)
cur = best = 0
for _, delta in events:
    cur += delta
    best = max(best, cur)`,
    complexity: "O(n log n)",
    confusers: ["greedy", "two-pointers", "dp-1d", "union-find"],
    problems: [
      {
        title: "The Skyline Problem",
        difficulty: "hard",
        statement: "Given buildings as (left, right, height), output the key points of the skyline's outline.",
        why: "Sweep the x-coordinates of all building edges with a max-heap of active heights; emit a point whenever the max height changes.",
        q: {
          type: "approach",
          prompt: "When does the sweep output a key point?",
          choices: ["Whenever the current maximum active height changes", "At every left edge", "At every right edge", "Whenever the heap becomes empty"],
          explanation: "A left edge hidden behind a taller building changes nothing; emitting at every edge produces wrong extra points.",
        },
      },
      {
        title: "My Calendar III",
        difficulty: "hard",
        statement: "After each booking [start, end), return the maximum number of bookings that overlap at any moment.",
        why: "+1 / −1 events in a sorted map; the running sum's maximum is the overlap.",
        q: {
          type: "approach",
          prompt: "With half-open intervals [s, e), at equal coordinates you should process:",
          choices: ["Ends (−1) before starts (+1)", "Starts before ends", "In input order", "It never matters"],
          explanation: "[1,3) and [3,5) don't overlap; processing the start first would briefly count 2.",
        },
      },
      {
        title: "Rectangle Area II",
        difficulty: "hard",
        statement: "Return the total area covered by a set of axis-aligned rectangles, counting overlapping parts once.",
        why: "Sweep along x; between consecutive x-events, the covered length on y times the x-gap adds to the area.",
        q: {
          type: "complexity",
          prompt: "A simple sweep that re-sorts and merges active y-intervals at each event costs:",
          choices: ["O(n² log n)", "O(n)", "O(2ⁿ)", "O(log n)"],
          explanation: "2n events, each sorting up to n intervals. A segment tree over y brings it to O(n log n).",
        },
      },
    ],
  },
  {
    id: "greedy-heap",
    name: "Greedy with Regret",
    tagline: "Take greedily, undo the worst choice with a heap.",
    signals: [
      "Choose items over time under a budget or deadline, maximising count or value",
      "“If a better option shows up later, swap out an earlier one”",
      "Capital, deadlines, refuelling stops",
    ],
    idea: "Sweep in a natural order (time, capital, position) and push candidates into a heap. When a limit is exceeded, pop the worst choice so far: greedy with a way to take it back.",
    template: `courses.sort(key=lambda c: c[1])   # by deadline
heap, t = [], 0
for dur, end in courses:
    heapq.heappush(heap, -dur)
    t += dur
    if t > end:
        t += heapq.heappop(heap)        # drop the longest so far
return len(heap)`,
    complexity: "O(n log n)",
    confusers: ["intervals", "binary-search", "sliding-window", "bfs-state"],
    problems: [
      {
        title: "Course Schedule III",
        difficulty: "hard",
        statement: "Each course has a duration and a last day by which it must finish. Take as many courses as possible, one at a time.",
        why: "Sort by deadline and take every course; whenever you overshoot, drop the LONGEST course taken so far (max-heap).",
        q: {
          type: "approach",
          prompt: "Why drop the longest course taken, not the current one?",
          choices: [
            "It frees the most time while costing the same (one course)",
            "The longest course has the latest deadline",
            "The current course is always shorter",
            "To keep the heap balanced",
          ],
          explanation: "Count stays the same either way, but freeing more time can only help future courses.",
        },
      },
      {
        title: "Minimum Number of Refueling Stops",
        difficulty: "hard",
        statement: "Drive toward a target passing fuel stations. Return the fewest refuelling stops needed, or −1 if you can't make it.",
        why: "Drive as far as you can; every station passed goes into a max-heap; when you'd run dry, retroactively refuel at the biggest one passed.",
        q: {
          type: "approach",
          prompt: "You can't reach the next station and the heap is empty. You:",
          choices: ["Return −1", "Refuel at the next station anyway", "Go back to the start", "Return the stops so far"],
          explanation: "No station you've passed has fuel left to give, so the target is unreachable.",
        },
      },
      {
        title: "IPO",
        difficulty: "hard",
        statement: "Starting with capital w, complete at most k projects. Each needs a minimum capital to start and adds its profit when done. Maximise final capital.",
        why: "Sort by capital needed; each round, push every newly affordable project into a max-heap of profits and take the best.",
        q: {
          type: "complexity",
          prompt: "Time complexity with n projects?",
          choices: ["O(n log n + k log n)", "O(n · k)", "O(2ⁿ)", "O(k)"],
          explanation: "Sorting is n log n; each project enters the heap once and each of k rounds pops once.",
        },
      },
    ],
  },
  {
    id: "merge-count",
    name: "Divide & Conquer Counting",
    tagline: "Count cross pairs while merge-sorting.",
    signals: [
      "Count pairs i < j satisfying a comparison between nums[i] and nums[j]",
      "n up to 10⁵, so checking every pair is too slow",
      "Counting becomes easy once both halves are sorted",
    ],
    idea: "Merge sort; before merging two sorted halves, count the cross pairs with a moving pointer. Each level is O(n), and there are log n levels.",
    template: `def sort_count(a):
    if len(a) <= 1:
        return a, 0
    mid = len(a) // 2
    L, x = sort_count(a[:mid])
    R, y = sort_count(a[mid:])
    cnt = j = 0
    for v in L:                   # cross pairs
        while j < len(R) and v > 2 * R[j]:
            j += 1
        cnt += j
    return merge(L, R), x + y + cnt`,
    complexity: "O(n log n)",
    confusers: ["two-pointers", "binary-search", "dp-1d", "sliding-window"],
    problems: [
      {
        title: "Reverse Pairs",
        difficulty: "hard",
        statement: "Count pairs i < j with nums[i] > 2 · nums[j], for n up to 5 × 10⁴.",
        why: "Pair counting across indices → merge sort, counting cross pairs between the sorted halves with a pointer that only moves forward.",
        q: {
          type: "approach",
          prompt: "Why can the pointer j only move forward while scanning the left half?",
          choices: [
            "Both halves are sorted, so a larger left value satisfies at least as many right values",
            "j starts at the end",
            "All values are positive",
            "It can't — j resets for each left value",
          ],
          explanation: "Monotonicity on both sides turns an O(n²) cross count into O(n) per merge.",
        },
      },
      {
        title: "Count of Range Sum",
        difficulty: "hard",
        statement: "Count subarrays whose sum lies in [lower, upper]. Values may be negative.",
        why: "With prefix sums P, count pairs i < j where lower ≤ P[j] − P[i] ≤ upper: a cross-pair condition counted during a merge sort of P.",
        q: {
          type: "approach",
          prompt: "The problem is first transformed into:",
          choices: [
            "Counting pairs of prefix sums whose difference lies in [lower, upper]",
            "Finding the longest valid subarray",
            "A sliding window over nums",
            "Sorting the original array",
          ],
          explanation: "Negative values rule out a sliding window, but prefix-sum pairs are order-sensitive pairs, which is exactly what merge counting handles.",
        },
      },
      {
        title: "Count Inversions",
        difficulty: "medium",
        statement: "Count the pairs i < j with nums[i] > nums[j].",
        why: "The textbook divide and conquer: inversions = left inversions + right inversions + cross pairs found while merging.",
        q: {
          type: "trace",
          prompt: "How many inversions does [3, 1, 2] have?",
          choices: ["2", "1", "3", "0"],
          explanation: "(3, 1) and (3, 2). 1 < 2, so that pair is in order.",
        },
      },
    ],
  },
];
