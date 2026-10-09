import React, { createContext, useContext, useMemo, useState } from "react";
import { ClerkProvider } from "@clerk/react";
import { enUS } from "@clerk/localizations";

// Clerk's windows say "Sign in to <app name>", "to continue to <app name>" etc. The Clerk application's own
// name is kept neutral, because it also appears in Clerk's emails, which every shop's customers receive (custom
// email templates need Clerk's paid plan). So the name is always filled in here: the shop's name for its
// customers, PepBiz for business owners.

type Localization = typeof enUS;

function withName(value: unknown, name: string): unknown {
    if (typeof value === "string") return value.split("{{applicationName}}").join(name);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withName(inner, name)]));
    }
    return value;
}

const SetBrandName = createContext<(name: string | null) => void>(() => {});

// Set to the shop's name once it's known (null = PepBiz itself).
export const useSetClerkBrandName = () => useContext(SetBrandName);

export function BrandedClerkProvider({
    children,
    ...props
}: React.ComponentProps<typeof ClerkProvider>) {
    const [brandName, setBrandName] = useState<string | null>(null);
    const localization = useMemo(() => withName(enUS, brandName ?? "PepBiz") as Localization, [brandName]);

    return (
        <ClerkProvider {...props} localization={localization}>
            <SetBrandName.Provider value={setBrandName}>{children}</SetBrandName.Provider>
        </ClerkProvider>
    );
}
