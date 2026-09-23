export function sendJson(res: any, status: number, data: unknown) {
    res.status(status).json(data);
}

export async function parseJsonBody(req: any): Promise<unknown> {
    if (req.body && typeof req.body === "object") {
        return req.body;
    }

    if (typeof req.body === "string" && req.body.length > 0) {
        return JSON.parse(req.body);
    }

    return {};
}