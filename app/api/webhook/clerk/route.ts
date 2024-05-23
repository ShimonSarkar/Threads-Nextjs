import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  addMemberToCommunity,
  createCommunity,
  deleteCommunity,
  removeUserFromCommunity,
  updateCommunityInfo,
} from '@/lib/actions/community.actions';

type EventType =
  | "organization.created"
  | "organizationInvitation.created"
  | "organizationMembership.created"
  | "organizationMembership.deleted"
  | "organization.updated"
  | "organization.deleted";

interface EventData {
  id?: string;
  name?: string;
  slug?: string;
  logo_url?: string;
  image_url?: string;
  created_by?: string;
  organization?: { id: string };
  public_user_data?: { user_id: string };
}

type Event = {
  data: EventData;
  object: "event";
  type: EventType;
};

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local');
  }

  // Get the headers
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occurred -- no svix headers', { status: 400 });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: Event;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as Event;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error occurred', { status: 400 });
  }

  const eventType: EventType = evt.type;

  try {
    switch (eventType) {
      case "organization.created":
        const { id, name, slug, logo_url, image_url, created_by } = evt.data;
        // @ts-ignore
        await createCommunity(id!, name!, slug!, logo_url || image_url, "org bio", created_by!);
        return new Response('Organization created', { status: 201 });

      case "organizationInvitation.created":
        console.log("Invitation created", evt.data);
        return new Response('Invitation created', { status: 201 });

      case "organizationMembership.created":
        const { organization, public_user_data } = evt.data;
        console.log("created", evt.data);
        await addMemberToCommunity(organization!.id, public_user_data!.user_id);
        return new Response('Membership created', { status: 201 });

      case "organizationMembership.deleted":
        const { organization: orgDel, public_user_data: userDel } = evt.data;
        console.log("removed", evt.data);
        await removeUserFromCommunity(userDel!.user_id, orgDel!.id);
        return new Response('Member removed', { status: 201 });

      case "organization.updated":
        const { id: updId, logo_url: updLogoUrl, name: updName, slug: updSlug } = evt.data;
        console.log("updated", evt.data);
        await updateCommunityInfo(updId!, updName!, updSlug!, updLogoUrl!);
        return new Response('Organization updated', { status: 201 });

      case "organization.deleted":
        const { id: delId } = evt.data;
        console.log("deleted", evt.data);
        await deleteCommunity(delId!);
        return new Response('Organization deleted', { status: 201 });

      default:
        return new Response('Unhandled event type', { status: 400 });
    }
  } catch (err) {
    console.error("Internal Server Error:", err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
