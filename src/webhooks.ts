/**
 * Where the company's events are delivered: /webhooks.
 *
 * Company data, so every method takes company for one call over the
 * client's own. An endpoint receives the events of the credential's own
 * environment only. Every call needs the webhook:manage permission on an
 * OAuth credential; an API key has it.
 */
import { Client, CompanyOption, PageQuery, pageQuery } from "./client";
import { ValidationError } from "./errors";
import { segment } from "./segment";

/** The events an endpoint can subscribe to. */
export const WEBHOOK_EVENTS = [
  "invoice.authorized",
  "invoice.rejected",
  "invoice.cancelled",
  "invoice.corrected",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const SECRET_MIN = 16;
const SECRET_MAX = 255;
const URL_MAX = 500;

/** An endpoint to register. */
export interface WebhookEndpoint extends CompanyOption {
  /** An https:// URL, at most 500 characters. */
  url: string;
  /** 16 to 255 characters; signs every delivery and is never returned. */
  secret: string;
  /** What is sent, from WEBHOOK_EVENTS; left out, every event. */
  events?: readonly string[];
}

/** Client for the company's webhook endpoints. */
export class Webhooks extends Client {
  /**
   * Registers an HTTPS endpoint for this company's events.
   *
   * The secret signs every delivery; it is never returned again, so
   * keep it. The API refuses a URL that is not HTTPS or points at a
   * private network.
   */
  async create(endpoint: WebhookEndpoint): Promise<Record<string, unknown>> {
    const url = endpoint.url ?? "";
    if (!url.toLowerCase().startsWith("https://")) {
      throw new ValidationError("url must be an https:// URL");
    }
    if (url.length > URL_MAX) {
      throw new ValidationError(`url must be at most ${URL_MAX} characters`);
    }
    const secretLength = endpoint.secret?.length ?? 0;
    if (secretLength < SECRET_MIN || secretLength > SECRET_MAX) {
      throw new ValidationError(
        `secret must be ${SECRET_MIN} to ${SECRET_MAX} characters`
      );
    }

    const body: Record<string, unknown> = { url, secret: endpoint.secret };
    if (endpoint.events !== undefined) {
      if (!Array.isArray(endpoint.events)) {
        throw new ValidationError("events must be a list of event names");
      }
      const known: readonly string[] = WEBHOOK_EVENTS;
      const unknown = [
        ...new Set(endpoint.events.filter((event) => !known.includes(event))),
      ].sort();
      if (unknown.length > 0) {
        throw new ValidationError(
          `unknown events: ${unknown.join(", ")}. Known: ${known.join(", ")}`
        );
      }
      body.events = [...endpoint.events];
    }

    return this.request("POST", "/webhooks", {
      body,
      company: endpoint.company,
    });
  }

  /**
   * This company's endpoints in the credential's environment. A plain
   * list, not a page. Secrets are never returned.
   */
  async list(
    options: CompanyOption = {}
  ): Promise<Array<Record<string, unknown>>> {
    return this.requestList("GET", "/webhooks", { company: options.company });
  }

  /**
   * Stops delivery to one endpoint, keeping what was already sent. An
   * id this company does not have is an APIError 404.
   */
  async delete(
    endpointId: string,
    options: CompanyOption = {}
  ): Promise<void> {
    await this.send("DELETE", `/webhooks/${segment(endpointId)}`, {
      company: options.company,
    });
  }

  /**
   * Every delivery attempt in the credential's environment, a page.
   *
   * Each row has the event, its status, attempts, the endpoint's
   * response_status, last_error and when it was delivered or will be
   * tried again.
   */
  async deliveries(options: PageQuery = {}): Promise<Record<string, unknown>> {
    return this.request("GET", "/webhooks/deliveries", {
      query: pageQuery(options),
      company: options.company,
    });
  }
}
