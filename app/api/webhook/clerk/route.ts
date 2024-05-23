/* eslint-disable camelcase */
// Resource: https://clerk.com/docs/users/sync-data-to-your-backend
// Above article shows why we need webhooks i.e., to sync data to our backend

// Resource: https://docs.svix.com/receiving/verifying-payloads/why
// It's a good practice to verify webhooks. Above article shows why we should do it
import { Webhook, WebhookRequiredHeaders } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { IncomingHttpHeaders } from "http";
import {
  addMemberToCommunity,
  createCommunity,
  deleteCommunity,
  removeUserFromCommunity,
  updateCommunityInfo,
} from "@/lib/actions/community.actions";

// Resource: https://clerk.com/docs/integration/webhooks#supported-events
// Above document lists the supported events
type EventType =
  | "organization.created"
  | "organizationInvitation.created"
  | "organizationMembership.created"
  | "organizationMembership.deleted"
  | "organization.updated"
  | "organization.deleted";

type Event = {
  data: Record<string, any>;
  object: "event";
  type: EventType;
};

export const POST = async (request: Request) => {
  const payload = await request.json();
  const header = headers();

  const heads: IncomingHttpHeaders & WebhookRequiredHeaders = {
    "svix-id": header.get("svix-id") as string,
    "svix-timestamp": header.get("svix-timestamp") as string,
    "svix-signature": header.get("svix-signature") as string,
  };

  if (!heads["svix-id"] || !heads["svix-timestamp"] || !heads["svix-signature"]) {
    return NextResponse.json({ message: "Missing headers" }, { status: 400 });
  }

  const wh = new Webhook(process.env.NEXT_CLERK_WEBHOOK_SECRET || "");

  let evnt: Event;

  try {
    evnt = wh.verify(JSON.stringify(payload), heads) as Event;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return NextResponse.json({ message: "Invalid webhook signature" }, { status: 400 });
  }

  const eventType: EventType = evnt.type;

  try {
    switch (eventType) {
      case "organization.created":
        const { id, name, slug, logo_url, image_url, created_by } = evnt.data;
        await createCommunity(id, name, slug, logo_url || image_url, "org bio", created_by);
        return NextResponse.json({ message: "Organization created" }, { status: 201 });

      case "organizationInvitation.created":
        console.log("Invitation created", evnt.data);
        return NextResponse.json({ message: "Invitation created" }, { status: 201 });

      case "organizationMembership.created":
        const { organization, public_user_data } = evnt.data;
        await addMemberToCommunity(organization.id, public_user_data.user_id);
        return NextResponse.json({ message: "Membership created" }, { status: 201 });

      case "organizationMembership.deleted":
        const { organization: org, public_user_data: user } = evnt.data;
        await removeUserFromCommunity(user.user_id, org.id);
        return NextResponse.json({ message: "Member removed" }, { status: 201 });

      case "organization.updated":
        const { id: orgId, name: orgName, slug: orgSlug, logo_url: orgLogo } = evnt.data;
        await updateCommunityInfo(orgId, orgName, orgSlug, orgLogo);
        return NextResponse.json({ message: "Organization updated" }, { status: 201 });

      case "organization.deleted":
        const { id: delOrgId } = evnt.data;
        await deleteCommunity(delOrgId);
        return NextResponse.json({ message: "Organization deleted" }, { status: 201 });

      default:
        return NextResponse.json({ message: "Unhandled event type" }, { status: 400 });
    }
  } catch (err) {
    console.error("Error handling event:", err);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
};
