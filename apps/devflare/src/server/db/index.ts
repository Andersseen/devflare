import { createDatabase } from 'db0';
import sqlite from 'db0/connectors/better-sqlite3';

export const db = createDatabase(sqlite({
  path: './data/devflare.db',
}));

// better-auth gestiona la tabla users automáticamente.
// Solo inicializamos las tablas propias de devflare.
export async function initDatabase() {
  await db.sql`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    repoUrl TEXT,
    createdAt TEXT NOT NULL
  )`;

  await db.sql`CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    status TEXT NOT NULL,
    commitSha TEXT,
    previewUrl TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (projectId) REFERENCES projects(id)
  )`;
}

initDatabase().catch(console.error);
