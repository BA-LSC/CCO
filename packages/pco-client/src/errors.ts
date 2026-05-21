type PcoErrorBody = {
  errors?: Array<{
    code?: string;
    detail?: string;
    status?: string;
  }>;
};

export function parsePcoErrorMessage(raw: string): string {
  try {
    const body = JSON.parse(raw) as PcoErrorBody;
    const first = body.errors?.[0];
    if (!first) return raw;

    if (raw.includes("TRASH_PANDA")) {
      return (
        "Your Planning Center account does not have Groups access on this token. " +
        "After a church admin enables Groups, click Reconnect Planning Center (sign out and authorize again) " +
        "so CCO receives a new token."
      );
    }

    return first.detail ?? first.code ?? raw;
  } catch {
    if (raw.includes("TRASH_PANDA")) {
      return (
        "Planning Center denied access to this product on your current token. " +
        "Use Reconnect Planning Center after permissions are updated."
      );
    }
    return raw;
  }
}

export class PcoApiError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(parsePcoErrorMessage(body));
    this.name = "PcoApiError";
    this.status = status;
  }
}
