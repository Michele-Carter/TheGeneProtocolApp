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

const CODE_SUBTITLE =
    "We've sent a code to your email - to continue, enter the code from that email. It can take a few minutes to arrive, so check your Junk and Spam folders too. For Outlook and Hotmail addresses it can take a couple of hours, because of the spam protection they use.";

const SetBrandName = createContext<(name: string | null) => void>(() => {});

// Set to the shop's name once it's known (null = PepBiz itself).
export const useSetClerkBrandName = () => useContext(SetBrandName);

export function BrandedClerkProvider({
    children,
    ...props
}: React.ComponentProps<typeof ClerkProvider>) {
    const [brandName, setBrandName] = useState<string | null>(null);
    const localization = useMemo(() => {
        const named = withName(enUS, brandName ?? "PepBiz") as Localization;
        // Manage account -> "Connected accounts" doesn't say what it's for: it links a Google account, so the person
        // can sign in with Google instead of an emailed code.
        const start = named.userProfile?.start;
        // Emailed codes can be slow or land in Junk, especially at Outlook/Hotmail addresses - say so on every
        // "enter the code" screen (shop customers and business owners alike). Replaces Clerk's own line under
        // "Check your email"; Clerk still shows the email address underneath.
        return {
            ...named,
            signUp: {
                ...named.signUp,
                emailCode: { ...named.signUp?.emailCode, subtitle: CODE_SUBTITLE },
            },
            signIn: {
                ...named.signIn,
                emailCode: { ...named.signIn?.emailCode, subtitle: CODE_SUBTITLE },
                emailCodeMfa: { ...named.signIn?.emailCodeMfa, subtitle: CODE_SUBTITLE },
            },
            reverification: {
                ...named.reverification,
                emailCode: { ...named.reverification?.emailCode, subtitle: CODE_SUBTITLE },
            },
            userProfile: {
                ...named.userProfile,
                start: {
                    ...start,
                    connectedAccountsSection: {
                        ...start?.connectedAccountsSection,
                        title: "Sign in with Google",
                        primaryButton: "Link your Google account",
                    },
                },
            },
        } as Localization;
    }, [brandName]);

    return (
        <ClerkProvider {...props} localization={localization}>
            <SetBrandName.Provider value={setBrandName}>{children}</SetBrandName.Provider>
        </ClerkProvider>
    );
}
