import express from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

app.use(express.raw({ type: "application/json" }));

app.post("/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Stripe signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email;

    if (!email) return res.status(400).send("Missing email");

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase
      .from("user_profiles")
      .update({
        paying_status: "donated",
        donation_date: new Date().toISOString(),
      })
      .eq("email", email);

    if (error) {
      console.error("❌ Supabase update failed:", error.message);
      return res.status(500).send("Failed to update user");
    }

    console.log(`✅ Updated ${email} to donated`);
    return res.status(200).send("Success");
  }

  res.status(200).send("Unhandled event");
});

app.listen(port, () => {
  console.log(`✅ Webhook server running on port ${port}`);
});
