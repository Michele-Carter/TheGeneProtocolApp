import React from "react";
import { SignInButton, SignUpButton } from "@clerk/react";

export default function AuthPage() {
    return (
        <div className="min-h-dvh relative flex items-center justify-center bg-zinc-950 px-4 py-6 sm:py-10 overflow-hidden">
            <div className="absolute top-0 left-0 w-[25rem] h-[25rem] bg-zinc-400/5 rounded-full blur-[120px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-[25rem] h-[25rem] bg-neutral-400/5 rounded-full blur-[120px] pointer-events-none translate-x-1/2 translate-y-1/2" />

            <div className="relative z-10 w-full max-w-lg bg-zinc-900/95 border border-zinc-800 rounded-[2rem] p-5 sm:p-8 shadow-2xl">
                <div className="text-center space-y-2.5 sm:space-y-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-gold-400 font-bold">PepPal Authentication</p>
                    <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">Register a new account or sign in if you already have one</h1>
                    <p className="text-zinc-400 text-sm sm:text-base">Use Register to create a new account, or Sign In if you already have one. Registration and password recovery are handled by Clerk automatically.</p>
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
