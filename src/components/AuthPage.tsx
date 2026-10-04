import React, { useEffect, useState } from "react";
import { SignInButton, SignUpButton } from "@clerk/react";
import type { BusinessInfo } from "../../shared/billing";
import { businessApi, shopSlug, wantsToStartBusiness } from "../lib/business";

// Sign in / register. Arriving from a shop link shows that shop's name and logo; arriving from /start
// is someone setting up their own business.
export default function AuthPage() {
    const [shop, setShop] = useState<BusinessInfo | null>(null);
    const starting = wantsToStartBusiness();

    useEffect(() => {
        const slug = shopSlug();
        if (!slug || starting) return;
        businessApi.shop(slug).then(setShop).catch(() => setShop(null));
    }, [starting]);

    const eyebrow = starting ? "PepPal for business" : shop ? shop.name : "PepPal";
    const title = starting
        ? "Create your account to set up your business"
        : shop
          ? `Welcome to ${shop.name}`
          : "Register a new account or sign in if you already have one";
    const blurb = starting
        ? "Register with your email (or sign in if you already have a PepPal account). Next you'll name your business and choose your shop link."
        : "Use Register to create a new account, or Sign In if you already have one. Registration and password recovery are handled by Clerk automatically.";

    return (
        <div className="min-h-dvh relative flex items-center justify-center bg-zinc-950 px-4 py-6 sm:py-10 overflow-hidden">
            <div className="absolute top-0 left-0 w-[25rem] h-[25rem] bg-zinc-400/5 rounded-full blur-[120px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-[25rem] h-[25rem] bg-neutral-400/5 rounded-full blur-[120px] pointer-events-none translate-x-1/2 translate-y-1/2" />

            <div className="relative z-10 w-full max-w-lg bg-zinc-900/95 border border-zinc-800 rounded-[2rem] p-5 sm:p-8 shadow-2xl">
                {shop?.logoUrl && !starting && (
                    <div className="flex justify-center mb-4">
                        <img src={shop.logoUrl} alt="" className="h-16 w-16 object-contain rounded-2xl" />
                    </div>
                )}
                <div className="text-center space-y-2.5 sm:space-y-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-gold-400 font-bold">{eyebrow}</p>
                    <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">{title}</h1>
                    <p className="text-zinc-400 text-sm sm:text-base">{blurb}</p>
                </div>

                <div className="mt-6 sm:mt-8 grid gap-3.5 sm:gap-4">
                    <SignInButton mode="modal">
                        <button className="app-action-button w-full rounded-2xl px-4 py-3 text-sm font-bold">
                            Sign In
                        </button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                        <button className="app-action-button w-full rounded-2xl px-4 py-3 text-sm font-bold">
                            Register
                        </button>
                    </SignUpButton>
                </div>

                <div className="mt-5 sm:mt-6 rounded-3xl bg-zinc-950/80 border border-zinc-800 p-4 text-sm text-zinc-300">
                    <p className="font-semibold text-zinc-100">Forgot password?</p>
                    <p className="mt-2 text-zinc-400 text-sm">Use the Sign In button and select the "Forgot password" link on the Clerk sign-in form to reset your password.</p>
                </div>
            </div>
        </div>
    );
}
