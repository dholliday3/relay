/**
 * Terminal session module.
 *
 * Exports the TerminalSession interface (the stable seam) and the default
 * backend (BunPtyHeadlessBackend). Future native backends replace the
 * backend export without touching any consumer.
 */

export type {
  TerminalSession,
  TerminalSessionBackend,
  TerminalSessionCreateOptions,
  SessionEvent,
} from "./session.js";

export { BunPtyHeadlessBackend } from "./bun-headless-backend.js";
