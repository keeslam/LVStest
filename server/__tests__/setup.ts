import dotenv from "dotenv";
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set (see .env) to run the server tests");
}
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";

// The suite writes to whatever DATABASE_URL points at: it creates and hard-deletes
// vehicles, reservations, customers and users. Point it at the dedicated test
// database, never at the development or production one:
//
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run
//
// dotenv.config() above does not overwrite an already-present environment
// variable, so the value on the command line wins over .env. Running against the
// dev database is what produced BUG-145's 258 orphan maintenance blocks.
