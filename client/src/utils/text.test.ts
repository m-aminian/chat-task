import { describe, expect, it } from "vitest";
import { firstLine, initials, joinNames, looksLikeMarkdown, pluralize, truncate } from "./text";

describe("initials", () => {
  it("uses the first letters of a name", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("@bob:localhost")).toBe("BO");
    expect(initials("team.sync-ops")).toBe("TS");
    expect(initials("")).toBe("?");
  });

  it("handles emoji without splitting surrogate pairs", () => {
    expect(initials("🦊 fox")).toBe("🦊F");
  });
});

describe("truncate", () => {
  it("adds an ellipsis only when needed", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("a longer sentence", 8)).toBe("a longe…");
  });
});

describe("firstLine", () => {
  it("skips blank lines and markdown markers", () => {
    expect(firstLine("\n\n> quoted text\nmore")).toBe("quoted text");
    expect(firstLine("## Heading")).toBe("Heading");
  });
});

describe("looksLikeMarkdown", () => {
  it.each([
    ["plain sentence.", false],
    ["has **bold**", true],
    ["`code`", true],
    ["- list item", true],
    ["1. first", true],
    ["two\nlines", true],
    ["| a | b |", true],
  ])("%j -> %s", (input, expected) => {
    expect(looksLikeMarkdown(input)).toBe(expected);
  });
});

describe("joinNames", () => {
  it("joins with commas and a final and", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["a"])).toBe("a");
    expect(joinNames(["a", "b"])).toBe("a and b");
    expect(joinNames(["a", "b", "c"])).toBe("a, b and c");
    expect(joinNames(["a", "b", "c", "d", "e"])).toBe("a, b and 3 others");
  });
});

describe("pluralize", () => {
  it("picks singular or plural", () => {
    expect(pluralize(1, "member")).toBe("1 member");
    expect(pluralize(3, "member")).toBe("3 members");
    expect(pluralize(2, "reply", "replies")).toBe("2 replies");
  });
});
