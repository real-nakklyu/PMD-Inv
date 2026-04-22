# Overdue Return Reminders

PMDInv includes a lightweight Vercel Cron endpoint for overdue return visibility.

## Endpoint

`GET /api/cron/overdue-returns`

The route scans return workflows that have been open for more than seven days and are not in a final returned/cancelled state. It writes an `activity_logs` reminder entry for each overdue return so dispatchers can see the reminders in the Activity page.

## Security

Set `CRON_SECRET` in Vercel and local development. The cron route rejects requests unless the `Authorization` header matches:

```text
Bearer <CRON_SECRET>
```

## Vercel schedule

The root `vercel.json` runs the check daily in the morning for Florida operations. Vercel Cron runs in production deployments only.

## Notes

- This first reminder flow logs activity instead of sending email/SMS.
- Future notification channels can read the same overdue query and send dispatcher emails, SMS, or Slack alerts.
- If duplicate daily reminder activity becomes noisy, add a small `notifications` table to enforce one reminder per return per day.
