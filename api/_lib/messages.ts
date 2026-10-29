import { get, put } from "@vercel/blob";
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { afterSave, currentBusiness, type Db } from "./business.js";
import { alertCustomer, alertCustomers, alertNewMessage } from "./orderAlerts.js";
import { customers, messages, shopOrders } from "./schema.js";
import {
    MAX_GROUP_RECIPIENTS,
    MAX_MESSAGE_FILE_BYTES,
    MAX_MESSAGE_LENGTH,
    MESSAGE_FILE_TYPES,
    type ChatMessage,
    type Conversation,
    type MessageAttachment,
} from "../../shared/shop.js";

// Messages between a shop and its customers. Everything here runs as one business (api/_lib/business.ts), so it
// only ever sees that business's customers and messages. One conversation per customer; either side can start it.

type Sender = "customer" | "owner";
const other = (side: Sender): Sender => (side === "customer" ? "owner" : "customer");

// A customer can't send more than this many messages an hour (stops a runaway or abusive sender).
const CUSTOMER_MESSAGES_PER_HOUR = 30;

export class MessageError extends Error {}

// Photos and PDFs sent in messages live in their own PRIVATE Blob store (not the public one product photos use),
// under messages/<business>/<customer>/. Nobody can open one by its link - the app reads it and hands it only to
// the shop's owner or that customer. Set up in Vercel: Storage -> a private Blob store connected with the
// prefix MESSAGE_FILES, which gives MESSAGE_FILES_READ_WRITE_TOKEN.
export function messageFilesToken(): string | null {
    return process.env.MESSAGE_FILES_READ_WRITE_TOKEN || null;
}

const FILE_DATA_URL = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/;
const EXTENSIONS: Record<MessageAttachment["type"], string> = {
    "image/webp": "webp",
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/pdf": "pdf",
};

export interface AttachmentUpload {
    dataUrl: string;
    name: string;
}

function readAttachment(upload: AttachmentUpload) {
    const match = FILE_DATA_URL.exec(upload.dataUrl);
    const type = match?.[1] as MessageAttachment["type"] | undefined;
    if (!match || !type || !MESSAGE_FILE_TYPES.includes(type)) {
        throw new MessageError("You can send photos (JPEG, PNG or WebP) and PDFs.");
    }
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length === 0) throw new MessageError("That file is empty.");
    if (bytes.length > MAX_MESSAGE_FILE_BYTES) throw new MessageError("That file is too large (3 MB at most).");
    // Keep the name readable but harmless; it's only ever shown, never used as a path.
    let name = upload.name.replace(/[\u0000-\u001f\\/]/g, "").trim().slice(0, 120);
    if (!name) name = type === "application/pdf" ? "Document.pdf" : "Photo";
    return { type, bytes, name };
}

function attachmentOf(m: typeof messages.$inferSelect): MessageAttachment | null {
    if (!m.attachmentUrl || !m.attachmentType) return null;
    return { name: m.attachmentName ?? "File", type: m.attachmentType as MessageAttachment["type"], size: m.attachmentSize ?? 0 };
}

// How a message reads in a notification or the inbox list: its text, or what was sent.
function previewOf(body: string, attachment: { name: string; type: string } | null): string {
    if (body) return body.length > 140 ? `${body.slice(0, 137)}...` : body;
    if (!attachment) return "";
    return attachment.type === "application/pdf" ? `Sent a file: ${attachment.name}` : "Sent a photo";
}

// The file sent with one message, for someone allowed to see it: the owner (customerId null - the business's own
// messages only) or the customer whose conversation it's in. Null if there's no such file.
export async function messageFile(db: Db, messageId: string, customerId: string | null) {
    const [m] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.id, messageId), customerId ? eq(messages.customerId, customerId) : undefined));
    const token = messageFilesToken();
    if (!m?.attachmentUrl || !token) return null;
    const file = await get(m.attachmentUrl, { access: "private", token });
    if (!file || file.statusCode !== 200) return null;
    const bytes = Buffer.from(await new Response(file.stream).arrayBuffer());
    return { bytes, type: m.attachmentType ?? file.blob.contentType, name: m.attachmentName ?? "file" };
}

// Answers a request for a message's file: the file itself, kept out of shared caches, or 404.
export async function sendMessageFile(res: any, db: Db, messageId: string, customerId: string | null) {
    const file = await messageFile(db, messageId, customerId);
    if (!file) return res.status(404).json({ error: "That file isn't available." });
    res.setHeader("Content-Type", file.type);
    res.setHeader("Content-Length", String(file.bytes.length));
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(file.bytes);
}

