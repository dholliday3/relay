/**
 * Static + behavioral tests for scripts/install.sh.
 *
 * Bulk of the coverage is string-match assertions against the script's
 * source — that's how plannotator tests its install scripts too, and it
 * catches the whole class of "someone accidentally deleted the sha256
 * check / changed the install dir / broke arg parsing" regressions
 * without needing to actually download anything.
 *
 * The `behavior` block additionally spawns the script with --help and
 * a few invalid inputs to catch shell syntax errors early.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const scriptsDir = import.meta.dir;
const INSTALL_PATH = join(scriptsDir, "install.sh");
const script = readFileSync(INSTALL_PATH, "utf-8");

function run(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(["bash", INSTALL_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
    exitCode: proc.exitCode ?? -1,
  };
}

describe("install.sh — static structure", () => {
  test("targets the dholliday3/relay repo", () => {
    expect(script).toContain('REPO="dholliday3/relay"');
  });

  test("installs to ~/.local/bin", () => {
    expect(script).toContain('INSTALL_DIR="$HOME/.local/bin"');
  });

  test("uses set -e for fail-fast behavior", () => {
    expect(script).toMatch(/^set -e/m);
  });

  test("detects supported operating systems", () => {
    expect(script).toContain('Darwin) os="darwin"');
    expect(script).toContain('Linux)  os="linux"');
  });

  test("rejects unsupported operating systems with a clear message", () => {
    expect(script).toContain("Unsupported OS:");
    expect(script).toContain("relay currently ships binaries for macOS and Linux only");
  });

  test("detects supported architectures", () => {
    expect(script).toContain('x86_64|amd64)   arch="x64"');
    expect(script).toContain('arm64|aarch64)  arch="arm64"');
  });

  test("rejects unsupported architectures", () => {
    expect(script).toContain("Unsupported architecture:");
  });

  test("builds binary name from platform", () => {
    expect(script).toContain('platform="${os}-${arch}"');
    expect(script).toContain('binary_name="relay-${platform}"');
  });
});

describe("install.sh — version resolution", () => {
  test("defaults to the latest release", () => {
    expect(script).toContain('VERSION="latest"');
  });

  test("fetches latest tag from the GitHub releases API", () => {
    expect(script).toContain('"https://api.github.com/repos/${REPO}/releases/latest"');
    // Uses `grep -o '"tag_name":[[:space:]]*"[^"]*"'` — the `-o` is
    // load-bearing (without it, `grep '"tag_name"'` matches the whole
    // line and the follow-up `cut -d'"' -f4` grabs the wrong field), and
    // the `[[:space:]]*` matters because GitHub's API returns pretty-
    // printed JSON with a space between `:` and the value. A prior
    // version of this regex assumed single-line JSON and broke against
    // real responses.
    expect(script).toContain(`grep -o '"tag_name":[[:space:]]*"[^"]*"'`);
  });

  test("tag_name parser extracts the tag from a realistic GitHub API response", () => {
    // Behavioral test — run the actual parse pipeline against a real-world
    // pretty-printed JSON response from the GitHub releases API. The
    // response has a space between `:` and the tag value, and the `url`
    // field appears before `tag_name` — both have bitten earlier
    // versions of this parser.
    const mockResponse = `{
  "url": "https://api.github.com/repos/dholliday3/relay/releases/308655336",
  "assets_url": "https://api.github.com/repos/dholliday3/relay/releases/308655336/assets",
  "html_url": "https://github.com/dholliday3/relay/releases/tag/v0.3.1",
  "id": 308655336,
  "tag_name": "v0.3.1",
  "name": "v0.3.1",
  "draft": false,
  "prerelease": false
}`;
    const proc = Bun.spawnSync(
      ["sh", "-c", `cat <<'EOF' | grep -o '"tag_name":[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4\n${mockResponse}\nEOF`],
      { stdout: "pipe", stderr: "pipe" },
    );
    const stdout = new TextDecoder().decode(proc.stdout).trim();
    expect(stdout).toBe("v0.3.1");
  });

  test("auto-prefixes v when version lacks it", () => {
    // Matches `v*) latest_tag="$VERSION" ;;` and `*) latest_tag="v$VERSION" ;;`
    expect(script).toContain('v*) latest_tag="$VERSION"');
    expect(script).toContain('latest_tag="v$VERSION"');
  });

  test("rejects mixing --version with a positional tag", () => {
    expect(script).toContain("Unexpected positional argument:");
    expect(script).toContain("version already set");
  });

  test("rejects --version without a value", () => {
    expect(script).toContain("--version requires an argument");
  });
});

describe("install.sh — download + verification", () => {
  test("downloads both binary and checksum from release URLs", () => {
    expect(script).toContain(
      'binary_url="https://github.com/${REPO}/releases/download/${latest_tag}/${binary_name}"',
    );
    expect(script).toContain('checksum_url="${binary_url}.sha256"');
  });

  test("uses curl -fsSL for fail-fast downloads", () => {
    // -f fails on HTTP error, -sS silences progress but keeps errors,
    // -L follows redirects. Missing any of these is a regression.
    expect(script).toContain("curl -fsSL");
  });

  test("uses mktemp for the download target to avoid in-place overwrites", () => {
    expect(script).toContain("tmp_file=$(mktemp)");
  });

  test("verifies SHA256 on both macOS and Linux", () => {
    expect(script).toContain("shasum -a 256");
    expect(script).toContain("sha256sum");
  });

  test("fails on checksum mismatch and cleans up the tmp file", () => {
    // The naive regex approach fails here because "veriFIcation" contains
    // `fi` as a substring — any non-greedy `[\s\S]+?fi` match terminates
    // inside the error message before reaching the real shell `fi`. Use
    // positional index checks instead: the failure message, rm, and exit
    // all have to appear in order inside the mismatch branch.
    expect(script).toContain("Checksum verification failed!");
    const failIdx = script.indexOf("Checksum verification failed!");
    const rmIdx = script.indexOf('rm -f "$tmp_file"', failIdx);
    const exitIdx = script.indexOf("exit 1", rmIdx);
    expect(failIdx).toBeGreaterThan(0);
    expect(rmIdx).toBeGreaterThan(failIdx);
    expect(exitIdx).toBeGreaterThan(rmIdx);
  });

  test("fails when the checksum response is empty", () => {
    expect(script).toContain("Failed to fetch checksum from");
  });
});

describe("install.sh — install step", () => {
  test("removes any pre-existing binary before mv", () => {
    expect(script).toContain('rm -f "$INSTALL_DIR/relay"');
  });

  test("moves tmp file into place and sets executable bit", () => {
    expect(script).toContain('mv "$tmp_file" "$INSTALL_DIR/relay"');
    expect(script).toContain('chmod +x "$INSTALL_DIR/relay"');
  });

  test("reports success with the resolved tag and install path", () => {
    expect(script).toContain("relay ${latest_tag} installed to ${INSTALL_DIR}/relay");
  });
});

describe("install.sh — PATH setup", () => {
  test("checks whether INSTALL_DIR is already on PATH", () => {
    expect(script).toContain("echo \"$PATH\" | tr ':' '\\n' | grep -qx \"$INSTALL_DIR\"");
  });

  test("uses a marker comment so re-runs are idempotent", () => {
    // The marker has to mention the installer + repo so a human reading
    // their rc file later can tell where the line came from.
    expect(script).toContain("PATH_MARKER=");
    expect(script).toContain("Added by relay installer");
  });

  test("checks for the marker before appending to avoid duplicate exports", () => {
    expect(script).toContain('grep -qF "$PATH_MARKER" "$rc_file"');
  });

  test("touches both bash and zsh rc files when present", () => {
    expect(script).toContain('[ -f "$HOME/.bashrc" ] && add_path_to_rc "$HOME/.bashrc"');
    expect(script).toContain('[ -f "$HOME/.zshrc" ]  && add_path_to_rc "$HOME/.zshrc"');
  });

  test("creates the rc file matching $SHELL when it doesn't exist", () => {
    // Cloud sandboxes often have no .bashrc at all — the case statement
    // below the existence checks creates one for whichever shell is
    // active so we don't silently no-op.
    expect(script).toContain("*/bash)");
    expect(script).toContain("*/zsh)");
    expect(script).toContain("*/fish)");
  });

  test("uses POSIX export syntax for bash/zsh and fish-native for fish", () => {
    expect(script).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(script).toContain("set -gx PATH $HOME/.local/bin $PATH");
  });

  test("tells the user how to update their current shell since rc files only affect new shells", () => {
    expect(script).toContain("New shells will pick this up automatically");
    expect(script).toContain("export PATH=");
  });
});

