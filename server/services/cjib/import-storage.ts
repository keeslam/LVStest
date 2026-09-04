import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { fineImportFiles, type FineImportFile } from "../../../shared/schema";

export const importStorage = {
  async getByHash(fileHash: string): Promise<FineImportFile | undefined> {
    const [row] = await db.select().from(fineImportFiles).where(eq(fineImportFiles.fileHash, fileHash)).limit(1);
    return row;
  },
  async get(id: number): Promise<FineImportFile | undefined> {
    const [row] = await db.select().from(fineImportFiles).where(eq(fineImportFiles.id, id));
    return row;
  },
  async list(limit = 100): Promise<FineImportFile[]> {
    return db.select().from(fineImportFiles).orderBy(desc(fineImportFiles.receivedAt), desc(fineImportFiles.id)).limit(limit);
  },
  async create(data: typeof fineImportFiles.$inferInsert): Promise<FineImportFile> {
    const [row] = await db.insert(fineImportFiles).values(data).returning();
    return row;
  },
  async update(id: number, patch: Partial<typeof fineImportFiles.$inferInsert>): Promise<FineImportFile | undefined> {
    const [row] = await db.update(fineImportFiles).set(patch).where(eq(fineImportFiles.id, id)).returning();
    return row;
  },
  async remove(id: number): Promise<void> {
    await db.delete(fineImportFiles).where(eq(fineImportFiles.id, id));
  },
};
