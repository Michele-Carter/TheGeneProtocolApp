// Sends a request with the user's sign-in pass. Passes only last a minute, so one can run out between being
// handed over and the server checking it (a slow connection, a computer waking from sleep): a request turned
// away as signed out is sent once more with a new pass. Returns null when there's no pass (signed out).
// The server checks the pass before doing anything else, so a refused request never did anything.
export async function signedInFetch(
  getToken: () => Promise<string | null>,
  send: (token: string) => Promise<Response>
): Promise<Response | null> {
  const token = await getToken();
  if (!token) return null;
  const response = await send(token);
  if (response.status !== 401) return response;
  const fresh = await getToken(); // the old pass has run out, so this is a new one
  return fresh ? send(fresh) : response;
}