// The owner sends the same message to several customers, or to "all" of them. Each gets their own copy in their own
// conversation - they never see who else got it, and a reply comes back in that customer's own conversation. Only
// customers with a login can read messages. Chosen customers are capped at MAX_GROUP_RECIPIENTS (so ticking can't
// flood a list by mistake); "all" is the owner's deliberate choice and isn't. Returns how many it went to.
export async function sendGroupMessage(db: Db, to: string[] | "all", text: string): Promise<number> {
    const body = text.trim();
    if (!body) throw new MessageError("Type a message first.");
    if (body.length > MAX_MESSAGE_LENGTH) throw new MessageError(`Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);

    let ids: string[];
    if (to === "all") {
        const rows = await db.select({ id: customers.id }).from(customers).where(isNotNull(customers.clerkUserId));
        ids = rows.map((r) => r.id);
        if (ids.length === 0) throw new MessageError("None of your customers have signed up in your shop yet.");
    } else {
        ids = Array.from(new Set(to));
        if (ids.length === 0) throw new MessageError("Choose who to send it to.");
        if (ids.length > MAX_GROUP_RECIPIENTS) {
            throw new MessageError(`Up to ${MAX_GROUP_RECIPIENTS} chosen customers at a time - use Message all to reach everyone.`);
        }
        const found = await db
            .select({ id: customers.id, clerkUserId: customers.clerkUserId })
            .from(customers)
            .where(inArray(customers.id, ids));
        if (found.length !== ids.length) throw new MessageError("Some of those customers no longer exist - refresh and try again.");
        if (found.some((c) => !c.clerkUserId)) {
            throw new MessageError("Only customers who have signed up in your shop can get messages.");
        }
    }

    await db
        .insert(messages)
        .values(ids.map((customerId) => ({ id: crypto.randomUUID(), customerId, sender: "owner" as const, body })));
    // A new message brings an archived conversation back to the inbox, as for a single message.
    await db.update(customers).set({ messagesArchivedAt: null }).where(inArray(customers.id, ids));

    const business = currentBusiness();
    if (business) {
        const preview = body.length > 140 ? `${body.slice(0, 137)}...` : body;
        afterSave(() =>
            alertCustomers(business, ids, {
                title: `New message from ${business.name}`,
                body: preview,
                shopOrderId: null,
                url: `/shop/${business.slug}?open=messages`,
                tag: "messages",
            })
        );
    }
    return ids.length;
}

// One customer's conversation, oldest first.
export async function conversation(db: Db, customerId: string): Promise<ChatMessage[]> {
    const rows = await db
        .select({ message: messages, orderNumber: shopOrders.orderNumber })
        .from(messages)
        .leftJoin(shopOrders, eq(shopOrders.id, messages.shopOrderId))
        .where(eq(messages.customerId, customerId))
        .orderBy(asc(messages.createdAt));
    return rows.map(({ message: m, orderNumber }) => ({
        id: m.id,
        from: m.sender as Sender,
        body: m.body,
        attachment: attachmentOf(m),
        shopOrderId: m.shopOrderId,
        orderNumber: orderNumber ?? null,
        read: m.readAt != null,
        createdAt: m.createdAt.toISOString(),
    }));
}

// Messages from the other side that this side hasn't read yet (customerId: just that customer's conversation).
export async function unreadCount(db: Db, reader: Sender, customerId?: string): Promise<number> {
    const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .where(
            and(
                eq(messages.sender, other(reader)),
                isNull(messages.readAt),
                customerId ? eq(messages.customerId, customerId) : undefined
            )
        );
    return row?.n ?? 0;
}

export async function markRead(db: Db, reader: Sender, customerId: string) {
    await db
        .update(messages)
        .set({ readAt: new Date() })
        .where(and(eq(messages.customerId, customerId), eq(messages.sender, other(reader)), isNull(messages.readAt)));
}

// Sends a message and tells the other side (phone/computer notification, once it's saved). A message about an
// order must be about one of this customer's orders. Any new message brings an archived conversation back.
// It can carry one photo or PDF, in which case the text can be left empty.
export async function sendMessage(
    db: Db,
    m: { customerId: string; sender: Sender; body: string; shopOrderId?: string | null; attachment?: AttachmentUpload | null }
): Promise<ChatMessage> {
    const body = m.body.trim();
    const file = m.attachment ? readAttachment(m.attachment) : null;
    if (!body && !file) throw new MessageError("Type a message first.");
    if (body.length > MAX_MESSAGE_LENGTH) throw new MessageError(`Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);
    if (file && !messageFilesToken()) throw new MessageError("Sending photos and files isn't set up yet - send a message instead.");

    const [customer] = await db.select().from(customers).where(eq(customers.id, m.customerId));
    if (!customer) throw new MessageError("We couldn't find that customer.");

    let orderNumber: number | null = null;
    if (m.shopOrderId) {
        const [order] = await db
            .select({ orderNumber: shopOrders.orderNumber })
            .from(shopOrders)
            .where(and(eq(shopOrders.id, m.shopOrderId), eq(shopOrders.customerId, m.customerId)));
        if (!order) throw new MessageError("That order isn't one of this customer's.");
        orderNumber = order.orderNumber;
    }

    if (m.sender === "customer") {
        const [recent] = await db
            .select({ n: sql<number>`count(*)::int` })
            .from(messages)
            .where(
                and(
                    eq(messages.customerId, m.customerId),
                    eq(messages.sender, "customer"),
                    gt(messages.createdAt, new Date(Date.now() - 60 * 60 * 1000))
                )
            );
        if ((recent?.n ?? 0) >= CUSTOMER_MESSAGES_PER_HOUR) {
            throw new MessageError("You've sent a lot of messages in the last hour - please wait a little before sending more.");
        }
    }

    const business = currentBusiness();
    const id = crypto.randomUUID();
    let stored: { url: string } | null = null;
    if (file) {
        try {
            stored = await put(`messages/${business?.id ?? "unknown"}/${m.customerId}/${id}.${EXTENSIONS[file.type]}`, file.bytes, {
                access: "private",
                contentType: file.type,
                token: messageFilesToken()!,
            });
        } catch (error) {
            console.error("Message file upload failed:", error);
            throw new MessageError("That file couldn't be sent - please try again.");
        }
    }

    const [row] = await db
        .insert(messages)
        .values({
            id,
            customerId: m.customerId,
            sender: m.sender,
            body,
            shopOrderId: m.shopOrderId ?? null,
            attachmentUrl: stored?.url ?? null,
            attachmentName: file?.name ?? null,
            attachmentType: file?.type ?? null,
            attachmentSize: file?.bytes.length ?? null,
        })
        .returning();
    if (customer.messagesArchivedAt) {
        await db.update(customers).set({ messagesArchivedAt: null }).where(eq(customers.id, customer.id));
    }

    if (business) {
        const preview = previewOf(body, file);
        const about = orderNumber ? `About order #${orderNumber}: ` : "";
        if (m.sender === "customer") {
            afterSave(() => alertNewMessage(business, { customerId: customer.id, customerName: customer.name, preview: about + preview }));
        } else {
            afterSave(() =>
                alertCustomer(business, customer.id, {
                    title: `New message from ${business.name}`,
                    body: about + preview,
                    shopOrderId: null,
                    url: `/shop/${business.slug}?open=messages`,
                    tag: "messages",
                })
            );
        }
    }

    return {
        id: row.id,
        from: m.sender,
        body: row.body,
        attachment: attachmentOf(row),
        shopOrderId: row.shopOrderId,
        orderNumber,
        read: false,
        createdAt: row.createdAt.toISOString(),
    };
}

