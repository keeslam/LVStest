/**
 * The session store must be chosen on what the storage *is*, not on what its
 * class happens to be called.
 *
 * Found by running the production build locally: the start-up log said
 * `store=memory`, while development said `store=postgres`. `setupAuth` picked the
 * store with `storage.constructor.name === 'DatabaseStorage'`. During the audit
 * the class gained static fields it refers to by its own name
 * (`DatabaseStorage.VEHICLE_SNAPSHOT_TABLES`, `DatabaseStorage.CONTRACT_NUMBER_SHAPE`),
 * and esbuild then emits it as `class _DatabaseStorage`. The name check failed,
 * and a production deploy would silently have moved every staff session into
 * process memory — everyone logged out on each restart or deploy.
 *
 * `usesDatabaseStorage` decides with `instanceof`, which survives any renaming a
 * bundler does. The test builds exactly the renamed shape esbuild produces.
 */
import { describe, it, expect } from "vitest";
import { DatabaseStorage } from "../database-storage";
import { usesDatabaseStorage } from "../auth";

describe("keuze van de sessieopslag", () => {
  it("herkent de databaseopslag ook als de bundler de klasse hernoemt", () => {
    // esbuild's output for a class that references itself by name.
    const Bundled = class _DatabaseStorage extends DatabaseStorage {};
    const bundled = new Bundled();

    expect(bundled.constructor.name).toBe("_DatabaseStorage");
    expect(usesDatabaseStorage(bundled)).toBe(true);
  });

  it("herkent de gewone databaseopslag", () => {
    expect(usesDatabaseStorage(new DatabaseStorage())).toBe(true);
  });

  it("kiest geen database voor iets dat geen databaseopslag is", () => {
    class InMemoryStorage {}
    expect(usesDatabaseStorage(new InMemoryStorage())).toBe(false);
    expect(usesDatabaseStorage(null)).toBe(false);
  });
});
