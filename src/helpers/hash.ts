/**
 * Password Hashing Helpers — Harsh Makeovers
 *
 * Uses bcrypt to securely hash and compare passwords.
 *
 * Why bcrypt?
 *   - It's slow ON PURPOSE — makes brute-force attacks extremely hard.
 *   - It adds a random "salt" to each password, so even if two users have the
 *     same password, their hashes will be different.
 *
 * How it works:
 *   1. User signs up → we hash their password → store the hash in the database.
 *   2. User logs in → we compare their typed password against the stored hash.
 *   3. We NEVER store the actual password — only the hash.
 */

import bcrypt from "bcrypt";

// Number of salt rounds. Higher = more secure but slower.
// 10 is the standard — good balance of security and speed.
const SALT_ROUNDS = 10;

/**
 * Takes a plain text password and returns a hashed version.
 * Used during registration and password changes.
 *
 * Example: "MyPassword123!" → "$2b$10$X7K3v..."
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * Compares a plain text password with a stored hash.
 * Returns true if they match, false if they don't.
 * Used during login to verify credentials.
 *
 * Example: comparePassword("MyPassword123!", "$2b$10$X7K3v...") → true
 */
export async function comparePassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}
