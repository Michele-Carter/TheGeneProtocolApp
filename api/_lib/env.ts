import dotenv from "dotenv";

// Load local secrets for Vercel local development.
// In production, Vercel supplies environment variables directly.
dotenv.config({
    path: ".env.local",
    override: false,
});