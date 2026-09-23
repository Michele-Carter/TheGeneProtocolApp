import { PersistedProtocolBuilderPayload, ProtocolRecord } from "../types";

type GetToken = () => Promise<string | null>;

async function authedFetch(input: string, init: RequestInit, getToken: GetToken) {
  const token = await getToken();
  if (!token) {
    throw new Error("Unauthenticated request");
  }

  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed (${response.status}): ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function listProtocols(getToken: GetToken): Promise<ProtocolRecord[]> {
  return (await authedFetch("/api/protocols", { method: "GET" }, getToken)) as ProtocolRecord[];
}

export async function createProtocol(
  payload: { name: string; data?: PersistedProtocolBuilderPayload },
  getToken: GetToken
): Promise<ProtocolRecord> {
  return (await authedFetch(
    "/api/protocols",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    getToken
  )) as ProtocolRecord;
}

export async function updateProtocol(
  id: string,
  payload: { name?: string; data?: PersistedProtocolBuilderPayload },
  getToken: GetToken
): Promise<ProtocolRecord> {
  return (await authedFetch(
    `/api/protocols/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    getToken
  )) as ProtocolRecord;
}

export async function deleteProtocol(id: string, getToken: GetToken): Promise<void> {
  await authedFetch(
    `/api/protocols/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
    getToken
  );
}
