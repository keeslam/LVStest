/**
 * The dump fixtures the FIX-L tests restore, built in-process.
 *
 * Deliberately NOT under a directory called backups/: .gitignore excludes that
 * name anywhere in the tree, so fixtures placed there would be silently absent
 * from a fresh clone and the FIX-L tests would fail for a reason nobody could
 * see in the diff.
 *
 * The phase-17 evidence used real 20 MB archives derived from a production
 * dump; those are audit artefacts, they carry live session ids and password
 * hashes, and they must not enter the repository. These fixtures reproduce
 * exactly the SHAPES that broke, which is what the assertions are about:
 *
 *   good          a complete, well-formed dump ending with the pg_dump marker
 *   copyerror     the p17-copyerror shape: a COPY row whose integer column
 *                 holds 'NOTANINT'. psql without ON_ERROR_STOP skipped it,
 *                 emptied the table and still exited 0
 *   truncated     the p17-half shape: a download cut in half — perfectly
 *                 healthy-looking in its first 4 KB, no completion marker
 *   emptyish      the p17-empty shape: valid SQL, under the size floor, no marker
 *   foreignDb     a dump carrying \connect other_db (BUG-199)
 *   shellEscape   a dump carrying \! and COPY ... FROM PROGRAM
 *   corruptGzip   bytes that claim to be gzip and are not
 */
import { gzipSync } from "zlib";

const HEADER = [
  "--",
  "-- PostgreSQL database dump",
  "--",
  "SET statement_timeout = 0;",
  "SET lock_timeout = 0;",
  "SET client_encoding = 'UTF8';",
  "SET standard_conforming_strings = on;",
  "",
].join("\n");

const FOOTER = ["", "--", "-- PostgreSQL database dump complete", "--", ""].join("\n");

/** Enough filler to clear the 1024-byte floor without pretending to be a real dump. */
function padding(lines = 40): string {
  return Array.from({ length: lines }, (_, i) => `-- padding line ${i} ${"x".repeat(40)}`).join("\n") + "\n";
}

const SCHEMA = [
  "DROP TABLE IF EXISTS public.fixt_vehicles CASCADE;",
  "CREATE TABLE public.fixt_vehicles (id integer NOT NULL, plate text NOT NULL);",
  "DROP TABLE IF EXISTS public.fixt_users CASCADE;",
  "CREATE TABLE public.fixt_users (id integer NOT NULL, username text NOT NULL);",
  "",
].join("\n");

function copyBlock(table: string, columns: string, rows: string[]): string {
  return [`COPY public.${table} (${columns}) FROM stdin;`, ...rows, "\\.", ""].join("\n");
}

/** A complete, restorable dump with `vehicles` and `users` rows. */
export function goodDump(vehicleCount = 3, userCount = 2): string {
  const vehicles = Array.from({ length: vehicleCount }, (_, i) => `${i + 1}\tFIXT-${i + 1}`);
  const users = Array.from({ length: userCount }, (_, i) => `${i + 1}\tfixt-user-${i + 1}`);
  return (
    HEADER + padding() + SCHEMA +
    copyBlock("fixt_vehicles", "id, plate", vehicles) +
    copyBlock("fixt_users", "id, username", users) +
    FOOTER
  );
}

/**
 * Complete and well-formed right down to the marker, but one COPY row has a
 * non-integer in an integer column. This is the fixture that proves
 * ON_ERROR_STOP matters: without it psql skips the row, leaves the table
 * empty and exits 0.
 */
export function copyErrorDump(): string {
  return (
    HEADER + padding() + SCHEMA +
    copyBlock("fixt_vehicles", "id, plate", ["NOTANINT\tFIXT-1", "2\tFIXT-2"]) +
    copyBlock("fixt_users", "id, username", ["1\tfixt-user-1"]) +
    FOOTER
  );
}

/** A dump cut off halfway: valid SQL so far, no completion marker. */
export function truncatedDump(): string {
  const full = goodDump(40, 20);
  return full.slice(0, Math.floor(full.length / 2));
}

/** Valid SQL, but far too small to be a dump of anything. */
export function tinyDump(): string {
  return "-- PostgreSQL database dump\nSELECT 1;\n";
}

/** BUG-199: restores into — and first drops — a different database. */
export function foreignDatabaseDump(databaseName = "some_other_database"): string {
  return (
    HEADER + padding() +
    `DROP DATABASE IF EXISTS ${databaseName};\n` +
    `CREATE DATABASE ${databaseName} WITH TEMPLATE = template0;\n` +
    `\\connect ${databaseName}\n\n` +
    SCHEMA +
    copyBlock("fixt_vehicles", "id, plate", ["1\tFIXT-1"]) +
    FOOTER
  );
}

/** A dump that shells out. */
export function shellEscapeDump(): string {
  return (
    HEADER + padding() +
    "\\! echo owned > /tmp/lvs-fixt-owned\n" +
    "COPY public.fixt_vehicles (id, plate) FROM PROGRAM 'echo 1,X';\n" +
    SCHEMA + FOOTER
  );
}

/**
 * A dump whose COPY DATA contains lines that look like forbidden directives.
 * The inspector must NOT refuse this one: within a COPY block every line is a
 * row, not a statement, and refusing it would make the guard unusable.
 */
export function dumpWithSuspiciousData(): string {
  return (
    HEADER + padding() + SCHEMA +
    copyBlock("fixt_vehicles", "id, plate", [
      "1\tCREATE DATABASE evil",
      "2\t\\\\connect other",
      "3\tALTER SYSTEM SET x",
    ]) +
    FOOTER
  );
}

export function gzipped(sql: string): Buffer {
  return gzipSync(Buffer.from(sql, "utf8"));
}

/** Bytes that start with the gzip magic and then are not gzip at all. */
export function corruptGzip(): Buffer {
  const real = gzipSync(Buffer.from(goodDump(), "utf8"));
  const broken = Buffer.from(real);
  // Mangle the deflate stream but keep the magic bytes, so it is only
  // discovered to be corrupt while being read — which is the point.
  for (let i = 10; i < Math.min(broken.length, 200); i++) broken[i] = 0x41;
  return broken;
}
