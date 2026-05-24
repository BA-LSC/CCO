"use client";

import { useState } from "react";
import { PCO_WEBHOOK_SUBSCRIPTIONS } from "@cco/shared/pco-webhooks";
import { secretMaskLines } from "@/lib/secret-field-mask";

const PCO_WEBHOOKS_URL = "https://api.planningcenteronline.com/webhooks";

type WebhookSecretsFieldProps = {
  value: string;
  onChange: (value: string) => void;
  configured?: boolean;
  secretCount?: number;
  placeholder?: string;
  helpText?: string;
};

export function WebhookSecretsField({
  value,
  onChange,
  configured = false,
  secretCount = 1,
  placeholder = "Paste one secret per line (same order as below)",
  helpText,
}: WebhookSecretsFieldProps) {
  const [focused, setFocused] = useState(false);
  const showMask = configured && value === "" && !focused;

  return (
    <div className="integrations-field">
      <span className="integrations-field-label">Webhook secrets</span>

      <details className="integrations-details">
        <summary>Subscription events to create in Planning Center</summary>
        <div className="integrations-details-body">
          <p className="integrations-field-hint">
            Create subscriptions in{" "}
            <a href={PCO_WEBHOOKS_URL} target="_blank" rel="noreferrer">
              Planning Center webhooks
            </a>{" "}
            using your webhook URL. Paste each <code>authenticity_secret</code> below, one per
            line in this order:
          </p>
          <ol className="integrations-event-list">
            {PCO_WEBHOOK_SUBSCRIPTIONS.map((subscription) => (
              <li key={subscription.eventType}>
                <span>{subscription.label}</span>
                <code>{subscription.eventType}</code>
              </li>
            ))}
          </ol>
        </div>
      </details>

      <textarea
        className="integrations-input integrations-textarea"
        value={showMask ? secretMaskLines(secretCount) : value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="off"
        rows={4}
        spellCheck={false}
        placeholder={showMask ? undefined : placeholder}
      />
      {helpText ? <p className="integrations-field-hint">{helpText}</p> : null}
    </div>
  );
}
