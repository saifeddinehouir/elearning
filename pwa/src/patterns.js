// Built-in "LeetCode Patterns" path: 20 algorithm patterns in learning order,
// each with a recognition guide (signals / core idea / template) and a few
// representative problems. Problem statements are short paraphrases.
//
// Every problem becomes two questions in the unified deck schema:
//   1. recognition ("which pattern cracks this?") — choices are the right
//      pattern plus three look-alike patterns from `confusers`
//   2. an insight question (complexity / key step / trace) authored below
// Authored choices list the correct answer FIRST; buildPatternDeck() shuffles
// them deterministically so correct_index varies but never changes between
// installs. Pure, no DOM.

import { rngFor, seededShuffle, stableUuid } from "./random.js";

export const PATTERN_PATH = {
  key: "lc-patterns",
  name: "LeetCode Patterns",
  blurb: "20 core patterns, from hash maps to bit tricks. Learn to recognise which one a problem wants before you write a line.",
};

export const PATTERNS = [
  {
    id: "hashing",
    name: "Hash Map / Set",
    tagline: "O(1) lookups: seen-before, counts, complements.",
    signals: [
      "You keep asking “have I seen this value before?”",
      "Counting frequencies or grouping items by a shared key",
      "Pair / complement search in an unsorted array",
    ],
    idea: "Trade memory for time: remember what you've seen (values, counts, indices) in a hash map so each later lookup is O(1) instead of a rescan.",
    template: `seen = {}
for i, x in enumerate(nums):
    if target - x in seen:
        return [seen[target - x], i]
    seen[x] = i`,
    complexity: "O(n) time · O(n) space",
    confusers: ["two-pointers", "sliding-window", "prefix-sum", "heap"],
    problems: [
      {
        title: "Two Sum",
        difficulty: "easy",
        statement: "Given an unsorted array of integers and a target, return the indices of the two different elements that add up to the target.",
        why: "Unsorted input + “find the complement” → store each value's index in a map and look up target − x in O(1).",
        q: {
          type: "complexity",
          prompt: "Time and space of the one-pass hash map solution?",
          choices: ["O(n) time, O(n) space", "O(n log n) time, O(1) space", "O(n²) time, O(1) space", "O(n) time, O(1) space"],
          explanation: "Each element is visited once with O(1) expected map operations, and the map can hold up to n entries.",
        },
      },
      {
        title: "Group Anagrams",
        difficulty: "medium",
        statement: "Given a list of words, group together the words that are anagrams of each other.",
        why: "Grouping by an invariant → map from a canonical key (sorted letters or a 26-letter count) to the list of words.",
        q: {
          type: "approach",
          prompt: "What makes a correct hash key for each word?",
          choices: ["Its letters sorted (or a tuple of 26 letter counts)", "Its length", "Its first and last letter", "The sum of its character codes"],
          explanation: "Anagrams share exactly the same multiset of letters. Length or character-code sums collide for words that aren't anagrams (e.g. “ad” and “bc”).",
        },
      },
      {
        title: "Longest Consecutive Sequence",
        difficulty: "medium",
        statement: "Given an unsorted array, return the length of the longest run of consecutive integers (like 4, 5, 6, 7) in O(n) time.",
        why: "O(n) on unsorted data rules out sorting; a set lets you start counting only from numbers whose predecessor is missing.",
        q: {
          type: "approach",
          prompt: "Why does the set solution stay O(n) despite its inner while loop?",
          choices: [
            "Counting only starts at x when x − 1 is absent, so each number is walked over at most once",
            "The while loop runs at most a constant number of times",
            "Hash sets keep their elements sorted",
            "It doesn't — it is really O(n log n)",
          ],
          explanation: "Only sequence starts launch the inner loop, and each run is walked once in total, so all inner iterations add up to n.",
        },
      },
    ],
  },
  {
    id: "two-pointers",
    name: "Two Pointers",
    tagline: "Walk inward from both ends of sorted data.",
    signals: [
      "Sorted array/string and you need a pair or triplet meeting a condition",
      "Comparing from both ends (palindromes, container widths)",
      "In-place partitioning or removing elements with O(1) space",
    ],
    idea: "Put a pointer at each end (or both at the start) and move whichever one can improve the answer. Sortedness tells you which way to move, so no pair is checked twice.",
    template: `l, r = 0, len(a) - 1
while l < r:
    s = a[l] + a[r]
    if s == target: return [l, r]
    if s < target: l += 1
    else: r -= 1`,
    complexity: "O(n) time (O(n log n) if you must sort) · O(1) space",
    confusers: ["sliding-window", "binary-search", "hashing", "fast-slow"],
    problems: [
      {
        title: "Two Sum II (sorted input)",
        difficulty: "medium",
        statement: "The array is sorted ascending. Return the positions of two numbers that add up to the target, using only O(1) extra space.",
        why: "Sorted + pair sum + O(1) space → left/right pointers: sum too small, move left up; too big, move right down.",
        q: {
          type: "approach",
          prompt: "When a[l] + a[r] is smaller than the target, what do you do?",
          choices: ["Move l right — it's the only move that can increase the sum", "Move r left", "Move both pointers inward", "Reset r to l + 1"],
          explanation: "a[r] is already the largest value still available, so the only way to grow the sum is a bigger left value.",
        },
      },
      {
        title: "Container With Most Water",
        difficulty: "medium",
        statement: "Given the heights of vertical lines, pick two lines that, together with the x-axis, hold the most water. Return that area.",
        why: "Choosing a pair from both ends while width shrinks inward → two pointers, always moving the shorter line.",
        q: {
          type: "approach",
          prompt: "Why move the pointer at the shorter line?",
          choices: [
            "The area is capped by the shorter line, so keeping it while width shrinks can never beat the current area",
            "The taller line is always part of the answer",
            "To keep the array sorted",
            "It halves the search space like binary search",
          ],
          explanation: "Moving the taller line only shrinks width without raising the cap; moving the shorter one is the only chance at a bigger area.",
        },
      },
      {
        title: "3Sum",
        difficulty: "medium",
        statement: "Return all unique triplets in an array whose values sum to zero.",
        why: "Sort, fix one element, then solve the remaining pair-sum on the sorted suffix with two pointers.",
        q: {
          type: "complexity",
          prompt: "Time complexity of sort + two pointers for 3Sum?",
          choices: ["O(n²)", "O(n³)", "O(n log n)", "O(n)"],
          explanation: "Sorting is O(n log n); then for each of n fixed elements a linear two-pointer sweep runs, giving O(n²) overall.",
        },
      },
    ],
  },
  {
    id: "sliding-window",
    name: "Sliding Window",
    tagline: "Grow right, shrink left, over contiguous ranges.",
    signals: [
      "“Contiguous subarray / substring”",
      "“Longest / shortest / at most K …”",
      "The window's validity can be updated as one element enters or leaves",
    ],
    idea: "Extend the right edge; when the window becomes invalid, shrink from the left until it's valid again. Each element enters and leaves once, so it's linear.",
    template: `l = 0
for r, x in enumerate(s):
    add(x)
    while window_invalid():
        remove(s[l]); l += 1
    best = max(best, r - l + 1)`,
    complexity: "O(n) time · O(k) space for the window's contents",
    confusers: ["two-pointers", "prefix-sum", "dp-1d", "hashing"],
    problems: [
      {
        title: "Longest Substring Without Repeating Characters",
        difficulty: "medium",
        statement: "Return the length of the longest substring that contains no repeated characters.",
        why: "Longest contiguous substring under a constraint you can maintain incrementally → variable-size window with a set or last-seen map.",
        q: {
          type: "trace",
          prompt: "For the input \"abcabcbb\", what is the answer?",
          choices: ["3", "2", "4", "8"],
          explanation: "“abc” has length 3; the next “a” repeats, so the window must shrink, and no window ever gets past 3.",
        },
      },
      {
        title: "Minimum Size Subarray Sum",
        difficulty: "medium",
        statement: "Given an array of positive integers and a target, return the smallest length of a contiguous subarray whose sum is at least the target.",
        why: "Positive values mean the sum grows when you extend and drops when you trim: exactly the monotonic behaviour a window needs.",
        q: {
          type: "approach",
          prompt: "Why does this window approach break if negative numbers are allowed?",
          choices: [
            "Trimming from the left no longer guarantees the sum goes down, so validity isn't monotonic",
            "Windows can't store negative values",
            "It would need O(n²) memory",
            "It doesn't break",
          ],
          explanation: "With negatives, dropping an element can raise the sum. Use prefix sums (plus a monotonic deque) instead.",
        },
      },
      {
        title: "Permutation in String",
        difficulty: "medium",
        statement: "Return true if string s2 contains a substring that is a rearrangement of string s1.",
        why: "A fixed-size window (length of s1) slides across s2 while you compare letter counts.",
        q: {
          type: "complexity",
          prompt: "With |s1| = m and |s2| = n, what's the time of the count-comparison window?",
          choices: ["O(n)", "O(n · m)", "O(n log n)", "O(m²)"],
          explanation: "Each slide updates two counts and compares 26 entries: O(26 · n) = O(n).",
        },
      },
    ],
  },
  {
    id: "prefix-sum",
    name: "Prefix Sum",
    tagline: "Range sums become one subtraction.",
    signals: [
      "Many range-sum queries on data that doesn't change",
      "Count subarrays with sum = K when negatives are allowed",
      "“sum of i..j” = P[j + 1] − P[i]",
    ],
    idea: "Precompute running totals so any range sum is a subtraction. Pair it with a hash map of earlier prefix sums to count subarrays that hit a target in one pass.",
    template: `count, run = 0, 0
seen = {0: 1}
for x in nums:
    run += x
    count += seen.get(run - k, 0)
    seen[run] = seen.get(run, 0) + 1`,
    complexity: "O(n) build · O(1) per range query",
    confusers: ["sliding-window", "hashing", "dp-1d", "two-pointers"],
    problems: [
      {
        title: "Subarray Sum Equals K",
        difficulty: "medium",
        statement: "Count the contiguous subarrays whose sum equals k. Values may be negative.",
        why: "Negatives rule out a sliding window; sum(i..j) = k ⇔ P[j] − P[i − 1] = k, so count earlier prefix sums equal to run − k.",
        q: {
          type: "approach",
          prompt: "Why is the map initialised with {0: 1}?",
          choices: [
            "So subarrays starting at index 0 are counted — their “previous prefix” is the empty sum 0",
            "To avoid dividing by zero",
            "Because k is never 0",
            "It's only an optimisation",
          ],
          explanation: "If the running sum itself equals k, the subarray is the whole prefix, and it needs the empty prefix (sum 0) on record.",
        },
      },
      {
        title: "Range Sum Query (immutable)",
        difficulty: "easy",
        statement: "Design a structure that answers many sumRange(i, j) queries on a fixed array.",
        why: "Many range queries on static data → O(n) precompute, then O(1) per query.",
        q: {
          type: "fill_blank",
          prompt: "With P[0] = 0 and P[i + 1] = P[i] + a[i], sumRange(i, j) = ______",
          choices: ["P[j + 1] − P[i]", "P[j] − P[i]", "P[j + 1] − P[i + 1]", "P[j] + P[i]"],
          explanation: "P[j + 1] holds a[0..j] and P[i] holds a[0..i − 1]; subtracting leaves exactly a[i..j].",
        },
      },
      {
        title: "Product of Array Except Self",
        difficulty: "medium",
        statement: "Return an array where output[i] is the product of every element except nums[i], without using division, in O(n).",
        why: "Prefix products from the left times suffix products from the right: the prefix idea applied to multiplication.",
        q: {
          type: "complexity",
          prompt: "Extra space of the optimal solution (not counting the output array)?",
          choices: ["O(1)", "O(n)", "O(log n)", "O(n²)"],
          explanation: "Write prefix products into the output, then sweep backwards multiplying by a single running suffix variable.",
        },
      },
    ],
  },
  {
    id: "stack",
    name: "Stack / Monotonic Stack",
    tagline: "Most-recent-first, and “next greater element”.",
    signals: [
      "Matching or nesting (brackets, tags, undo)",
      "“Next greater / smaller element”, “days until warmer”",
      "Evaluating expressions, processing the most recent item first",
    ],
    idea: "A stack holds unresolved items, most recent on top. Keep it monotonic (e.g. decreasing) and each new element pops, and resolves, everything it beats.",
    template: `stack = []  # indices; values decreasing
for i, x in enumerate(a):
    while stack and a[stack[-1]] < x:
        j = stack.pop()
        ans[j] = i - j   # next greater found
    stack.append(i)`,
    complexity: "O(n) time — each index is pushed and popped once · O(n) space",
    confusers: ["heap", "two-pointers", "sliding-window", "dp-1d"],
    problems: [
      {
        title: "Valid Parentheses",
        difficulty: "easy",
        statement: "Given a string of ()[]{} characters, decide whether every bracket is closed by the right type in the right order.",
        why: "The most recent open bracket must close first: LIFO → stack.",
        q: {
          type: "trace",
          prompt: "Processing \"([{\" and then \"}\", what's left on the stack?",
          choices: ["( [", "(", "{", "Nothing"],
          explanation: "Push (, [, { — then } matches the top {, which is popped, leaving ( and [.",
        },
      },
      {
        title: "Daily Temperatures",
        difficulty: "medium",
        statement: "For each day's temperature, return how many days you'd wait for a warmer one (0 if it never comes).",
        why: "“Next greater element” for every index → monotonic decreasing stack of still-unresolved days.",
        q: {
          type: "complexity",
          prompt: "Time complexity with the monotonic stack?",
          choices: ["O(n)", "O(n²)", "O(n log n)", "O(n · k)"],
          explanation: "Each index is pushed once and popped at most once, so total work is linear.",
        },
      },
      {
        title: "Largest Rectangle in Histogram",
        difficulty: "hard",
        statement: "Given bar heights of a histogram, return the area of the largest rectangle that fits under it.",
        why: "Each bar needs its nearest shorter bar on both sides → monotonic increasing stack.",
        q: {
          type: "approach",
          prompt: "When a bar is popped from the increasing stack at index i, how wide is its rectangle?",
          choices: [
            "From the new stack top + 1 to i − 1 (or 0 to i − 1 if the stack is empty)",
            "Exactly 1",
            "From 0 to i",
            "Until the next taller bar",
          ],
          explanation: "The bar at i is the first shorter one on the right; the new top is the nearest shorter one on the left.",
        },
      },
    ],
  },
  {
    id: "binary-search",
    name: "Binary Search",
    tagline: "Halve a monotonic search space.",
    signals: [
      "Sorted (or rotated sorted) input",
      "“Minimum X such that …” where feasibility is monotonic",
      "Required O(log n), or a huge numeric answer range",
    ],
    idea: "Keep a range that must contain the answer and halve it each step. It works on any monotonic yes/no predicate, not just arrays: that's “binary search on the answer”.",
    template: `lo, hi = low_bound, high_bound
while lo < hi:
    mid = (lo + hi) // 2
    if feasible(mid): hi = mid
    else: lo = mid + 1
return lo`,
    complexity: "O(log n) steps × cost of the check",
    confusers: ["two-pointers", "sliding-window", "greedy", "heap"],
    problems: [
      {
        title: "Search in Rotated Sorted Array",
        difficulty: "medium",
        statement: "A sorted array of distinct values was rotated at an unknown pivot. Find a target's index in O(log n).",
        why: "O(log n) + (rotated) sorted → binary search; one half is always sorted, so check whether the target lies in it.",
        q: {
          type: "approach",
          prompt: "At each step, what lets you discard half the array?",
          choices: [
            "One of [lo..mid] or [mid..hi] is always sorted, so you can test whether the target falls inside it",
            "The pivot is always in the middle",
            "The left half is always larger",
            "You first find the maximum with a linear scan",
          ],
          explanation: "Compare a[lo] with a[mid] to find the sorted half, then check if target is within its range.",
        },
      },
      {
        title: "Capacity To Ship Packages Within D Days",
        difficulty: "medium",
        statement: "Packages must ship in their given order within D days. Find the minimum ship capacity that makes this possible.",
        why: "“Minimum capacity that works” with monotonic feasibility → binary search on the answer plus a greedy check.",
        q: {
          type: "approach",
          prompt: "What are the right search bounds for the capacity?",
          choices: ["lo = max(weights), hi = sum(weights)", "lo = 0, hi = D", "lo = min(weights), hi = max(weights)", "lo = 1, hi = len(weights)"],
          explanation: "The ship must carry the heaviest package, and capacity = total weight always works in one day.",
        },
      },
      {
        title: "First and Last Position of a Target",
        difficulty: "medium",
        statement: "In a sorted array that may contain duplicates, return the first and last index of a target in O(log n).",
        why: "Sorted + O(log n) + boundaries → two lower-bound style binary searches.",
        q: {
          type: "trace",
          prompt: "Searching for the FIRST occurrence, when a[mid] == target you should:",
          choices: ["Record mid and keep searching the left half", "Return mid immediately", "Search the right half", "Scan left from mid one by one"],
          explanation: "An equal value might not be the first, so shrink right while remembering the candidate. A linear scan would break O(log n).",
        },
      },
    ],
  },
  {
    id: "fast-slow",
    name: "Fast & Slow Pointers",
    tagline: "Tortoise and hare on lists and cycles.",
    signals: [
      "Linked-list cycle, or a cycle's entrance",
      "Middle / k-th from the end in one pass",
      "A number sequence that might loop (happy number, duplicate finder)",
    ],
    idea: "Move one pointer twice as fast as the other. If there's a cycle they meet; when fast reaches the end, slow is at the middle.",
    template: `slow = fast = head
while fast and fast.next:
    slow = slow.next
    fast = fast.next.next
    if slow is fast:
        return True   # cycle
return False`,
    complexity: "O(n) time · O(1) space",
    confusers: ["two-pointers", "hashing", "tree-dfs", "stack"],
    problems: [
      {
        title: "Linked List Cycle",
        difficulty: "easy",
        statement: "Decide whether a singly linked list contains a cycle, using O(1) memory.",
        why: "Cycle detection in O(1) space → Floyd's tortoise and hare.",
        q: {
          type: "complexity",
          prompt: "Space used by Floyd's algorithm vs. a “visited set” approach?",
          choices: ["O(1) vs O(n)", "O(n) vs O(1)", "Both O(1)", "Both O(n)"],
          explanation: "Floyd's needs two pointers; a visited set may store every node.",
        },
      },
      {
        title: "Middle of the Linked List",
        difficulty: "easy",
        statement: "Return the middle node of a singly linked list (the second middle if the length is even) in one pass.",
        why: "One pass + middle → when fast reaches the end, slow is halfway.",
        q: {
          type: "trace",
          prompt: "For 1→2→3→4→5→6, which node is slow on when the loop stops?",
          choices: ["4", "3", "5", "6"],
          explanation: "slow/fast: (1,1) → (2,3) → (3,5) → (4, end). Slow lands on 4, the second middle.",
        },
      },
      {
        title: "Find the Duplicate Number",
        difficulty: "medium",
        statement: "An array of n + 1 integers, each in [1, n], has one repeated value. Find it without modifying the array and with O(1) extra space.",
        why: "Treat i → nums[i] as a linked list; the duplicate is where the cycle starts → Floyd's again.",
        q: {
          type: "approach",
          prompt: "After slow and fast meet, how do you find the cycle's entrance?",
          choices: [
            "Reset one pointer to the start, move both one step at a time; they meet at the entrance",
            "The meeting point is the entrance",
            "Move fast three steps at a time",
            "Measure the cycle length and halve it",
          ],
          explanation: "The distance from the start to the entrance equals the distance from the meeting point to the entrance (mod cycle length).",
        },
      },
    ],
  },
  {
    id: "tree-dfs",
    name: "Tree DFS",
    tagline: "Recursion that combines answers from subtrees.",
    signals: [
      "A node's answer depends on its subtrees (height, sum, balance)",
      "Root-to-leaf paths",
      "Validating or comparing tree structure",
    ],
    idea: "Write a recursive function that returns what the parent needs from each subtree. Combine the children's results at the node (post-order), or pass constraints down (pre-order).",
    template: `def dfs(node):
    if not node:
        return 0
    left = dfs(node.left)
    right = dfs(node.right)
    return 1 + max(left, right)   # combine`,
    complexity: "O(n) time · O(h) call-stack space",
    confusers: ["tree-bfs", "backtracking", "dp-1d", "graph"],
    problems: [
      {
        title: "Maximum Depth of Binary Tree",
        difficulty: "easy",
        statement: "Return the number of nodes on the longest root-to-leaf path.",
        why: "depth(node) = 1 + max(depth(left), depth(right)): a post-order DFS.",
        q: {
          type: "complexity",
          prompt: "Space complexity of the recursive DFS on a tree of height h?",
          choices: ["O(h) — the call stack", "O(1)", "O(n²)", "Always O(log n)"],
          explanation: "One frame per level on the current path. For a skewed tree h = n; for a balanced one h = log n.",
        },
      },
      {
        title: "Validate Binary Search Tree",
        difficulty: "medium",
        statement: "Decide whether a binary tree is a valid binary search tree.",
        why: "Every node must sit within (low, high) bounds inherited from its ancestors → DFS that passes bounds down.",
        q: {
          type: "approach",
          prompt: "Why isn't checking left.val < node.val < right.val at every node enough?",
          choices: [
            "A deeper node can break an ancestor's bound, e.g. a small value deep in the root's right subtree",
            "It is enough",
            "Because BSTs may contain duplicates",
            "Because that check is O(n²)",
          ],
          explanation: "BST order is global: everything in the right subtree must exceed the root, not just the direct child.",
        },
      },
      {
        title: "Binary Tree Maximum Path Sum",
        difficulty: "hard",
        statement: "Return the maximum sum of any path between two nodes in a binary tree whose values may be negative.",
        why: "Each node combines the best downward gains from both children: post-order DFS that returns one branch but records both.",
        q: {
          type: "approach",
          prompt: "What does the recursive helper return to its parent?",
          choices: [
            "node.val + max(left gain, right gain, 0): a single downward branch",
            "node.val + left gain + right gain",
            "The best path anywhere in the subtree",
            "The number of nodes in the subtree",
          ],
          explanation: "A parent can only extend one branch. The two-branch sum through the node updates a global best instead.",
        },
      },
    ],
  },
  {
    id: "tree-bfs",
    name: "Tree BFS",
    tagline: "Queue-driven, level by level.",
    signals: [
      "“Level by level”, “each depth”, “right side view”",
      "Minimum depth / fewest steps from the root",
      "Connecting or zig-zagging nodes on the same level",
    ],
    idea: "Use a queue and process exactly len(queue) nodes per round, so each round handles one level.",
    template: `q = deque([root])
while q:
    level = []
    for _ in range(len(q)):
        node = q.popleft()
        level.append(node.val)
        if node.left: q.append(node.left)
        if node.right: q.append(node.right)
    out.append(level)`,
    complexity: "O(n) time · O(width) space",
    confusers: ["tree-dfs", "graph", "heap", "stack"],
    problems: [
      {
        title: "Binary Tree Level Order Traversal",
        difficulty: "medium",
        statement: "Return the tree's values grouped level by level, left to right.",
        why: "Literally “level by level” → BFS with one queue batch per level.",
        q: {
          type: "approach",
          prompt: "Why capture len(queue) before the inner loop?",
          choices: [
            "So the round processes only the current level, not children appended during it",
            "To avoid an infinite loop on an empty tree",
            "Because the deque loses its length after popleft",
            "It's only a speed-up",
          ],
          explanation: "Children are appended during the round; fixing the count first keeps levels separate.",
        },
      },
      {
        title: "Binary Tree Right Side View",
        difficulty: "medium",
        statement: "Return the values visible when looking at the tree from its right side, top to bottom.",
        why: "One value per level (the rightmost) → BFS by level.",
        q: {
          type: "approach",
          prompt: "In each BFS level (left-to-right order), which node do you record?",
          choices: ["The last node processed", "The first node processed", "The largest value", "The node with no children"],
          explanation: "Processing left to right, the last node of a level is the rightmost one, which is what's visible.",
        },
      },
      {
        title: "Minimum Depth of Binary Tree",
        difficulty: "easy",
        statement: "Return the number of nodes on the shortest path from the root down to the nearest leaf.",
        why: "Nearest leaf from the root → BFS stops at the first leaf without exploring deeper levels.",
        q: {
          type: "approach",
          prompt: "Why is BFS often faster than DFS here?",
          choices: [
            "It stops at the first leaf it meets, which is at the minimum depth",
            "BFS always uses less memory",
            "DFS can't compute a minimum depth",
            "BFS visits nodes in sorted order",
          ],
          explanation: "DFS may dive down a very deep branch first; BFS reaches shallow leaves before anything deeper.",
        },
      },
    ],
  },
  {
    id: "heap",
    name: "Heap / Top-K",
    tagline: "Always know the current min or max.",
    signals: [
      "“K largest / smallest / most frequent”, “k-th element”",
      "You repeatedly need the current min/max while data changes",
      "Merging K sorted lists or streams; running median",
    ],
    idea: "A heap gives O(log n) push/pop of the minimum (or maximum). For top-K, keep a heap of size K: its root is the weakest of your current best K.",
    template: `heap = []
for x in nums:
    heapq.heappush(heap, x)
    if len(heap) > k:
        heapq.heappop(heap)   # drop the smallest
return heap[0]                # k-th largest`,
    complexity: "O(n log k) time · O(k) space",
    confusers: ["binary-search", "stack", "greedy", "intervals"],
    problems: [
      {
        title: "Kth Largest Element in an Array",
        difficulty: "medium",
        statement: "Return the k-th largest element of an unsorted array.",
        why: "“K-th largest” → a min-heap of size k (or quickselect).",
        q: {
          type: "complexity",
          prompt: "Time complexity of the size-k min-heap approach?",
          choices: ["O(n log k)", "O(k log n)", "O(n · k)", "O(log n)"],
          explanation: "n pushes/pops on a heap that never exceeds k elements, each O(log k).",
        },
      },
      {
        title: "Merge K Sorted Lists",
        difficulty: "hard",
        statement: "Merge k sorted linked lists into one sorted list.",
        why: "You always need the smallest current head among k lists → min-heap of heads.",
        q: {
          type: "complexity",
          prompt: "With N nodes in total, what's the time using a heap of list heads?",
          choices: ["O(N log k)", "O(N · k)", "O(N log N)", "O(k log N)"],
          explanation: "Each of N nodes is pushed and popped once from a heap holding at most k heads.",
        },
      },
      {
        title: "Find Median from Data Stream",
        difficulty: "hard",
        statement: "Support adding numbers one by one and returning the median of everything added so far.",
        why: "The middle of a changing set → two heaps: a max-heap for the lower half, a min-heap for the upper half.",
        q: {
          type: "approach",
          prompt: "Which invariant do the two heaps maintain?",
          choices: [
            "Everything in the lower max-heap ≤ everything in the upper min-heap, and their sizes differ by at most 1",
            "Both heaps hold the same values",
            "The max-heap holds even numbers, the min-heap odd ones",
            "The min-heap is always larger",
          ],
          explanation: "Then the median is one heap's top, or the average of both tops when sizes are equal.",
        },
      },
    ],
  },
  {
    id: "intervals",
    name: "Intervals",
    tagline: "Sort by an endpoint, then sweep.",
    signals: [
      "Input is a list of [start, end] pairs",
      "Overlaps, merging, inserting, finding free time",
      "Minimum rooms / arrows / removals",
    ],
    idea: "Sort by start (or end), then sweep once, comparing each interval with the last merged one. Two intervals overlap when a.start ≤ b.end and b.start ≤ a.end.",
    template: `intervals.sort(key=lambda x: x[0])
merged = [intervals[0]]
for s, e in intervals[1:]:
    if s <= merged[-1][1]:
        merged[-1][1] = max(merged[-1][1], e)
    else:
        merged.append([s, e])`,
    complexity: "O(n log n) time (the sort) · O(n) space",
    confusers: ["greedy", "heap", "two-pointers", "prefix-sum"],
    problems: [
      {
        title: "Merge Intervals",
        difficulty: "medium",
        statement: "Given a list of intervals, merge all the overlapping ones and return the result.",
        why: "[start, end] pairs + overlap → sort by start and sweep.",
        q: {
          type: "trace",
          prompt: "Merging [[1,3],[2,6],[8,10],[15,18]] gives:",
          choices: ["[[1,6],[8,10],[15,18]]", "[[1,10],[15,18]]", "[[1,3],[2,6],[8,18]]", "[[1,18]]"],
          explanation: "[1,3] and [2,6] overlap into [1,6]; 8 > 6 starts a new interval; 15 > 10 starts another.",
        },
      },
      {
        title: "Meeting Rooms II",
        difficulty: "medium",
        statement: "Given meeting time intervals, return the minimum number of rooms required.",
        why: "Max number of simultaneous overlaps → sort by start and keep a min-heap of end times (or sweep start/end events).",
        q: {
          type: "approach",
          prompt: "In the min-heap solution, what does the heap hold?",
          choices: ["End times of meetings currently occupying a room", "Start times of every meeting", "Meeting durations", "Room numbers"],
          explanation: "If the earliest end ≤ the new start, that room frees up (pop); the heap's final size is the answer.",
        },
      },
      {
        title: "Non-overlapping Intervals",
        difficulty: "medium",
        statement: "Return the minimum number of intervals to remove so that the rest don't overlap.",
        why: "Classic interval scheduling: sort by end time and greedily keep whichever interval finishes first.",
        q: {
          type: "approach",
          prompt: "Why sort by END time rather than start time?",
          choices: [
            "Keeping the interval that finishes first leaves the most room for the rest",
            "Start times can tie",
            "It's needed for a later binary search",
            "Sorting by start would be just as optimal",
          ],
          explanation: "An early-starting interval can be very long and block many others; earliest finish is provably optimal.",
        },
      },
    ],
  },
  {
    id: "backtracking",
    name: "Backtracking",
    tagline: "Choose, explore, un-choose.",
    signals: [
      "“Return ALL combinations / permutations / subsets / partitions”",
      "Placing items under constraints (N-Queens, Sudoku)",
      "Small n (≈ 20 or less) with exponential output",
    ],
    idea: "Build a solution one choice at a time, recurse, then undo the choice. Prune any branch that can't lead to a valid answer.",
    template: `def bt(start, path):
    out.append(path[:])
    for i in range(start, len(nums)):
        path.append(nums[i])
        bt(i + 1, path)
        path.pop()          # undo the choice
bt(0, [])`,
    complexity: "Exponential: O(2ⁿ) subsets, O(n!) permutations",
    confusers: ["dp-1d", "tree-dfs", "greedy", "graph"],
    problems: [
      {
        title: "Subsets",
        difficulty: "medium",
        statement: "Return every possible subset of a list of distinct integers.",
        why: "“All subsets” → exponential output, enumerated with choose/skip backtracking.",
        q: {
          type: "complexity",
          prompt: "How many subsets does a set of n elements have?",
          choices: ["2ⁿ", "n!", "n²", "2n"],
          explanation: "Each element is either in or out: two choices, n times.",
        },
      },
      {
        title: "Combination Sum",
        difficulty: "medium",
        statement: "Given distinct candidates and a target, return all unique combinations summing to the target. A number may be used more than once.",
        why: "Enumerate combinations under a sum constraint → backtracking that prunes once the running sum passes the target.",
        q: {
          type: "approach",
          prompt: "How do you allow reuse while avoiding duplicates like [2,3] and [3,2]?",
          choices: [
            "Recurse with the same index i (not i + 1) and never go back to earlier indices",
            "Sort every result and dedupe at the end",
            "Keep a set of numbers already used",
            "Restart the loop from index 0 on every call",
          ],
          explanation: "Moving forward only fixes an order (non-decreasing indices), so each combination appears once; staying at i allows reuse.",
        },
      },
      {
        title: "N-Queens",
        difficulty: "hard",
        statement: "Return every way to place n queens on an n×n board so that no two attack each other.",
        why: "Place under constraints row by row, undoing on conflict: textbook backtracking.",
        q: {
          type: "approach",
          prompt: "Which sets let you check whether a square is safe in O(1)?",
          choices: [
            "Used columns, used (row − col) diagonals, used (row + col) anti-diagonals",
            "Used rows and used columns",
            "A visited matrix you scan each time",
            "Prefix sums for each row",
          ],
          explanation: "Placing one queen per row covers rows; squares on the same diagonal share row − col, anti-diagonals share row + col.",
        },
      },
    ],
  },
  {
    id: "graph",
    name: "Graph BFS / DFS",
    tagline: "Grids, islands, reachability, shortest hops.",
    signals: [
      "A grid of cells (islands, flood fill, rotting oranges)",
      "Nodes + edges: connectivity, “can I reach …”",
      "Shortest path in an unweighted graph → BFS",
    ],
    idea: "Treat cells or entities as nodes, mark what you've visited, and explore neighbours with DFS (connectivity) or BFS (shortest unweighted distance, multi-source spread).",
    template: `def dfs(r, c):
    if not (0 <= r < R and 0 <= c < C) or grid[r][c] != "1":
        return
    grid[r][c] = "#"            # mark visited
    for dr, dc in ((1,0), (-1,0), (0,1), (0,-1)):
        dfs(r + dr, c + dc)`,
    complexity: "O(V + E) — O(R·C) on a grid",
    confusers: ["tree-bfs", "union-find", "dp-2d", "backtracking"],
    problems: [
      {
        title: "Number of Islands",
        difficulty: "medium",
        statement: "Given a grid of '1' (land) and '0' (water), count the islands of 4-directionally connected land.",
        why: "Counting connected regions in a grid → flood fill (DFS/BFS) from each unvisited land cell.",
        q: {
          type: "complexity",
          prompt: "Time complexity on an R×C grid?",
          choices: ["O(R·C)", "O((R·C)²)", "O(R + C)", "O(R·C·log(R·C))"],
          explanation: "Every cell is visited a constant number of times across all flood fills.",
        },
      },
      {
        title: "Rotting Oranges",
        difficulty: "medium",
        statement: "Every minute, fresh oranges next to rotten ones become rotten. Return the minutes until no fresh orange remains, or −1 if impossible.",
        why: "Spreading from many sources at once, minute by minute → multi-source BFS by levels.",
        q: {
          type: "approach",
          prompt: "Why seed the BFS queue with ALL rotten oranges at once?",
          choices: [
            "They spread simultaneously, so each BFS level is one minute for every source",
            "To save memory",
            "Because DFS can't handle grids",
            "Order doesn't matter; it's just simpler",
          ],
          explanation: "Running BFS from each source separately would over-count minutes; one shared frontier models time correctly.",
        },
      },
      {
        title: "Clone Graph",
        difficulty: "medium",
        statement: "Given one node of a connected undirected graph, return a deep copy of the whole graph.",
        why: "Visit every node once, mapping originals to copies → DFS/BFS with a visited map.",
        q: {
          type: "approach",
          prompt: "What prevents infinite loops when the graph has cycles?",
          choices: [
            "A map from original node to its clone, checked before recursing",
            "Limiting recursion depth",
            "Sorting the neighbours first",
            "Deleting edges after copying them",
          ],
          explanation: "The map doubles as the visited set: if a node already has a clone, reuse it instead of recursing.",
        },
      },
    ],
  },
  {
    id: "topo-sort",
    name: "Topological Sort",
    tagline: "Order tasks that depend on each other.",
    signals: [
      "Prerequisites, dependencies, build order",
      "A directed graph: “is there a valid order?” / “is there a cycle?”",
      "Course schedule, alien dictionary, task scheduling",
    ],
    idea: "Count in-degrees, then repeatedly take nodes with in-degree 0 (Kahn's algorithm). If you can't take every node, there's a cycle.",
    template: `indeg = {u: 0 for u in nodes}
for u, v in edges: indeg[v] += 1
q = deque(u for u in nodes if indeg[u] == 0)
order = []
while q:
    u = q.popleft(); order.append(u)
    for v in adj[u]:
        indeg[v] -= 1
        if indeg[v] == 0: q.append(v)
# len(order) < len(nodes)  →  cycle`,
    complexity: "O(V + E) time · O(V + E) space",
    confusers: ["graph", "union-find", "tree-bfs", "dp-1d"],
    problems: [
      {
        title: "Course Schedule",
        difficulty: "medium",
        statement: "Given n courses and a list of prerequisite pairs, decide whether it's possible to finish every course.",
        why: "Prerequisites are directed edges; finishing all ⇔ no cycle ⇔ a topological order exists.",
        q: {
          type: "approach",
          prompt: "In Kahn's algorithm, how do you know there's a cycle?",
          choices: [
            "Fewer than n nodes were output by the time the queue runs empty",
            "Some node has an in-degree greater than 1",
            "There are more edges than nodes",
            "The first node has no outgoing edges",
          ],
          explanation: "Nodes on a cycle never reach in-degree 0, so they're never output.",
        },
      },
      {
        title: "Course Schedule II",
        difficulty: "medium",
        statement: "Return one valid order in which to take all n courses, or an empty list if it's impossible.",
        why: "You need an actual dependency order → the output of a topological sort.",
        q: {
          type: "complexity",
          prompt: "Time complexity with V courses and E prerequisites?",
          choices: ["O(V + E)", "O(V · E)", "O(V²)", "O(E log V)"],
          explanation: "Each node is enqueued once and each edge decremented once.",
        },
      },
      {
        title: "Alien Dictionary",
        difficulty: "hard",
        statement: "Given words sorted in an unknown alphabet, return a possible ordering of its letters.",
        why: "Adjacent words reveal “letter a comes before b” edges → build the graph and sort it topologically.",
        q: {
          type: "trace",
          prompt: "From the adjacent words \"wrt\" and \"wrf\", which edge do you learn?",
          choices: ["t → f", "w → r", "f → t", "None — they share a prefix"],
          explanation: "Only the first differing letter carries information: t comes before f.",
        },
      },
    ],
  },
  {
    id: "union-find",
    name: "Union-Find",
    tagline: "Merge groups, ask “already connected?”.",
    signals: [
      "Connectivity questions as edges arrive one at a time",
      "Counting components or groups (provinces, merged accounts)",
      "An extra edge that creates a cycle in an undirected graph",
    ],
    idea: "Each element points to a parent; find(x) climbs to the root (compressing the path), union joins two roots. Each operation is nearly O(1).",
    template: `parent = list(range(n))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]  # path compression
        x = parent[x]
    return x
def union(a, b):
    ra, rb = find(a), find(b)
    if ra == rb: return False          # already connected
    parent[ra] = rb
    return True`,
    complexity: "≈ O(α(n)) per operation — effectively constant",
    confusers: ["graph", "topo-sort", "hashing", "tree-dfs"],
    problems: [
      {
        title: "Redundant Connection",
        difficulty: "medium",
        statement: "A tree had one extra edge added. Return the edge that can be removed to make it a tree again.",
        why: "Add edges one by one and ask “already connected?” → union-find; the first union that fails is the answer.",
        q: {
          type: "approach",
          prompt: "What identifies the redundant edge?",
          choices: [
            "union(u, v) finds that u and v already share a root",
            "u has degree 3",
            "find(u) returns u",
            "It's the last edge in the input",
          ],
          explanation: "If both endpoints are already connected, adding the edge closes a cycle.",
        },
      },
      {
        title: "Number of Connected Components",
        difficulty: "medium",
        statement: "Given n nodes and a list of undirected edges, return the number of connected components.",
        why: "Start with n components and subtract one for every union that actually merges two groups.",
        q: {
          type: "trace",
          prompt: "n = 5, edges [[0,1],[1,2],[3,4]]: how many components?",
          choices: ["2", "3", "1", "5"],
          explanation: "{0,1,2} and {3,4}: 5 − 3 successful unions = 2.",
        },
      },
      {
        title: "Accounts Merge",
        difficulty: "medium",
        statement: "Merge user accounts that share any email address, and return each person's full list of emails.",
        why: "Grouping items linked transitively by shared keys → union emails into sets.",
        q: {
          type: "complexity",
          prompt: "With path compression and union by rank, the amortised cost per operation is:",
          choices: ["Nearly O(1): O(α(n)), the inverse Ackermann function", "O(log n), always", "O(n)", "Exactly O(1), no amortisation"],
          explanation: "α(n) is at most 4 for any realistic n, so it's effectively constant, but only amortised.",
        },
      },
    ],
  },
  {
    id: "dp-1d",
    name: "1-D Dynamic Programming",
    tagline: "Each answer builds on a few previous ones.",
    signals: [
      "“Number of ways”, “min / max cost”, “can you reach …”",
      "The choice at each step depends on a few earlier results",
      "The naive recursion recomputes the same subproblems",
    ],
    idea: "Define dp[i] as the answer for the prefix ending at i, derive the recurrence from the last decision, set base cases, and fill left to right. Often only the last one or two values are needed.",
    template: `# House Robber
prev2, prev1 = 0, 0
for x in nums:
    prev2, prev1 = prev1, max(prev1, prev2 + x)
return prev1`,
    complexity: "O(n) states × O(choices) · O(1)–O(n) space",
    confusers: ["greedy", "backtracking", "sliding-window", "prefix-sum"],
    problems: [
      {
        title: "Climbing Stairs",
        difficulty: "easy",
        statement: "You can climb 1 or 2 steps at a time. In how many distinct ways can you reach step n?",
        why: "“Number of ways” where step n depends on n − 1 and n − 2 → 1-D DP (it's Fibonacci).",
        q: {
          type: "fill_blank",
          prompt: "ways(n) = ______",
          choices: ["ways(n − 1) + ways(n − 2)", "2 · ways(n − 1)", "ways(n − 1) + 1", "n · ways(n − 2)"],
          explanation: "Your last move was either a 1-step (from n − 1) or a 2-step (from n − 2).",
        },
      },
      {
        title: "House Robber",
        difficulty: "medium",
        statement: "Houses in a row each hold some money; you can't rob two adjacent houses. Maximise the total you rob.",
        why: "At each house: rob it (+ best from two back) or skip it (best from one back) → dp[i] = max(dp[i − 1], dp[i − 2] + nums[i]).",
        q: {
          type: "approach",
          prompt: "Why doesn't greedily robbing the richest houses work?",
          choices: [
            "Taking a rich house can block two neighbours worth more together, e.g. [3, 4, 3]",
            "Greedy would be O(n²)",
            "Greedy works; DP is just faster",
            "House values can be negative",
          ],
          explanation: "Greedy takes 4 and is stuck at 4; robbing both 3s gives 6.",
        },
      },
      {
        title: "Coin Change",
        difficulty: "medium",
        statement: "Given coin denominations and an amount, return the fewest coins that make up that amount, or −1.",
        why: "dp[a] depends on dp[a − coin] for each coin → unbounded-knapsack style 1-D DP.",
        q: {
          type: "complexity",
          prompt: "Time complexity with A = amount and C = number of coin types?",
          choices: ["O(A · C)", "O(A + C)", "O(C^A)", "O(A log C)"],
          explanation: "A states, each trying C coins. O(C^A) is the naive recursion this avoids.",
        },
      },
    ],
  },
  {
    id: "dp-2d",
    name: "2-D Dynamic Programming",
    tagline: "Tables over two strings, or a grid.",
    signals: [
      "Comparing two strings or sequences (LCS, edit distance)",
      "Grid paths moving only right / down",
      "State needs two indices: (i, j) or (item, capacity)",
    ],
    idea: "dp[i][j] is the answer for prefixes a[:i] and b[:j] (or for grid cell (i, j)). Derive it from neighbours dp[i−1][j], dp[i][j−1] and dp[i−1][j−1].",
    template: `dp = [[0] * (m + 1) for _ in range(n + 1)]
for i in range(1, n + 1):
    for j in range(1, m + 1):
        if a[i-1] == b[j-1]:
            dp[i][j] = dp[i-1][j-1] + 1
        else:
            dp[i][j] = max(dp[i-1][j], dp[i][j-1])`,
    complexity: "O(n·m) time · O(n·m) space, often reducible to one row",
    confusers: ["dp-1d", "graph", "backtracking", "two-pointers"],
    problems: [
      {
        title: "Unique Paths",
        difficulty: "medium",
        statement: "A robot on an m×n grid moves only right or down. How many paths lead from the top-left to the bottom-right corner?",
        why: "Grid + right/down moves → dp[i][j] = dp[i − 1][j] + dp[i][j − 1].",
        q: {
          type: "trace",
          prompt: "How many unique paths are there in a 3×3 grid?",
          choices: ["6", "9", "4", "8"],
          explanation: "You make 2 rights and 2 downs in some order: C(4, 2) = 6. The table agrees.",
        },
      },
      {
        title: "Longest Common Subsequence",
        difficulty: "medium",
        statement: "Return the length of the longest subsequence that two strings have in common.",
        why: "Two sequences compared prefix by prefix → a 2-D table indexed by (i, j).",
        q: {
          type: "fill_blank",
          prompt: "When a[i − 1] == b[j − 1], dp[i][j] = ______",
          choices: ["dp[i − 1][j − 1] + 1", "max(dp[i − 1][j], dp[i][j − 1])", "dp[i − 1][j] + dp[i][j − 1]", "1"],
          explanation: "A matching last character extends the best LCS of both shorter prefixes by one.",
        },
      },
      {
        title: "Edit Distance",
        difficulty: "hard",
        statement: "Return the minimum number of single-character inserts, deletes or substitutions that turn word1 into word2.",
        why: "Transforming one string into another by prefix operations → 2-D DP over (i, j).",
        q: {
          type: "complexity",
          prompt: "Time and space of the standard table, for lengths n and m?",
          choices: ["O(n·m) time and space (space reducible to O(min(n, m)))", "O(n + m) time", "O(2^(n+m)) time", "O(n log m) time"],
          explanation: "Each of the n·m cells takes O(1) from three neighbours; keeping only the previous row saves space.",
        },
      },
    ],
  },
  {
    id: "greedy",
    name: "Greedy",
    tagline: "Take the locally best step — when it's provably safe.",
    signals: [
      "A locally best choice can be proven safe (an exchange argument)",
      "“Can you reach the end?”, “minimum jumps”, scheduling",
      "Sort by one key, then a single pass decides everything",
    ],
    idea: "Make the choice that looks best right now and never revisit it. Do this only after convincing yourself, or failing to find a counter-example, that it can't hurt later.",
    template: `# Jump Game
reach = 0
for i, step in enumerate(nums):
    if i > reach:
        return False
    reach = max(reach, i + step)
return True`,
    complexity: "Usually O(n) or O(n log n) with a sort · O(1) space",
    confusers: ["dp-1d", "intervals", "heap", "sliding-window"],
    problems: [
      {
        title: "Jump Game",
        difficulty: "medium",
        statement: "Each element is your maximum jump length from that position. Can you reach the last index?",
        why: "Track the farthest reachable index in one pass: a greedy invariant, no DP table needed.",
        q: {
          type: "complexity",
          prompt: "Time and space of the greedy “farthest reach” solution?",
          choices: ["O(n) time, O(1) space", "O(n²) time, O(n) space", "O(n log n) time, O(1) space", "O(n) time, O(n) space"],
          explanation: "One pass, one variable. The O(n²)/O(n) option is the DP solution it improves on.",
        },
      },
      {
        title: "Gas Station",
        difficulty: "medium",
        statement: "Gas stations on a circular route give gas[i] and cost cost[i] to reach the next one. Return the starting station that lets you complete the loop, or −1.",
        why: "If total gas ≥ total cost a start exists; whenever the tank goes negative, no start up to that point works, so restart right after it.",
        q: {
          type: "approach",
          prompt: "When the running tank drops below 0 at station i, the next candidate start is:",
          choices: ["i + 1", "The previous start + 1", "Station 0", "The station with the most gas"],
          explanation: "Any start between the old one and i would arrive at i with even less gas, so all of them fail too.",
        },
      },
      {
        title: "Partition Labels",
        difficulty: "medium",
        statement: "Split a string into as many parts as possible so that each letter appears in at most one part. Return the sizes of the parts.",
        why: "Record each letter's last index, greedily extend the current part's end, and cut when i reaches it.",
        q: {
          type: "trace",
          prompt: "Partitioning \"ababcc\" gives part sizes:",
          choices: ["[4, 2]", "[2, 2, 2]", "[6]", "[1, 1, 1, 1, 1, 1]"],
          explanation: "a's last index is 2 and b's is 3, so the first part is “abab”; “cc” is the second.",
        },
      },
    ],
  },
  {
    id: "trie",
    name: "Trie",
    tagline: "Prefix trees for word lookups.",
    signals: [
      "Many prefix queries (startsWith, autocomplete)",
      "Searching for many dictionary words at once (e.g. on a board)",
      "Longest common prefix; maximum XOR with a bitwise trie",
    ],
    idea: "A tree of characters where every root-to-node path spells a prefix. Insert and lookup cost O(word length), however many words are stored.",
    template: `class Node:
    def __init__(self):
        self.kids = {}
        self.end = False

def insert(root, word):
    node = root
    for ch in word:
        node = node.kids.setdefault(ch, Node())
    node.end = True`,
    complexity: "O(L) per insert / lookup · O(total characters) space",
    confusers: ["hashing", "tree-dfs", "backtracking", "binary-search"],
    problems: [
      {
        title: "Implement Trie",
        difficulty: "medium",
        statement: "Implement insert, search (exact word) and startsWith (any stored word with this prefix).",
        why: "Prefix queries are the reason tries exist.",
        q: {
          type: "approach",
          prompt: "After inserting \"apple\", what separates search(\"app\") from startsWith(\"app\")?",
          choices: [
            "search needs the end-of-word flag on the last node; startsWith only needs the path to exist",
            "search walks the whole trie",
            "startsWith is O(n) in the number of words",
            "Nothing — both return true",
          ],
          explanation: "The path a→p→p exists, but no word ends there, so search is false and startsWith is true.",
        },
      },
      {
        title: "Word Search II",
        difficulty: "hard",
        statement: "Given a board of letters and a list of words, return every word that can be traced through adjacent cells.",
        why: "Many words over one board → put the words in a trie and DFS the board once, pruning as soon as a prefix leaves the trie.",
        q: {
          type: "approach",
          prompt: "Why is a trie better than searching the board once per word?",
          choices: [
            "Words that share a prefix share one DFS path, and dead prefixes are pruned immediately",
            "Tries use less memory than the board",
            "It sorts the words",
            "It avoids recursion",
          ],
          explanation: "The board walk is shared across all words instead of being repeated for each one.",
        },
      },
      {
        title: "Add and Search Words",
        difficulty: "medium",
        statement: "Design a structure supporting addWord and search, where '.' in a search matches any single letter.",
        why: "Prefix-structured word storage with wildcard branching → trie plus DFS on '.'.",
        q: {
          type: "complexity",
          prompt: "Cost of searching a word of length L with no wildcards?",
          choices: ["O(L)", "O(N · L) for N stored words", "O(log N)", "O(1)"],
          explanation: "You follow one child per character, independent of how many words are stored.",
        },
      },
    ],
  },
  {
    id: "bits",
    name: "Bit Manipulation",
    tagline: "XOR, masks and other O(1)-space tricks.",
    signals: [
      "“Every element appears twice except one”",
      "Subsets as bitmasks, powers of two, counting set bits",
      "Constant extra space with XOR / AND tricks",
    ],
    idea: "Use XOR (a ^ a = 0, a ^ 0 = a), masks (1 << i) and n & (n − 1), which clears the lowest set bit, to replace extra memory or loops.",
    template: `res = 0
for x in nums:
    res ^= x          # pairs cancel out
return res`,
    complexity: "O(n) time · O(1) space",
    confusers: ["hashing", "prefix-sum", "dp-1d", "two-pointers"],
    problems: [
      {
        title: "Single Number",
        difficulty: "easy",
        statement: "Every element appears twice except one. Find that one in O(n) time and O(1) space.",
        why: "Pairs + O(1) space → XOR everything; duplicates cancel out.",
        q: {
          type: "trace",
          prompt: "What is 4 ^ 1 ^ 2 ^ 1 ^ 2?",
          choices: ["4", "0", "10", "2"],
          explanation: "XOR is commutative: the 1s cancel, the 2s cancel, leaving 4.",
        },
      },
      {
        title: "Number of 1 Bits",
        difficulty: "easy",
        statement: "Return how many bits are set to 1 in a non-negative integer.",
        why: "Counting set bits → n & (n − 1) drops the lowest one each loop.",
        q: {
          type: "approach",
          prompt: "What does n & (n − 1) do?",
          choices: ["Clears the lowest set bit of n", "Sets the lowest zero bit", "Divides n by 2", "Returns the highest set bit"],
          explanation: "Subtracting 1 flips the lowest 1 and every 0 below it; AND-ing removes exactly that bit.",
        },
      },
      {
        title: "Missing Number",
        difficulty: "easy",
        statement: "An array holds n distinct numbers taken from 0..n, with exactly one missing. Find it using O(1) extra space.",
        why: "XOR all indices 0..n with all values: everything pairs off except the missing number.",
        q: {
          type: "approach",
          prompt: "Besides XOR, which O(n)-time, O(1)-space approach also works?",
          choices: ["Subtract the array's sum from n(n + 1) / 2", "Sort, then scan for the gap", "Put every value in a hash set", "Binary search the unsorted array"],
          explanation: "The expected total minus the actual total is the missing value. Sorting is O(n log n); a set uses O(n) space.",
        },
      },
    ],
  },
];