describe("install.sh — PATH setup (behavioral)", () => {
  // Spawn a stripped harness that sources only the PATH-setup logic
  // against a fake $HOME, so we can assert real file-system behavior
  // without running the full installer (which requires network + a
  // real release artifact).
  async function runPathSetup(opts: {
    home: string;
    shell: string;
    existingBashrc?: string;
    existingZshrc?: string;
    existingFishConfig?: string;
  }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { home, shell } = opts;
    const { mkdir, writeFile } = await import("node:fs/promises");
    if (opts.existingBashrc !== undefined) {
      await writeFile(`${home}/.bashrc`, opts.existingBashrc);
    }
    if (opts.existingZshrc !== undefined) {
      await writeFile(`${home}/.zshrc`, opts.existingZshrc);
    }
    if (opts.existingFishConfig !== undefined) {
      await mkdir(`${home}/.config/fish`, { recursive: true });
      await writeFile(`${home}/.config/fish/config.fish`, opts.existingFishConfig);
    }

    // Extract just the PATH-setup block from install.sh and run it
    // standalone against a fake $HOME with PATH cleared so the
    // "already on PATH" check fails and the block actually runs.
    const startMarker = "# --- PATH setup";
    const endMarker = "# --- global skill install";
    const startIdx = script.indexOf(startMarker);
    const endIdx = script.indexOf(endMarker);
    if (startIdx < 0 || endIdx < 0) {
      throw new Error("install.sh layout changed — update test markers");
    }
    const pathBlock = script.slice(startIdx, endIdx);
    const harness = [
      "#!/bin/bash",
      "set -e",
      `REPO="dholliday3/relay"`,
      `INSTALL_DIR="$HOME/.local/bin"`,
      // Clear PATH of INSTALL_DIR so the gate evaluates true.
      `PATH="/usr/bin:/bin"`,
      pathBlock,
    ].join("\n");

    const proc = Bun.spawnSync(["bash", "-c", harness], {
      stdout: "pipe",
      stderr: "pipe",
      env: { HOME: home, SHELL: shell, PATH: "/usr/bin:/bin" },
    });
    return {
      stdout: new TextDecoder().decode(proc.stdout),
      stderr: new TextDecoder().decode(proc.stderr),
      exitCode: proc.exitCode ?? -1,
    };
  }

  test("appends export to existing .bashrc", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const home = await mkdtemp(`${tmpdir()}/relay-install-test-`);
    const { rm, readFile } = await import("node:fs/promises");
    try {
      await runPathSetup({
        home,
        shell: "/bin/bash",
        existingBashrc: "# my dotfiles\nalias ll='ls -la'\n",
      });
      const updated = await readFile(`${home}/.bashrc`, "utf-8");
      expect(updated).toContain("# my dotfiles");
      expect(updated).toContain("Added by relay installer");
      expect(updated).toContain('export PATH="$HOME/.local/bin:$PATH"');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("creates .bashrc when SHELL is bash and no rc exists", async () => {
    const { mkdtemp, rm, readFile, access } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const home = await mkdtemp(`${tmpdir()}/relay-install-test-`);
    try {
      await runPathSetup({ home, shell: "/bin/bash" });
      await access(`${home}/.bashrc`); // throws if missing
      const created = await readFile(`${home}/.bashrc`, "utf-8");
      expect(created).toContain('export PATH="$HOME/.local/bin:$PATH"');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("is idempotent — re-running does not duplicate the export", async () => {
    const { mkdtemp, rm, readFile, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const home = await mkdtemp(`${tmpdir()}/relay-install-test-`);
    try {
      await writeFile(`${home}/.bashrc`, "# initial\n");
      await runPathSetup({ home, shell: "/bin/bash", existingBashrc: undefined });
      const afterFirst = await readFile(`${home}/.bashrc`, "utf-8");
      const firstCount = afterFirst.split("Added by relay installer").length - 1;
      expect(firstCount).toBe(1);

      await runPathSetup({ home, shell: "/bin/bash", existingBashrc: undefined });
      const afterSecond = await readFile(`${home}/.bashrc`, "utf-8");
      const secondCount = afterSecond.split("Added by relay installer").length - 1;
      expect(secondCount).toBe(1); // still only one
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("writes fish-native syntax to fish config when shell is fish", async () => {
    const { mkdtemp, rm, readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const home = await mkdtemp(`${tmpdir()}/relay-install-test-`);
    try {
      await runPathSetup({ home, shell: "/usr/local/bin/fish" });
      const fishConfig = await readFile(`${home}/.config/fish/config.fish`, "utf-8");
      expect(fishConfig).toContain("set -gx PATH $HOME/.local/bin $PATH");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("install.sh — global skill install", () => {
  test("uses git sparse-checkout scoped to skills/", () => {
    expect(script).toContain("git clone --depth 1 --filter=blob:none --sparse");
    expect(script).toContain("git sparse-checkout set skills");
  });

  test("installs skills to Claude Code and Codex discovery paths", () => {
    expect(script).toContain("CLAUDE_SKILLS_DIR=\"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills\"");
    expect(script).toContain('AGENTS_SKILLS_DIR="$HOME/.agents/skills"');
  });

  test("falls back with a clear message when git is missing", () => {
    expect(script).toContain("Skipping global skill install (git not found)");
  });

  test("falls back with a clear message when sparse-checkout fails", () => {
    expect(script).toContain(
      "Skipping global skill install (git sparse-checkout failed or skills/relay empty)",
    );
  });

  test("cleans up the temp skill directory", () => {
    expect(script).toContain('rm -rf "$skills_tmp"');
  });
});

describe("install.sh — next-steps output", () => {
  test("advertises the relay init + onboard flow post-install", () => {
    expect(script).toContain("relay init");
    expect(script).toContain("relay onboard");
  });
});

describe("install.sh — behavior (spawned)", () => {
  test("--help prints usage and exits 0", () => {
    const { stdout, stderr, exitCode } = run(["--help"]);
    expect(exitCode).toBe(0);
    // Help goes to stdout — the piped-from-curl pattern means users see it.
    expect(stdout).toContain("Usage: install.sh");
    expect(stdout).toContain("--version");
    expect(stdout).toContain("--help");
    expect(stderr).toBe("");
  });

  test("-h is an alias for --help", () => {
    const { stdout, exitCode } = run(["-h"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage: install.sh");
  });

  test("--version with no argument exits 1 and prints an error", () => {
    const { stderr, exitCode } = run(["--version"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("--version requires an argument");
  });

  test("--version followed by a flag exits 1 (guards against arg eating)", () => {
    const { stderr, exitCode } = run(["--version", "--help"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("--version requires a tag value");
  });

  test("unknown flag exits 1 with an error", () => {
    const { stderr, exitCode } = run(["--banana"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown option: --banana");
  });

  test("mixing --version and a positional tag exits 1", () => {
    const { stderr, exitCode } = run(["--version", "v0.1.0", "v0.2.0"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unexpected positional argument");
  });
});
