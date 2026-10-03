import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { createClerkClient, type User } from "@clerk/backend";
import { isAdminUserId } from "./admin.js";
import { getDb } from "./db.js";
import { customers, sales } from "./schema.js";
import { toAddress } from "../../shared/customers.js";

type Db = ReturnType<typeof getDb>;
type CustomerRow = typeof customers.$inferSelect;

function clerk() {
    return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
}

function loginDetails(user: User) {
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
    const email = (primary?.emailAddress ?? "").toLowerCase();
    return {
        email,
        verified: primary?.verification?.status === "verified",
        name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || email.split("@")[0] || "Customer",
    };
}

// Gives a registered app user their customer record: links them to an existing customer with the same
// (verified) email - e.g. one set up from past orders - otherwise creates one from their login details.
async function linkOrCreate(db: Db, user: User): Promise<CustomerRow> {
    const { email, verified, name } = loginDetails(user);

    if (email && verified) {
        const [match] = await db
            .select()
            .from(customers)
            .where(and(isNull(customers.clerkUserId), sql`lower(${customers.email}) = ${email}`))
            .orderBy(asc(customers.createdAt))
            .limit(1);
        if (match) {
            const [linked] = await db
                .update(customers)
                .set({ clerkUserId: user.id, updatedAt: new Date() })
                .where(and(eq(customers.id, match.id), isNull(customers.clerkUserId)))
                .returning();
            if (linked) return linked;
        }
    }

    const [created] = await db
        .insert(customers)
        .values({ id: crypto.randomUUID(), clerkUserId: user.id, name, email })
        .onConflictDoNothing()
        .returning();
    if (created) return created;

    // Another request created it at the same moment.
    const [raced] = await db.select().from(customers).where(eq(customers.clerkUserId, user.id));
    return raced;
}

// The signed-in user's customer record, created on first use.
export async function customerForUser(db: Db, userId: string): Promise<CustomerRow> {
    const [existing] = await db.select().from(customers).where(eq(customers.clerkUserId, userId));
    if (existing) return existing;
    return linkOrCreate(db, await clerk().users.getUser(userId));
}

// After the owner saves a customer with an email: links the app login registered with that (verified) email.
// If the login already has its own record that the app created automatically (no orders yet), that record is
// folded into this one, keeping any address the customer entered. A login whose record has orders is left
// alone - that's a real duplicate for the owner to merge.
export async function linkCustomerByEmail(db: Db, customer: CustomerRow): Promise<CustomerRow> {
    const email = customer.email.trim().toLowerCase();
    if (customer.clerkUserId || !email) return customer;

    const { data } = await clerk().users.getUserList({ emailAddress: [email], limit: 1 });
    const user = data[0];
    if (!user || isAdminUserId(user.id)) return customer;
    const verified = user.emailAddresses.some(
        (e) => e.emailAddress.toLowerCase() === email && e.verification?.status === "verified"
    );
    if (!verified) return customer;

    return db.transaction(async (tx) => {
        const [other] = await tx.select().from(customers).where(eq(customers.clerkUserId, user.id)).for("update");
        if (other) {
            const [order] = await tx.select({ id: sales.id }).from(sales).where(eq(sales.customerId, other.id)).limit(1);
            if (order) return customer;
            await tx.delete(customers).where(eq(customers.id, other.id));
        }
        const ownAddress = toAddress(customer.shippingAddress);
        const [linked] = await tx
            .update(customers)
            .set({
                clerkUserId: user.id,
                shippingAddress: !ownAddress.line1.trim() && other ? toAddress(other.shippingAddress) : ownAddress,
                updatedAt: new Date(),
            })
            .where(and(eq(customers.id, customer.id), isNull(customers.clerkUserId)))
            .returning();
        return linked ?? customer;
    });
}

// Makes sure every registered app user (except the owner) has a customer record, so the admin
// Customers list shows everyone who can log in - not just people who've opened their account page.
export async function syncCustomersFromLogins(db: Db) {
    const linked = new Set(
        (await db.select({ id: customers.clerkUserId }).from(customers).where(isNotNull(customers.clerkUserId))).map((r) => r.id)
    );
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
        const page = await clerk().users.getUserList({ limit: pageSize, offset });
        for (const user of page.data) {
            if (linked.has(user.id) || isAdminUserId(user.id)) continue;
            await linkOrCreate(db, user);
        }
        if (page.data.length < pageSize) break;
    }
}
