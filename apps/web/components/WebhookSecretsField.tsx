"use client";

import { useState } from "react";
import { PCO_WEBHOOK_SUBSCRIPTIONS } from "@cco/shared/pco-webhooks";

const SECRET_MASK_DISPLAY = "•".repeat(20);
const PCO_WEBHOOKS_URL = "https://api.planningcenteronline.com/webhooks";

type WebhookSecretsFieldProps = {
  value: string;
  onChange: (value: string) => void;
  configured?: boolean;
  configuredCount?: number;
  placeholder?: string;
  helpText?: string;
};

export function WebhookSecretsField({
  value,
  onChange,
  configured = false,
  configuredCount = 0,
  placeholder = "Paste one authenticity_secret per line (same order as below)",
  helpText,
}: WebhookSecretsFieldProps) {
  const [focused, setFocused] = useState(false);
  const showMask = configured && value === "" && !focused;

  return (
    <label className="field secret-field">
      <span>Webhook secrets</span>
      <div className="setup-uri-list webhook-subscription-list">
        <p className="help-text">
          Create these subscriptions in{" "}
          <a href={PCO_WEBHOOKS_URL} target="_blank" rel="noreferrer">
            Planning Center webhooks
          </a>{" "}
          using the endpoint URL above. Paste each subscription&apos;s{" "}
          <code>authenticity_secret</code> below, one per line in this order:
        </p>
        <ol>
          {PCO_WEBHOOK_SUBSCRIPTIONS.map((subscription) => (
            <li key={subscription.eventType}>
              <span className="setup-uri-label">{subscription.label}</span>
              <code>{subscription.eventType}</code>
            </li>
          ))}
        </ol>
      </div>
      {showMask ? (
        <p className="secret-field-mask" aria-hidden="true">
          {configuredCount > 0
            ? `${configuredCount} secret(s) configured`
            : SECRET_MASK_DISPLAY}
        </p>
      ) : null}
      <textarea
        className="setup-form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="off"
        rows={4}
        spellCheck={false}
        placeholder={showMask ? undefined : placeholder}
      />
      {helpText ? <span className="help-text">{helpText}</span> : null}
    </label>
  );
}