export const patternById = new Map(PATTERNS.map((p) => [p.id, p]));

const RECOGNITION_PROMPTS = [
  "Which pattern cracks this problem?",
  "Which pattern should you reach for first?",
  "What's the core pattern here?",
];

function shuffledChoices(choices, key) {
  const order = seededShuffle(
    choices.map((_, i) => i),
    rngFor(key)
  );
  return { choices: order.map((i) => choices[i]), correct_index: order.indexOf(0) };
}

// Builds one pattern's deck in the unified import schema (plus a `guide` the
// app shows on the deck screen). `index` is the pattern's position in the path.
export function buildPatternDeck(pattern, index) {
  const nn = String(index + 1).padStart(2, "0");
  return {
    deck_name: `Pattern ${nn} · ${pattern.name}`,
    source_type: "leetcode",
    guide: {
      patternId: pattern.id,
      signals: pattern.signals,
      idea: pattern.idea,
      template: pattern.template,
      complexity: pattern.complexity,
    },
    items: pattern.problems.map((pr, j) => {
      const base = `lcp:${pattern.id}:${j}`;
      // Rotate through the look-alikes so each problem has a different trio.
      const decoys = [0, 1, 2].map((k) => pattern.confusers[(j + k) % pattern.confusers.length]);
      const recog = shuffledChoices(
        [pattern.name, ...decoys.map((id) => patternById.get(id).name)],
        `${base}:recognize`
      );
      const insight = shuffledChoices(pr.q.choices, `${base}:insight`);
      return {
        id: stableUuid(base),
        title: pr.title,
        topic: pattern.name,
        difficulty: pr.difficulty,
        context: pr.statement,
        questions: [
          {
            id: stableUuid(`${base}:recognize`),
            type: "approach",
            prompt: RECOGNITION_PROMPTS[j % RECOGNITION_PROMPTS.length],
            ...recog,
            explanation: pr.why,
          },
          {
            id: stableUuid(`${base}:insight`),
            type: pr.q.type,
            prompt: pr.q.prompt,
            ...insight,
            explanation: pr.q.explanation,
          },
        ],
      };
    }),
  };
}
