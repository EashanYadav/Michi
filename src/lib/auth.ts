import type { UserProfile } from "../types";

type AuthResponse = {
  user: UserProfile;
};

export async function getCurrentUser(): Promise<UserProfile | null> {
  const response = await fetch("/api/auth/me");

  if (response.status === 401) {
    return null;
  }

  const payload = await readJson<AuthResponse>(response);
  return payload.user;
}

export async function registerUser(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<UserProfile> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await readJson<AuthResponse>(response);
  return payload.user;
}

export async function loginUser(input: { email: string; password: string }): Promise<UserProfile> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await readJson<AuthResponse>(response);
  return payload.user;
}

export async function logoutUser(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  await readJson<{ ok: boolean }>(response);
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? "Request failed.");
  }

  return payload as T;
}
