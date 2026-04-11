import { createDatabase } from 'db0';
import sqlite from 'db0/connectors/better-sqlite3';

export const db = createDatabase(sqlite({
  path: './data/devflare.db',
}));

// Initialize database schema
export async function initDatabase() {
  // Create users table
  await db.sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    avatar TEXT,
    createdAt TEXT NOT NULL
  )`;

  // Create projects table
  await db.sql`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    repoUrl TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
  )`;

  // Create deployments table
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

// Initialize on module load
initDatabase().catch(console.error);
