import { businessHeaders } from "./business";
import { signedInFetch } from "./signedInFetch";

type GetToken = () => Promise<string | null>;

export type UserStateScope = "protocol" | "tracking" | "reconstitution";

async function authedFetch(input: string, init: RequestInit, getToken: GetToken) {
    const response = await signedInFetch(getToken, (token) =>
        fetch(input, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                ...businessHeaders(),
                ...(init.headers ?? {}),
            },
        })
    );
    if (!response) {
        throw new Error("Unauthenticated request");
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed (${response.status}): ${errorText}`);
    }

    return response.json();
}

export async function getUserState<T>(scope: UserStateScope, getToken: GetToken): Promise<T | null> {
    const response = (await authedFetch(`/api/user-state/${scope}`, { method: "GET" }, getToken)) as {
        data: T | null;
    };

    return response.data ?? null;
}

export async function putUserState<T>(scope: UserStateScope, data: T, getToken: GetToken): Promise<void> {
    await authedFetch(
        `/api/user-state/${scope}`,
        {
            method: "PUT",
            body: JSON.stringify({ data }),
        },
        getToken
    );
}

export async function deleteUserState(scope: UserStateScope, getToken: GetToken): Promise<void> {
    await authedFetch(`/api/user-state/${scope}`, { method: "DELETE" }, getToken);
}