// The owner's inbox: every customer they've exchanged messages with, newest conversation first.
export async function conversations(db: Db): Promise<Conversation[]> {
    const rows = await db.execute<{
        customer_id: string;
        name: string;
        email: string;
        archived: boolean;
        body: string;
        attachment_name: string | null;
        attachment_type: string | null;
        sender: Sender;
        created_at: Date | string;
        unread: number;
    }>(sql`
        select distinct on (m.customer_id)
               m.customer_id, c.name, c.email, (c.messages_archived_at is not null) as archived,
               m.body, m.attachment_name, m.attachment_type, m.sender, m.created_at,
               (select count(*)::int from ${messages} u
                 where u.customer_id = m.customer_id and u.sender = 'customer' and u.read_at is null) as unread
        from ${messages} m
        join ${customers} c on c.id = m.customer_id
        order by m.customer_id, m.created_at desc`);
    return [...rows]
        .map((r) => ({
            customerId: r.customer_id,
            customerName: r.name,
            customerEmail: r.email,
            lastMessage: {
                body: r.body || previewOf("", r.attachment_type ? { name: r.attachment_name ?? "File", type: r.attachment_type } : null),
                from: r.sender,
                createdAt: new Date(r.created_at).toISOString(),
            },
            unread: Number(r.unread),
            archived: Boolean(r.archived),
        }))
        .sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt));
}

export async function setArchived(db: Db, customerId: string, archived: boolean) {
    await db
        .update(customers)
        .set({ messagesArchivedAt: archived ? new Date() : null })
        .where(eq(customers.id, customerId));
}
