import React, { createContext, useContext, useMemo, useState } from "react";
import { ClerkProvider } from "@clerk/react";
import { enUS } from "@clerk/localizations";

// Clerk's sign-in/register windows say "Sign in to PepBiz", "to continue to PepBiz" etc. (the Clerk
// application's name). Customers must only ever see their shop's name, so on a shop link every
// {{applicationName}} in Clerk's English wording is swapped for the shop's name.

type Localization = typeof enUS;

function withName(value: unknown, name: string): unknown {
    if (typeof value === "string") return value.split("{{applicationName}}").join(name);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withName(inner, name)]));
    }
    return value;
}

const SetBrandName = createContext<(name: string | null) => void>(() => {});

// Called by the sign-in page once it knows which shop it's showing (null = PepBiz itself).
export const useSetClerkBrandName = () => useContext(SetBrandName);

export function BrandedClerkProvider({
    children,
    ...props
}: React.ComponentProps<typeof ClerkProvider>) {
    const [brandName, setBrandName] = useState<string | null>(null);
    const localization = useMemo(
        () => (brandName ? (withName(enUS, brandName) as Localization) : undefined),
        [brandName],
    );

    return (
        <ClerkProvider {...props} localization={localization}>
            <SetBrandName.Provider value={setBrandName}>{children}</SetBrandName.Provider>
        </ClerkProvider>
    );
}
