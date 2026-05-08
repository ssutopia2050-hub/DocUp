/**
 * cleanup_razorpay_subs.mjs
 *
 * Since subscription_id was never saved to MongoDB (Mongoose strict mode
 * dropped it silently), we query Razorpay directly for all subscriptions
 * and cancel any that are in a "created" or "authenticated" state
 * (i.e. mandate set up but never completed / paid).
 *
 * Run from project root:
 *   node cleanup_razorpay_subs.mjs
 */

import dotenv from "dotenv";
import Razorpay from "razorpay";

dotenv.config();

const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Razorpay returns max 100 per page — paginate through all
async function fetchAllSubscriptions() {
    const all = [];
    let skip = 0;
    const count = 100;

    while (true) {
        const page = await razorpay.subscriptions.all({ count, skip });
        const items = page.items || [];
        all.push(...items);
        if (items.length < count) break;
        skip += count;
    }
    return all;
}

async function main() {
    console.log("Fetching all subscriptions from Razorpay…\n");

    const subs = await fetchAllSubscriptions();
    console.log(`Total subscriptions found on Razorpay: ${subs.length}\n`);

    // Print a summary of all statuses first so you can see what's there
    const byStatus = {};
    for (const s of subs) {
        byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    }
    console.log("Status breakdown:");
    for (const [status, count] of Object.entries(byStatus)) {
        console.log(`  ${status}: ${count}`);
    }
    console.log();

    // Only cancel these — they hold a UPI mandate open but were never paid
    const STALE_STATUSES = ["created", "authenticated"];
    const stale = subs.filter(s => STALE_STATUSES.includes(s.status));

    console.log(`Stale subscriptions to cancel: ${stale.length}\n`);

    if (stale.length === 0) {
        console.log("Nothing to cancel.");
        return;
    }

    let cancelled = 0;
    let errors = 0;

    for (const sub of stale) {
        process.stdout.write(`  ${sub.id} (status: ${sub.status}) → `);
        try {
            await razorpay.subscriptions.cancel(sub.id);
            console.log("CANCELLED ✓");
            cancelled++;
        } catch (err) {
            console.log(`ERROR: ${err?.error?.description || err.message}`);
            errors++;
        }
    }

    console.log("\n─────────────────────────────────────");
    console.log(`Cancelled : ${cancelled}`);
    console.log(`Errors    : ${errors}`);
    console.log("─────────────────────────────────────");
    console.log("Done. Users can now create a fresh autopay mandate.");
}

main().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
});
