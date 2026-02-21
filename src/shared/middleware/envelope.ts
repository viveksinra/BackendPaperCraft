import type { Request, Response, NextFunction } from "express";

type FailOptions = {
  hint?: string;
  fields?: Record<string, string[]>;
  status?: number;
  meta?: Record<string, unknown>;
};

function buildMeta(res: Response, extra?: Record<string, unknown>) {
  return {
    requestId: res.locals.requestId,
    ts: new Date().toISOString(),
    ...(extra ?? {}),
  };
}

export function envelope(_req: Request, res: Response, next: NextFunction) {
  res.sendEnvelope = (message: string, variant: "success" | "error" | "info", myData?: unknown) => {
    if (res.headersSent) return res;
    const payload: Record<string, unknown> = { message, variant };
    if (typeof myData !== "undefined") {
      payload.myData = myData;
    }
    return res.json(payload);
  };

  res.ok = (message = "ok", myData?: unknown) => res.sendEnvelope(message, "success", myData);
  res.info = (message = "info", myData?: unknown) => res.sendEnvelope(message, "info", myData);

  res.success = (data?: unknown, message = "ok", meta?: Record<string, unknown>) => {
    if (res.headersSent) return res;
    return res.json({
      message,
      variant: "success",
      myData: data ?? null,
      meta: buildMeta(res, meta),
    });
  };

  res.fail = (
    codeOrMessage: string,
    messageOrData?: unknown,
    maybeOptions?: FailOptions | unknown
  ) => {
    if (res.headersSent) return res;

    const isModernSignature =
      typeof messageOrData === "string" || (maybeOptions && typeof maybeOptions === "object");

    if (isModernSignature) {
      const msg = typeof messageOrData === "string" ? messageOrData : "error";
      const options = (maybeOptions ?? {}) as FailOptions;
      const status = options.status ?? 400;
      return res.status(status).json({
        error: {
          code: codeOrMessage,
          message: msg,
          hint: options.hint,
          fields: options.fields,
        },
        meta: buildMeta(res, options.meta),
      });
    }

    return res.status(400).sendEnvelope(codeOrMessage || "error", "error", messageOrData);
  };

  next();
}
