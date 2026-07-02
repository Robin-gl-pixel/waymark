import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';

const SLACK_REPORT_WEBHOOK = defineSecret('SLACK_REPORT_WEBHOOK');

/**
 * onCreate(`reports/{reportId}`) → POST the report body to a private Slack
 * channel so Robin can review manually (V1 moderation posture — see #15
 * + docs/PRD.md V1 Social Layer).
 *
 * The webhook URL is loaded from the `SLACK_REPORT_WEBHOOK` secret. Set it
 * before the first deploy with:
 *   firebase functions:secrets:set SLACK_REPORT_WEBHOOK
 * If the secret is empty at runtime we log + return — a missing config
 * shouldn't fail the doc write from the client's perspective (the report
 * itself is durably stored in Firestore either way).
 */
export const onReportCreated = onDocumentCreated(
  {
    document: 'reports/{reportId}',
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 30,
    secrets: [SLACK_REPORT_WEBHOOK],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const report = snap.data() as {
      reporterUid?: string;
      targetUid?: string;
      targetLieuId?: string | null;
      reason?: string;
      freeText?: string | null;
      status?: string;
    };

    const webhook = SLACK_REPORT_WEBHOOK.value();
    if (!webhook) {
      console.warn('[onReportCreated] SLACK_REPORT_WEBHOOK not set; skipping Slack notify', {
        reportId: event.params.reportId,
      });
      return;
    }

    const lines = [
      `*New Waymark report* — \`${event.params.reportId}\``,
      `• Reason: *${report.reason ?? 'unknown'}*`,
      `• Reporter: \`${report.reporterUid ?? '?'}\``,
      `• Target user: \`${report.targetUid ?? '?'}\``,
      report.targetLieuId ? `• Target lieu: \`${report.targetLieuId}\`` : null,
      report.freeText ? `• Notes: ${report.freeText}` : null,
    ].filter(Boolean);

    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lines.join('\n') }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn('[onReportCreated] Slack webhook non-2xx', {
          status: res.status,
          body: body.slice(0, 200),
        });
      }
    } catch (err) {
      // Never rethrow — the report is already persisted; Slack is a courtesy notify.
      console.error('[onReportCreated] Slack webhook threw', err);
    }
  },
);
