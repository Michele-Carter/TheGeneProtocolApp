import React, { useEffect, useState } from "react";
import { SignInButton, SignUpButton } from "@clerk/react";
import FrontPage from "./FrontPage";
import LoadingSpinner from "./LoadingSpinner";
import type { BusinessInfo } from "../../shared/billing";
import { businessApi, cacheShop, rememberedShop, shopSlug, showShopInAddress, wantsToStartBusiness } from "../lib/business";
import { useSetClerkBrandName } from "../lib/clerkBranding";
import { PEPBIZ_ICON, setTabBranding } from "../lib/tabBranding";

// Sign in / register. Arriving from a shop link shows that shop's name and logo; arriving from /start
// is someone setting up their own business.
export default function AuthPage() {
    const starting = wantsToStartBusiness();
    // Shop links show the shop's own branding (or none), never PepBiz's - here and in Clerk's windows.
    const onShopLink = !!shopSlug() && !starting;
    const [shop, setShop] = useState<BusinessInfo | null>(() => (onShopLink ? rememberedShop() : null));
    const [shopLoading, setShopLoading] = useState(onShopLink && !shop);
    const setClerkBrandName = useSetClerkBrandName();

    useEffect(() => {
        if (shop) setClerkBrandName(shop.name);
    }, [shop, setClerkBrandName]);

    useEffect(() => {
        // A returning customer who typed plain pepbiz.io still sees their shop's link.
        if (onShopLink) showShopInAddress(shopSlug());
    }, [onShopLink]);

    useEffect(() => {
        if (!onShopLink) setTabBranding("PepBiz", PEPBIZ_ICON);
        else setTabBranding(shop?.name ?? "Welcome", shop?.logoUrl ?? null, shopSlug());
    }, [onShopLink, shop]);

    useEffect(() => {
        const slug = shopSlug();
        if (!slug || starting) return;
        businessApi
            .shop(slug)
            .then((found) => {
                setShop(found);
                cacheShop(slug, found);
            })
            .catch(() => {})
            .finally(() => setShopLoading(false));
    }, [starting]);

    // Plain pepbiz.io: the front page, which explains PepBiz and leads to registering or signing in.
    if (!onShopLink && !starting) return <FrontPage />;


    // On a shop link, a neutral "Welcome" until the shop's name is known - never "PepBiz".
    const eyebrow = starting ? "PepBiz for business" : (shop?.name ?? "\u00a0");
    const title = starting ? "Create your account to set up your business" : shop ? `Welcome to ${shop.name}` : "Welcome";
    const blurb = starting
        ? "Register with your email (or sign in if you already have a PepBiz account). Next you'll name your business and choose your shop link."
        : "Use Register to create a new account, or Sign In if you already have one.";

    // Same colours as Clerk's sign-in window (see clerkAppearance in main.tsx), so the two look like one.
    return (
        <div className="min-h-dvh relative flex items-center justify-center bg-[#09090B] px-4 py-6 sm:py-10 overflow-hidden">
            {/* Soft gold glows behind the card so the page doesn't look flat. */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        "radial-gradient(38rem 32rem at 22% 55%, rgba(194, 145, 31, 0.13), transparent 70%)," +
                        "radial-gradient(34rem 30rem at 80% 45%, rgba(122, 90, 20, 0.16), transparent 70%)," +
                        "radial-gradient(50rem 24rem at 50% 0%, rgba(219, 169, 49, 0.05), transparent 70%)",
                }}
            />
            {/* On a shop link, just a spinner until the shop's name and logo are known. */}
            {shopLoading ? (
                <LoadingSpinner label="Loading..." className="relative z-10" />
            ) : (
                <div className="relative z-10 w-full max-w-lg bg-[#18181B]/90 backdrop-blur-md border border-zinc-800 rounded-[1.6rem] p-5 sm:p-8 shadow-2xl">
                    {onShopLink ? (
                        shop?.logoUrl && (
                            <div className="flex justify-center mb-4">
                                <img src={shop.logoUrl} alt="" className="h-16 w-16 object-contain rounded-2xl" />
                            </div>
                        )
                    ) : (
                        <div className="flex justify-center mb-4">
                            <img
                                src={PEPBIZ_ICON}
                                alt="PepBiz"
                                className="h-20 w-20 object-contain drop-shadow-[0_0_18px_rgba(219,169,49,0.35)]"
                            />
                        </div>
                    )}
                    <div className="text-center space-y-2.5 sm:space-y-3">
                        <p className="text-xs uppercase tracking-[0.3em] text-gold-400 font-bold">{eyebrow}</p>
                        <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">{title}</h1>
                        <p className="text-[#E5E7EB] text-sm sm:text-base">{blurb}</p>
                    </div>

                    <div className="mt-6 sm:mt-8 grid gap-3.5 sm:gap-4">
                        <SignInButton mode="modal">
                            <button
                                className="w-full rounded-xl px-4 py-3 text-sm font-bold bg-gold-500 text-black hover:bg-gold-400 transition-colors shadow-[0_8px_24px_-6px_rgba(194,145,31,0.55)]"
                            >
                                Sign In
                            </button>
                        </SignInButton>
                        <SignUpButton mode="modal">
                            <button
                                className="w-full rounded-xl px-4 py-3 text-sm font-bold bg-[#232329] text-[#E5E7EB] hover:text-gold-300 transition-colors"
                            >
                                Register
                            </button>
                        </SignUpButton>
                    </div>
                    {/* A shop link shows the shop's own privacy notice; PepBiz's page shows PepBiz's policies. */}
                    <p className="mt-5 text-center text-xs text-zinc-500 space-x-3">
                        {onShopLink ? (
                            shop && (
                                <a href={`/shop/${shop.slug}/privacy`} target="_blank" rel="noreferrer" className="hover:text-zinc-300">
                                    Privacy Notice
                                </a>
                            )
                        ) : (
                            <>
                                <a href="/privacy" target="_blank" rel="noreferrer" className="hover:text-zinc-300">
                                    Privacy Policy
                                </a>
                                <a href="/terms" target="_blank" rel="noreferrer" className="hover:text-zinc-300">
                                    Terms of Service
                                </a>
                            </>
                        )}
                    </p>
                </div>
            )}
        </div>
    );
}
