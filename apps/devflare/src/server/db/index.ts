import { createDatabase } from 'db0';
import sqlite from 'db0/connectors/better-sqlite3';
import { resolve } from 'node:path';

function getDbPath(): string {
  const cwd = process.cwd();
  return cwd.includes('apps/devflare')
    ? resolve(cwd, '../../data/devflare.db')
    : resolve(cwd, 'data/devflare.db');
}

export const db = createDatabase(
  sqlite({
    path: getDbPath(),
  }),
);

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
