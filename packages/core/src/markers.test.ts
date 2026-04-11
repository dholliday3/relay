import { describe, test, expect } from "bun:test";
import {
  START_MARKER,
  END_MARKER,
  hasMarkerSection,
  replaceMarkerSection,
  wrapInMarkers,
} from "./markers.js";

describe("markers", () => {
  describe("wrapInMarkers", () => {
    test("wraps a section with start and end markers on their own lines", () => {
      const wrapped = wrapInMarkers("hello");
      expect(wrapped).toBe(`${START_MARKER}\nhello\n${END_MARKER}`);
    });

    test("preserves multiline content verbatim", () => {
      const section = "line 1\nline 2\n\nline 4";
      const wrapped = wrapInMarkers(section);
      expect(wrapped).toBe(`${START_MARKER}\n${section}\n${END_MARKER}`);
    });
  });

  describe("hasMarkerSection", () => {
    test("returns true when both markers are present", () => {
      const content = `prefix\n${START_MARKER}\nbody\n${END_MARKER}\nsuffix`;
      expect(hasMarkerSection(content)).toBe(true);
    });

    test("returns false when only the start marker is present", () => {
      const content = `prefix\n${START_MARKER}\nbody with no end`;
      expect(hasMarkerSection(content)).toBe(false);
    });

    test("returns false when only the end marker is present", () => {
      const content = `prefix\nno start marker\nbody\n${END_MARKER}`;
      expect(hasMarkerSection(content)).toBe(false);
    });

    test("returns false when neither marker is present", () => {
      expect(hasMarkerSection("plain content, no markers here")).toBe(false);
    });
  });

  describe("replaceMarkerSection", () => {
    test("replaces the bracketed region with the wrapped new section", () => {
      const content = `before\n${START_MARKER}\nold body\n${END_MARKER}\nafter`;
      const result = replaceMarkerSection(content, "new body");
      expect(result).toBe(
        `before\n${START_MARKER}\nnew body\n${END_MARKER}\nafter`,
      );
    });

    test("preserves content outside the markers byte-for-byte", () => {
      const before = "# Project\n\nSome important notes.\n\n";
      const after = "\n\n## Other tool's section\nimportant stuff\n";
      const content = `${before}${START_MARKER}\nold\n${END_MARKER}${after}`;
      const result = replaceMarkerSection(content, "new");
      expect(result).toBe(
        `${before}${START_MARKER}\nnew\n${END_MARKER}${after}`,
      );
    });

    test("returns null when both markers are absent", () => {
      expect(replaceMarkerSection("no markers here", "new")).toBeNull();
    });

    test("returns null when only the start marker is present", () => {
      const content = `${START_MARKER}\nbody\nno end`;
      expect(replaceMarkerSection(content, "new")).toBeNull();
    });

    test("returns null when only the end marker is present", () => {
      const content = `no start\nbody\n${END_MARKER}`;
      expect(replaceMarkerSection(content, "new")).toBeNull();
    });
  });
});
