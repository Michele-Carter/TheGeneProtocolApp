import React, { useEffect, useState } from "react";
import { SignInButton, SignUpButton } from "@clerk/react";
import type { BusinessInfo } from "../../shared/billing";
import { businessApi, shopSlug, wantsToStartBusiness } from "../lib/business";
import { useSetClerkBrandName } from "../lib/clerkBranding";

// The last shop shown, so a returning customer sees their shop straight away instead of waiting for it to load.
const SHOP_CACHE_KEY = "peppal.shopInfo.v1";
function cachedShop(slug: string | null): BusinessInfo | null {
    if (!slug) return null;
    try {
        const saved = JSON.parse(window.localStorage.getItem(SHOP_CACHE_KEY) || "null");
        return saved?.slug === slug ? (saved.info as BusinessInfo) : null;
    } catch {
        return null;
    }
}
function cacheShop(slug: string, info: BusinessInfo) {
    try {
        window.localStorage.setItem(SHOP_CACHE_KEY, JSON.stringify({ slug, info }));
    } catch {
        // Only means the next visit waits for the shop to load.
    }
}

// Sign in / register. Arriving from a shop link shows that shop's name and logo; arriving from /start
// is someone setting up their own business.
export default function AuthPage() {
    const starting = wantsToStartBusiness();
    // Shop links show the shop's own branding (or none), never PepBiz's - here and in Clerk's windows.
    const onShopLink = !!shopSlug() && !starting;
    const [shop, setShop] = useState<BusinessInfo | null>(() => (onShopLink ? cachedShop(shopSlug()) : null));
    const [shopLoading, setShopLoading] = useState(onShopLink && !shop);
    const setClerkBrandName = useSetClerkBrandName();

    useEffect(() => {
        if (shop) setClerkBrandName(shop.name);
    }, [shop, setClerkBrandName]);

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


    // On a shop link, a neutral "Welcome" until the shop's name is known - never "PepBiz".
    const eyebrow = starting ? "PepBiz for business" : onShopLink ? (shop?.name ?? "\u00a0") : "PepBiz";
    const title = starting
        ? "Create your account to set up your business"
        : onShopLink
          ? shop
              ? `Welcome to ${shop.name}`
              : "Welcome"
          : "Register a new account or sign in if you already have one";
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
                            src="/favicon.png"
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
                            disabled={shopLoading}
                            className="w-full rounded-xl px-4 py-3 text-sm font-bold bg-gold-500 text-black hover:bg-gold-400 transition-colors shadow-[0_8px_24px_-6px_rgba(194,145,31,0.55)] disabled:opacity-60"
                        >
                            Sign In
                        </button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                        <button
                            disabled={shopLoading}
                            className="w-full rounded-xl px-4 py-3 text-sm font-bold bg-[#232329] text-[#E5E7EB] hover:text-gold-300 transition-colors disabled:opacity-60"
                        >
                            Register
                        </button>
                    </SignUpButton>
                </div>
            </div>
        </div>
    );
}
